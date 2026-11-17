-- 17-nov: the honeypot (company_url) was silently dropping real signups — Chrome autofill fills hidden
-- "Company URL" inputs (Mark Kelly & Associates got {"status":"ok"} and no row). Now a filled honeypot
-- still saves the application, flagged in auto_check, and is never auto-approved (admin reviews it).
-- auto_check->>'no_auto' = 'true' also lets ops insert manual applications without auto-approval.
CREATE OR REPLACE FUNCTION public.agency_apply(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_hdr   jsonb;
  v_ip    text;
  v_id    uuid;
  v_web   text := nullif(trim(coalesce(p->>'website', '')), '');
  v_lang  text := coalesce(nullif(p->>'lang', ''), 'es');
  v_hp    boolean;
begin
  v_hp := coalesce(p->>'company_url', '') <> ''; -- honeypot: flag + manual review, never drop
  if coalesce((p->>'elapsed_ms')::bigint, 0) < 3000 then return jsonb_build_object('status', 'too_fast'); end if;
  if coalesce((p->>'accept_terms')::boolean, false) is not true then return jsonb_build_object('status', 'terms_required'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then return jsonb_build_object('status', 'invalid_email'); end if;
  if length(trim(coalesce(p->>'agency_name', ''))) = 0 then return jsonb_build_object('status', 'name_required'); end if;
  if v_lang not in ('es','en','ro','id') then v_lang := 'en'; end if;
  if exists (select 1 from listing_partners where lower(email) = v_email and status in ('approved','suspended') and deleted_at is null) then
    return jsonb_build_object('status', 'already_partner');
  end if;
  if exists (select 1 from listing_partner_applications where lower(email) = v_email and status = 'pending') then
    return jsonb_build_object('status', 'already_pending');
  end if;
  begin v_hdr := current_setting('request.headers', true)::jsonb; exception when others then v_hdr := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_hdr->>'cf-connecting-ip', v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is not null and (select count(*) from listing_partner_applications
                            where ip = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if v_web is not null and v_web !~* '^https?://' then v_web := 'https://' || v_web; end if;

  insert into listing_partner_applications (
    agency_name, manager_name, email, phone, whatsapp, website, country, projects_interested,
    experience, monthly_volume, source, notes, status, ref_token, campaign, market, lang,
    utm_source, utm_medium, utm_campaign, accepted_terms_at, terms_version, ip, user_agent, auto_check)
  values (
    trim(p->>'agency_name'), nullif(trim(coalesce(p->>'manager_name', '')), ''), v_email,
    nullif(trim(coalesce(p->>'phone', '')), ''), nullif(trim(coalesce(p->>'whatsapp', '')), ''), v_web,
    nullif(trim(coalesce(p->>'country', '')), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'projects_interested', '[]'::jsonb))), '{}'),
    nullif(trim(coalesce(p->>'experience', '')), ''), nullif(trim(coalesce(p->>'monthly_volume', '')), ''),
    coalesce(nullif(trim(coalesce(p->>'source', '')), ''), nullif(p->>'utm_source', ''), 'web'),
    nullif(trim(coalesce(p->>'notes', '')), ''), 'pending',
    nullif(p->>'ref', ''), nullif(p->>'campaign', ''), nullif(p->>'market', ''), v_lang,
    nullif(p->>'utm_source', ''), nullif(p->>'utm_medium', ''), nullif(p->>'utm_campaign', ''),
    now(), agency_cfg('terms_version') #>> '{}', v_ip, left(v_hdr->>'user-agent', 500),
    case when v_hp then jsonb_build_object('honeypot', left(p->>'company_url', 200), 'no_auto', true) end)
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id,
                            'auto', not v_hp and coalesce((agency_cfg('auto_approve') #>> '{}')::boolean, false));
exception
  when unique_violation then return jsonb_build_object('status', 'already_pending');
  when check_violation  then return jsonb_build_object('status', 'invalid');
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lpa_hooks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and coalesce((agency_cfg('auto_approve') #>> '{}')::boolean, false)
       and coalesce(new.auto_check->>'no_auto', '') <> 'true' then
      perform agency_hub_post(jsonb_build_object('action', 'approve', 'mode', 'auto', 'application_id', new.id));
    end if;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform agency_hub_post(jsonb_build_object('action', 'event', 'table', 'listing_partner_applications', 'event', 'rejected', 'id', new.id));
  end if;
  return new;
end;
$function$;
