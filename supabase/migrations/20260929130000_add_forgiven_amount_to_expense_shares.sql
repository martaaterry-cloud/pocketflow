-- ==========================================================================
-- PocketFlow: Soporte de deudas perdonadas/ajustadas en ExpenseShare
-- ==========================================================================

-- 1. Ampliación de expense_shares con la columna forgiven_amount
alter table public.expense_shares
  add column if not exists forgiven_amount numeric(12,2) not null default 0.00 check (forgiven_amount >= 0);

-- 2. Índice de rendimiento para consultas de estado de deudas
create index if not exists idx_expense_shares_forgiven on public.expense_shares(forgiven_amount, user_id);
