-- ==========================================================================
-- Pocketflow: Enable Realtime publication, REPLICA IDENTITY, and updated_at triggers
-- ==========================================================================

-- 1. Trigger function para actualizar updated_at automáticamente
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Triggers de updated_at para cada tabla
drop trigger if exists trigger_set_updated_at_accounts on public.accounts;
create trigger trigger_set_updated_at_accounts
  before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_categories on public.categories;
create trigger trigger_set_updated_at_categories
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_transactions on public.transactions;
create trigger trigger_set_updated_at_transactions
  before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_budgets on public.budgets;
create trigger trigger_set_updated_at_budgets
  before update on public.budgets
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_goals on public.savings_goals;
create trigger trigger_set_updated_at_goals
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_reserves on public.reserves;
create trigger trigger_set_updated_at_reserves
  before update on public.reserves
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_recurring on public.recurring_payments;
create trigger trigger_set_updated_at_recurring
  before update on public.recurring_payments
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_periods on public.special_periods;
create trigger trigger_set_updated_at_periods
  before update on public.special_periods
  for each row execute function public.set_updated_at();

drop trigger if exists trigger_set_updated_at_plan on public.financial_plan_settings;
create trigger trigger_set_updated_at_plan
  before update on public.financial_plan_settings
  for each row execute function public.set_updated_at();

-- 3. Configurar REPLICA IDENTITY FULL para capturar registros en DELETE y UPDATE
alter table public.accounts replica identity full;
alter table public.categories replica identity full;
alter table public.transactions replica identity full;
alter table public.budgets replica identity full;
alter table public.savings_goals replica identity full;
alter table public.reserves replica identity full;
alter table public.recurring_payments replica identity full;
alter table public.special_periods replica identity full;
alter table public.financial_plan_settings replica identity full;

-- 4. Añadir las tablas a la publicación supabase_realtime para eventos WebSocket
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'accounts'
  ) then
    alter publication supabase_realtime add table public.accounts;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'budgets'
  ) then
    alter publication supabase_realtime add table public.budgets;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'savings_goals'
  ) then
    alter publication supabase_realtime add table public.savings_goals;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'reserves'
  ) then
    alter publication supabase_realtime add table public.reserves;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'recurring_payments'
  ) then
    alter publication supabase_realtime add table public.recurring_payments;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'special_periods'
  ) then
    alter publication supabase_realtime add table public.special_periods;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'financial_plan_settings'
  ) then
    alter publication supabase_realtime add table public.financial_plan_settings;
  end if;
end
$$;
