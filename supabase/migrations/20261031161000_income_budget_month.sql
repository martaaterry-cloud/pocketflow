-- El mes de presupuesto no altera el ingreso bancario ni sus fechas reales.
alter table public.transactions add column if not exists budget_month text;
alter table public.transactions drop constraint if exists transactions_budget_month_check;
alter table public.transactions add constraint transactions_budget_month_check
 check (budget_month is null or (type = 'income' and budget_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'));
