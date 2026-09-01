-- ==========================================================================
-- Pocketflow: Initial Database Schema with Multi-Entity RLS & Tenant Isolation
-- ==========================================================================

-- 1. Cuentas
create table if not exists public.accounts (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('spending', 'savings')),
  initial_balance numeric not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

-- 2. Categorías
create table if not exists public.categories (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text not null,
  icon_key text not null default 'shopping-basket',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

-- 3. Transacciones
create table if not exists public.transactions (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric not null check (amount > 0),
  account_id text not null,
  to_account_id text,
  category_id text,
  description text not null,
  date timestamptz not null,
  note text,
  recurring_payment_id text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete set null
);

-- 4. Presupuestos
create table if not exists public.budgets (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id text not null,
  amount_limit numeric not null check (amount_limit >= 0),
  period text not null default 'monthly',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete cascade
);

-- 5. Objetivos de ahorro
create table if not exists public.savings_goals (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  target numeric not null check (target > 0),
  current numeric not null default 0 check (current >= 0),
  target_date date,
  icon_key text default 'target',
  completed boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

-- 6. Reservas
create table if not exists public.reserves (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  target_amount numeric not null check (target_amount > 0),
  current_allocated numeric not null default 0 check (current_allocated >= 0),
  target_date date not null,
  icon_key text not null default 'target',
  active boolean not null default true,
  note text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

-- 7. Pagos recurrentes
create table if not exists public.recurring_payments (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric not null check (amount > 0),
  category_id text not null,
  account_id text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict
);

-- 8. Periodos especiales
create table if not exists public.special_periods (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  expected_extra_budget numeric not null default 0,
  type text not null default 'normal',
  note text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id, user_id)
);

-- 9. Configuración del plan financiero
create table if not exists public.financial_plan_settings (
  user_id uuid references auth.users(id) on delete cascade not null primary key,
  monthly_income numeric not null default 0,
  target_savings_type text not null default 'percentage',
  target_savings_value numeric not null default 15,
  emergency_fund_target_type text not null default 'months',
  emergency_fund_target_value numeric not null default 3,
  emergency_fund_current numeric not null default 0,
  essential_category_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 10. Tokens específicos para el Atajo de iPhone
create table if not exists public.shortcut_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Atajo iPhone',
  token_hash text not null unique,
  created_at timestamptz default now() not null,
  revoked_at timestamptz
);

-- ==========================================================================
-- Row Level Security (RLS) Policies
-- ==========================================================================

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.reserves enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.special_periods enable row level security;
alter table public.financial_plan_settings enable row level security;
alter table public.shortcut_tokens enable row level security;

-- Policies
create policy "Users can manage own accounts" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own categories" on public.categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own transactions" on public.transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own budgets" on public.budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own goals" on public.savings_goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own reserves" on public.reserves for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own recurring" on public.recurring_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own special periods" on public.special_periods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own plan settings" on public.financial_plan_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own shortcut tokens" on public.shortcut_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Índices de optimización para consultas frecuentes
create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);
create index if not exists idx_transactions_user_account on public.transactions(user_id, account_id);
create index if not exists idx_transactions_user_category on public.transactions(user_id, category_id);
create index if not exists idx_shortcut_tokens_hash on public.shortcut_tokens(token_hash) where revoked_at is null;
