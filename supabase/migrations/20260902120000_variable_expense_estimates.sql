-- Migración: Gastos Variables Previstos
-- Permite registrar estimaciones de gastos periódicos por uso (ej. gimnasio por sesión)
-- sin registrarlos como transacciones reales.

create table if not exists public.variable_expense_estimates (
    id text primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    category_id text not null,
    unit_cost numeric not null check (unit_cost >= 0),
    frequency_type text not null check (frequency_type in ('per_week', 'per_month')),
    frequency_value numeric not null check (frequency_value > 0),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Habilitar RLS
alter table public.variable_expense_estimates enable row level security;

-- Política RLS aislada por usuario
create policy "Users can manage own variable expense estimates"
    on public.variable_expense_estimates
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Índices de consulta eficiente
create index if not exists idx_variable_expense_estimates_user_id
    on public.variable_expense_estimates(user_id);

create index if not exists idx_variable_expense_estimates_category_id
    on public.variable_expense_estimates(category_id);

-- Trigger para updated_at automático
drop trigger if exists trigger_set_updated_at_variable_estimates on public.variable_expense_estimates;
create trigger trigger_set_updated_at_variable_estimates
    before update on public.variable_expense_estimates
    for each row
    execute function public.set_updated_at();

-- Configuración para Supabase Realtime
alter table public.variable_expense_estimates replica identity full;

-- Añadir a la publicación supabase_realtime
alter publication supabase_realtime add table public.variable_expense_estimates;
