-- admin_set_client_participants: aplica los mismos participantes (holder_participants)
-- a TODAS las propiedades asignadas de un cliente, de una vez. Lo usa el admin al
-- añadir un cotitular a una ficha que ya tiene propiedades (repartir % en todas).
-- Solo actualiza holder_participants; no toca importes/fechas/estado.
create or replace function public.admin_set_client_participants(p_user_id text, p_client_id text, p_participants jsonb)
 returns json language plpgsql security definer as $function$
declare v_user admin_users%rowtype; v_n int;
begin
  select * into v_user from admin_users where id::text=p_user_id and is_active=true and lower(username)=lower(coalesce(app_email(),''));
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  update client_projects set holder_participants = p_participants where client_id::text = p_client_id;
  get diagnostics v_n = row_count;
  return json_build_object('success',true,'updated',v_n);
end; $function$;
