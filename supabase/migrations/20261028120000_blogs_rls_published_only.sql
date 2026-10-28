-- Anon (web pública) solo lee posts publicados; el admin (sesión authenticated) ve todo.
drop policy if exists blogs_public_read on public.blogs;
create policy blogs_anon_read_published on public.blogs for select to anon using (is_published = true);
create policy blogs_authenticated_read on public.blogs for select to authenticated using (true);
