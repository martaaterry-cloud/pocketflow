-- ==========================================================================
-- Migration: 20260924100000_cash_shared_expenses.sql
-- Pocketflow: Gastos compartidos en Efectivo (CashTransaction + ExpenseShare)
-- ==========================================================================

-- 1. Añadir columna is_shared a cash_transactions
alter table public.cash_transactions
  add column if not exists is_shared boolean not null default false;

-- 2. Eliminar la restricción de foreign key rígida a transactions si existe para permitir tanto transacciones bancarias como de efectivo
alter table public.expense_shares
  drop constraint if exists expense_shares_expense_transaction_id_user_id_fkey;

-- 3. Índice para acelerar búsquedas de partes por ID de transacción (sea banco o efectivo)
create index if not exists idx_expense_shares_tx_user
  on public.expense_shares(expense_transaction_id, user_id);
