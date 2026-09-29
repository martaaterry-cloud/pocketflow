-- ==========================================================================
-- PocketFlow: Soporte de "Por pagar" y quién pagó el gasto compartido
-- ==========================================================================

-- 1. Ampliación de transactions y cash_transactions para registrar quién pagó
alter table public.transactions
  add column if not exists paid_by text check (paid_by in ('user', 'contact')) default 'user',
  add column if not exists payer_contact_id text,
  add column if not exists payer_name text;

alter table public.cash_transactions
  add column if not exists paid_by text check (paid_by in ('user', 'contact')) default 'user',
  add column if not exists payer_contact_id text,
  add column if not exists payer_name text;

-- 2. Ampliación de expense_shares para identificar la cuota propia del usuario
alter table public.expense_shares
  add column if not exists is_user_share boolean not null default false;

-- 3. Índices de rendimiento
create index if not exists idx_transactions_payer_contact on public.transactions(payer_contact_id, user_id);
create index if not exists idx_cash_transactions_payer_contact on public.cash_transactions(payer_contact_id, user_id);
