-- Clasificación de gastos en efectivo, independiente de la categoría temática.
-- Las filas antiguas se interpretan como variables hasta que se reclasifiquen.
alter table public.cash_transactions add column if not exists expense_nature text;
alter table public.cash_transactions drop constraint if exists cash_transactions_expense_nature_check;
alter table public.cash_transactions add constraint cash_transactions_expense_nature_check check (expense_nature is null or expense_nature in ('fixed','variable','extraordinary'));
