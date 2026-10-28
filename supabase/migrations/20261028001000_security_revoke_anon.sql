revoke select on public.property_updates, public.update_assets from anon;
revoke all on public.project_price_audit, public.investors, public.investor_units, public.investor_payments from anon;
revoke execute on function public.verify_client_login(text,text,text) from anon, public;
revoke execute on function public.verify_admin_login(text,text) from anon, public;
