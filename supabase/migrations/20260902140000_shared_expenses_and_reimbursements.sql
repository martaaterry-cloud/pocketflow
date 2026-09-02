-- ==========================================================================
-- Pocketflow: Shared Expenses, Contacts, Expense Shares & Reimbursements
-- ==========================================================================

-- 1. Ampliación de transactions para soporte de reembolsos y gastos compartidos
alter table public.transactions
  add column if not exists income_kind text check (income_kind in ('income', 'reimbursement')) default 'income',
  add column if not exists parent_expense_id text,
  add column if not exists expense_share_id text,
  add column if not exists is_shared boolean not null default false;

-- 2. Contactos compartidos (entidad ligera para autocompletado reutilizable)
create table if not exists public.shared_contacts (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

alter table public.shared_contacts enable row level security;

drop policy if exists "Users can manage own shared contacts" on public.shared_contacts;
create policy "Users can manage own shared contacts"
  on public.shared_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Partes de gastos compartidos (expense_shares)
create table if not exists public.expense_shares (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  expense_transaction_id text not null,
  contact_id text,
  participant_name text not null,
  is_payer_share boolean not null default false,
  expected_amount numeric not null check (expected_amount >= 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id),
  foreign key (expense_transaction_id, user_id) references public.transactions(id, user_id) on delete cascade,
  foreign key (contact_id, user_id) references public.shared_contacts(id, user_id) on delete set null
);

alter table public.expense_shares enable row level security;

drop policy if exists "Users can manage own expense shares" on public.expense_shares;
create policy "Users can manage own expense shares"
  on public.expense_shares for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Ampliación de recurring_payments para plantilla de reparto por ciclo
alter table public.recurring_payments
  add column if not exists is_shared boolean not null default false,
  add column if not exists sharing_template jsonb default null;

-- 5. Índices de rendimiento
create index if not exists idx_transactions_parent_expense on public.transactions(parent_expense_id, user_id);
create index if not exists idx_transactions_expense_share on public.transactions(expense_share_id, user_id);
create index if not exists idx_expense_shares_tx on public.expense_shares(expense_transaction_id, user_id);
create index if not exists idx_expense_shares_contact on public.expense_shares(contact_id, user_id);
create index if not exists idx_shared_contacts_name on public.shared_contacts(user_id, display_name);

-- 6. Triggers updated_at
drop trigger if exists set_updated_at_shared_contacts on public.shared_contacts;
create trigger set_updated_at_shared_contacts
  before update on public.shared_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_expense_shares on public.expense_shares;
create trigger set_updated_at_expense_shares
  before update on public.expense_shares
  for each row execute function public.set_updated_at();

-- 7. Realtime replica identity & publication
alter table public.shared_contacts replica identity full;
alter table public.expense_shares replica identity full;

alter publication supabase_realtime add table public.shared_contacts;
alter publication supabase_realtime add table public.expense_shares;
