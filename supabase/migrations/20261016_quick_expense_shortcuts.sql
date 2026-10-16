create table if not exists public.quick_expense_shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  icon_key text not null default 'receipt',
  amount numeric(12,2) not null check (amount > 0),
  category_id text not null,
  payment_method text not null default 'bank' check (payment_method in ('bank','bizum','cash')),
  account_id text,
  pinned boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quick_expense_shortcuts_user_order_idx on public.quick_expense_shortcuts(user_id,position,created_at);
alter table public.quick_expense_shortcuts enable row level security;
create policy "Users manage own quick expense shortcuts" on public.quick_expense_shortcuts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Non-destructive migration: only existing users with a matching Rafa forecast receive this button.
insert into public.quick_expense_shortcuts (user_id,name,icon_key,amount,category_id,payment_method,account_id,pinned,position)
select e.user_id, 'Gimnasio Rafa', 'dumbbell', 1.50, e.category_id, 'bank', 'daily', true, 0
from public.variable_expense_estimates e
where lower(e.name) like '%rafa%' and (lower(e.name) like '%gimnasio%' or lower(e.name) like '%gym%' or lower(e.name) like '%entren%')
and not exists (select 1 from public.quick_expense_shortcuts s where s.user_id=e.user_id and lower(s.name)='gimnasio rafa');

-- Deliver cross-device changes to authenticated clients via Realtime.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_expense_shortcuts') then
    alter publication supabase_realtime add table public.quick_expense_shortcuts;
  end if;
end $$;
