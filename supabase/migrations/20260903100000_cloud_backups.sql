-- ==========================================================================
-- Pocketflow: Cloud Backups table with RLS
-- ==========================================================================

create table if not exists public.cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reason text not null check (reason in ('auto', 'manual', 'pre_restore')),
  schema_version integer not null,
  app_version text not null,
  payload jsonb not null,
  summary jsonb
);

-- Row Level Security
alter table public.cloud_backups enable row level security;

drop policy if exists "Users can select own cloud backups" on public.cloud_backups;
create policy "Users can select own cloud backups"
  on public.cloud_backups for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own cloud backups" on public.cloud_backups;
create policy "Users can insert own cloud backups"
  on public.cloud_backups for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cloud backups" on public.cloud_backups;
create policy "Users can delete own cloud backups"
  on public.cloud_backups for delete
  using (auth.uid() = user_id);

-- Índices de consulta eficiente
create index if not exists idx_cloud_backups_user_created
  on public.cloud_backups(user_id, created_at desc);
