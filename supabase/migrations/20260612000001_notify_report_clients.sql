-- Aviso por email a los clientes asignados cuando se sube un REPORTE DE OBRA.
--
-- Al subir un reporte (employee_post_construction_report), se llama por
-- net.http_post a la edge fn `notify-report`, que busca los clientes asignados
-- a ese proyecto (client_projects → clients) y les manda un email branded en su
-- idioma diciendo que ya tienen el reporte disponible en su portal. Un cliente
-- con 2 propiedades recibe un aviso por cada reporte (uno por propiedad).
--
-- ⚠️ INTERRUPTOR: la edge fn solo envía si el secret REPORT_NOTIFY_ENABLED='true'.
-- Mientras esté apagado, no manda nada (respeta el "no enviar a clientes hasta el
-- super OK de Andreas"); solo informa a cuántos avisaría.
--
-- Esta migración deja constancia en el repo del CREATE OR REPLACE ya aplicado en
-- vivo vía Management API (la función original no estaba en migraciones).

CREATE OR REPLACE FUNCTION public.employee_post_construction_report(p_project_id uuid, p_report_date date, p_pdf_url text, p_path text, p_file_name text, p_file_size bigint)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_allowed boolean; v_update_id uuid; v_title text; v_email text;
begin
  v_email := app_email();
  if v_email is null then return json_build_object('success',false,'error','no session'); end if;
  select ("current_role"() = any(array['admin','team']))
      or exists(select 1 from employees e where lower(e.email)=lower(v_email) and e.can_upload_reports)
    into v_allowed;
  if not coalesce(v_allowed,false) then return json_build_object('success',false,'error','no permission'); end if;
  if not exists(select 1 from projects where id=p_project_id) then
    return json_build_object('success',false,'error','project not found'); end if;
  v_title := 'Reporte de obra | ' || to_char(p_report_date,'DD Mon YYYY');
  insert into property_updates(property_id,title,posted_by,visibility,posted_at,pct_progress_at_update)
    values(p_project_id, v_title, v_email, 'all', (p_report_date::timestamptz + interval '12 hours'), null)
    returning id into v_update_id;
  insert into update_assets(update_id,asset_type,storage_path,external_url,file_name,file_size,mime_type,position)
    values(v_update_id,'pdf',p_path,p_pdf_url,p_file_name,p_file_size,'application/pdf',0);
  update projects set construction_update_url=p_pdf_url, construction_update_date=p_report_date where id=p_project_id;
  -- Aviso a clientes (fire-and-forget; gated por REPORT_NOTIFY_ENABLED en la fn).
  begin
    perform net.http_post(
      url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/notify-report',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('project_id', p_project_id, 'report_date', p_report_date)
    );
  exception when others then null;
  end;
  return json_build_object('success',true,'update_id',v_update_id);
end $function$;
