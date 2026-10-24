-- Flyer affiché à l’ouverture de l’application client.
-- Durée portée par ends_at. Un seul flyer actif à la fois côté application.

create table if not exists public.client_flyers (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'hurghada_dream_0606',
  image_url text not null,
  description text not null default '',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_name text not null default ''
);

create index if not exists client_flyers_active_idx
  on public.client_flyers (site_key, active, ends_at desc);

alter table public.client_flyers enable row level security;

create policy "client_flyers_select"
  on public.client_flyers for select to public using (true);
create policy "client_flyers_insert"
  on public.client_flyers for insert to public with check (true);
create policy "client_flyers_update"
  on public.client_flyers for update to public using (true) with check (true);
create policy "client_flyers_delete"
  on public.client_flyers for delete to public using (true);

grant select, insert, update, delete on table public.client_flyers to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-flyers',
  'client-flyers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "client_flyers_storage_read"
  on storage.objects for select to public
  using (bucket_id = 'client-flyers');
create policy "client_flyers_storage_insert"
  on storage.objects for insert to public
  with check (bucket_id = 'client-flyers');
create policy "client_flyers_storage_delete"
  on storage.objects for delete to public
  using (bucket_id = 'client-flyers');
