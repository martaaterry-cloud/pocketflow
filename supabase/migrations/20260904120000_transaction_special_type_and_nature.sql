-- ==========================================================================
-- Pocketflow: Special Movement Type, Expense Nature and Recurring Income
-- ==========================================================================

-- 1. Ampliación de transactions para soporte de tipo especial y naturaleza de gasto
alter table public.transactions
  add column if not exists special_type text check (special_type in ('normal', 'cash_withdrawal', 'reimbursement', 'transfer')) default 'normal',
  add column if not exists expense_nature text check (expense_nature in ('fixed', 'variable', 'extraordinary')) default null;

-- 2. Ampliación de recurring_payments para soporte de ingresos recurrentes
alter table public.recurring_payments
  add column if not exists type text check (type in ('expense', 'income')) default 'expense',
  add column if not exists installments_count integer default null;
