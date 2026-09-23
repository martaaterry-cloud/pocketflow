-- ==========================================================================
-- Migration: 20260923140000_cash_transactions.sql
-- Pocketflow: Módulo de Efectivo (Movimientos de dinero físico independiente)
-- ==========================================================================

-- 1. Tabla de movimientos de efectivo
create table if not exists public.cash_transactions (
    id text not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    type text not null check (type in ('income', 'expense', 'adjustment')),
    amount numeric(12, 2) not null,
    description text not null,
    date timestamptz not null default now(),
    category_id text,
    note text,
    bank_transaction_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (id, user_id),
    constraint check_cash_amount check (
        (type in ('income', 'expense') and amount > 0)
        or
        (type = 'adjustment' and amount <> 0)
    )
);

-- 2. Índices de alto rendimiento para consultas, filtros y reconciliación
create index if not exists idx_cash_transactions_user_id
    on public.cash_transactions(user_id);

create index if not exists idx_cash_transactions_date
    on public.cash_transactions(user_id, date desc);

create index if not exists idx_cash_transactions_bank_tx
    on public.cash_transactions(bank_transaction_id, user_id);

create index if not exists idx_cash_transactions_category
    on public.cash_transactions(category_id, user_id);

-- 3. Habilitar Row Level Security (RLS) y políticas de aislamiento multi-tenant
alter table public.cash_transactions enable row level security;

drop policy if exists "Users can manage own cash transactions" on public.cash_transactions;
create policy "Users can manage own cash transactions"
    on public.cash_transactions
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 4. Trigger para sincronizar updated_at automáticamente
drop trigger if exists trigger_set_updated_at_cash_transactions on public.cash_transactions;
create trigger trigger_set_updated_at_cash_transactions
    before update on public.cash_transactions
    for each row
    execute function public.set_updated_at();

-- 5. Configuración para Supabase Realtime con REPLICA IDENTITY FULL
alter table public.cash_transactions replica identity full;

-- Añadir a la publicación de forma idempotente
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cash_transactions'
  ) then
    alter publication supabase_realtime add table public.cash_transactions;
  end if;
end $$;
