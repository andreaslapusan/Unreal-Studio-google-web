-- Auditoría 2026-06-21: arreglos versionados (ya aplicados en vivo).
-- 1) Repo/prod drift: client_claim_payment y client_change_password endurecidos
--    (derivan identidad de app_email(), ignoran p_client_id para autorización).
-- 2) notify-report: secreto compartido. La RPC envía x-notify-secret leído de
--    app_secrets; la edge fn lo exige. El VALOR del secreto NO va en el repo
--    (se fija con supabase secrets set + insert en app_secrets fuera de control de versiones).

create table if not exists app_secrets(key text primary key, value text not null, updated_at timestamptz default now());
alter table app_secrets enable row level security;
-- Sin políticas: solo SECURITY DEFINER / service_role pueden leerla.

create or replace function public.client_claim_payment(p_client_id uuid, p_payment_id uuid, p_note text default null::text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_client clients%rowtype; v_label text;
begin
  if app_email() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_client from clients where lower(email)=app_email() and is_active = true limit 1;
  if v_client.id is null then return json_build_object('success', false, 'error', 'not a client'); end if;
  if not exists (
    select 1 from client_payments pay
    join client_projects cp on cp.id = pay.client_project_id
    where pay.id = p_payment_id and cp.client_id = v_client.id
  ) then return json_build_object('success', false, 'error', 'pago no pertenece al cliente'); end if;
  select cp.label into v_label from client_payments cp where cp.id = p_payment_id;
  insert into client_activity(client_id, event, detail, metadata)
    values (v_client.id, 'payment_claim', coalesce('Marcó como pagado: '||v_label,'Avisó de un pago'),
            jsonb_build_object('payment_id', p_payment_id, 'note', p_note));
  perform notify('payment_claim', v_client.name || ' dice que ya pagó',
    coalesce('Pago: '||v_label,'') || coalesce(' · '||p_note,''), 'action',
    'client_payment', p_payment_id::text, v_client.name, v_client.email,
    jsonb_build_object('payment_id', p_payment_id, 'client_id', v_client.id));
  return json_build_object('success', true);
end; $function$;

create or replace function public.client_change_password(p_client_id text, p_old_password text, p_new_password text)
 returns json language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_client clients%rowtype;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where lower(email)=app_email() and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','Client not found'); end if;
  if not ((v_client.temp_password is not null and v_client.temp_password<>'' and v_client.temp_password=p_old_password)
       or (v_client.password_hash is not null and v_client.password_hash=crypt(p_old_password,v_client.password_hash)))
  then return json_build_object('success',false,'error','Contraseña actual incorrecta'); end if;
  update clients set password_hash=crypt(p_new_password,gen_salt('bf')), temp_password=null,
    must_change_password=false, password_plain=p_new_password where id=v_client.id;
  return json_build_object('success',true);
end $function$;

create or replace function public.employee_post_construction_report(p_project_id uuid, p_report_date date, p_pdf_url text, p_path text, p_file_name text, p_file_size bigint)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_allowed boolean; v_update_id uuid; v_title text; v_email text; v_secret text;
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
  begin
    select value into v_secret from app_secrets where key='notify_report_secret';
    perform net.http_post(
      url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/notify-report',
      headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', coalesce(v_secret,'')),
      body := jsonb_build_object('project_id', p_project_id, 'report_date', p_report_date)
    );
  exception when others then null;
  end;
  return json_build_object('success',true,'update_id',v_update_id);
end $function$;
