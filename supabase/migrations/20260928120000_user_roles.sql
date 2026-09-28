-- ==========================================================================
-- Pocketflow: User Profiles role column with RLS and Security Protections
-- ==========================================================================

-- 1. Add role column to profiles with default 'user' and constraint
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'role'
  ) then
    alter table public.profiles
      add column role text not null default 'user' check (role in ('user', 'admin'));
  end if;
end $$;

-- 2. Trigger function to prevent privilege escalation from client-side requests
create or replace function public.protect_profile_role()
returns trigger as $$
begin
  -- Peticiones normales de usuarios autenticados desde el cliente
  if auth.role() = 'authenticated' then
    if TG_OP = 'INSERT' then
      NEW.role := 'user';
    elsif TG_OP = 'UPDATE' then
      NEW.role := OLD.role;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- 3. Attach trigger to public.profiles before insert or update
drop trigger if exists trigger_protect_profile_role on public.profiles;
create trigger trigger_protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();
