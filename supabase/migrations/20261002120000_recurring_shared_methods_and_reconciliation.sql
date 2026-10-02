-- ==============================================================================
-- PocketFlow: Ampliación de recurring_payments para métodos de pago y pagador habitual
-- ==============================================================================

alter table public.recurring_payments
  add column if not exists payment_method text check (payment_method in ('bank', 'bizum', 'cash')),
  add column if not exists paid_by text check (paid_by in ('user', 'contact')) default 'user',
  add column if not exists payer_name text,
  add column if not exists payer_contact_id text,
  add column if not exists expense_payment_method text check (expense_payment_method in ('bank', 'bizum', 'cash')),
  add column if not exists settlement_payment_method text check (settlement_payment_method in ('bank', 'bizum', 'cash')),
  add column if not exists settlement_account_id text;

comment on column public.recurring_payments.payment_method is 'Método habitual de pago o cobro recurrente';
comment on column public.recurring_payments.paid_by is 'Quién suele pagar el gasto recurrente compartido (user o contact)';
comment on column public.recurring_payments.expense_payment_method is 'Método de pago habitual para el gasto compartido';
comment on column public.recurring_payments.settlement_payment_method is 'Método habitual de liquidación / reembolso';
