-- ==========================================================================
-- Pocketflow: Comprehensive Schema Reconciliation & Foreign Key Shield
-- ==========================================================================

-- 1. Reconciliación de recurring_payments
-- Permitir category_id nulo para ingresos recurrentes o categorías eliminadas
alter table public.recurring_payments
  alter column category_id drop not null;

-- Columnas de recurring_payments
alter table public.recurring_payments
  add column if not exists type text check (type in ('expense', 'income')) default 'expense',
  add column if not exists income_source_type text default null check (
    income_source_type is null or income_source_type in ('salary', 'pension', 'rental', 'benefit', 'other')
  ),
  add column if not exists is_shared boolean not null default false,
  add column if not exists sharing_template jsonb default null,
  add column if not exists installments_count integer default null;

-- 2. Reconciliación de transactions
alter table public.transactions
  add column if not exists special_type text check (special_type in ('normal', 'cash_withdrawal', 'reimbursement', 'transfer')) default 'normal',
  add column if not exists expense_nature text check (expense_nature in ('fixed', 'variable', 'extraordinary')) default null,
  add column if not exists gift_recipient text default null,
  add column if not exists income_kind text check (income_kind in ('income', 'reimbursement')) default 'income',
  add column if not exists parent_expense_id text default null,
  add column if not exists expense_share_id text default null,
  add column if not exists is_shared boolean not null default false;

-- 3. Índices de rendimiento
create index if not exists idx_recurring_payments_user_date on public.recurring_payments(user_id, next_date);
create index if not exists idx_recurring_payments_user_cat on public.recurring_payments(user_id, category_id);
