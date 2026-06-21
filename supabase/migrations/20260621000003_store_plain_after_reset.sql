-- Tras un "olvidé contraseña" (Supabase Auth updateUser), guarda también el texto
-- plano en la ficha para que el admin lo siga viendo en tiempo real (Andreas lo
-- exige). Solo afecta a la PROPIA cuenta (derivada de app_email()), nunca a otra.
create or replace function public.portal_store_plain_password(p_new text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_email text; v_done text := '';
begin
  v_email := app_email();
  if v_email is null then return json_build_object('success',false,'error','no session'); end if;
  if p_new is null or length(p_new) < 6 then return json_build_object('success',false,'error','weak'); end if;
  update clients set password_plain=p_new, temp_password=null, must_change_password=false
    where lower(email)=v_email;
  if found then v_done := 'client'; end if;
  update employees set password=p_new where lower(email)=v_email;
  if found and v_done='' then v_done := 'employee'; end if;
  return json_build_object('success',true,'updated',v_done);
end $function$;
grant execute on function public.portal_store_plain_password(text) to authenticated;
