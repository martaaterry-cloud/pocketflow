-- Nóminas informativas: historial append-only, completamente separado del libro financiero.
begin;

create table if not exists public.payroll_events (
  id text not null check (id ~ '^(legacy-[a-f0-9]{64}|[a-fA-F0-9]{8}-([a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12})$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind text not null check (kind in ('save', 'delete', 'legacy')),
  gross numeric,
  social_security numeric,
  irpf numeric,
  net numeric,
  client_created_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  sequence bigint generated always as identity,
  primary key (user_id, id),
  constraint payroll_values_valid check (
    (kind = 'delete' and gross is null and social_security is null and irpf is null and net is null)
    or
    (kind in ('save', 'legacy') and gross is not null and social_security is not null and irpf is not null and net is not null
      and gross between 0 and 1000000000000 and social_security between 0 and 1000000000000
      and net between 0 and 1000000000000 and irpf between 0 and 100
      and abs(gross - social_security - gross * irpf / 100 - net) <= 0.100000001)
  )
);

create index if not exists payroll_events_user_sequence on public.payroll_events(user_id, sequence);
create index if not exists payroll_events_user_month on public.payroll_events(user_id, month);
alter table public.payroll_events enable row level security;
alter table public.payroll_events force row level security;
revoke all on public.payroll_events from anon, authenticated;
grant select, insert on public.payroll_events to authenticated;
grant usage on sequence public.payroll_events_sequence_seq to authenticated;

drop policy if exists payroll_select_own on public.payroll_events;
create policy payroll_select_own on public.payroll_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists payroll_insert_own on public.payroll_events;
create policy payroll_insert_own on public.payroll_events for insert to authenticated with check ((select auth.uid()) = user_id);
-- Sin UPDATE/DELETE: las modificaciones y eliminaciones son nuevas versiones.

create or replace function public.payroll_set_created_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.payroll_set_created_at() from public;
drop trigger if exists payroll_created_at on public.payroll_events;
create trigger payroll_created_at before insert on public.payroll_events for each row execute function public.payroll_set_created_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payroll_events'
  ) then
    alter publication supabase_realtime add table public.payroll_events;
  end if;
end;
$$;
commit;
