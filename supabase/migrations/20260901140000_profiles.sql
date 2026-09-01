-- ==========================================================================
-- Pocketflow: User Profiles table with RLS and Realtime
-- ==========================================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Row Level Security
alter table public.profiles enable row level security;

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = user_id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trigger updated_at
drop trigger if exists trigger_set_updated_at_profiles on public.profiles;
create trigger trigger_set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Realtime Publication
alter publication supabase_realtime add table public.profiles;
