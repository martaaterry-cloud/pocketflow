-- ==========================================================================
-- Pocketflow: Recurring Payment income_source_type support
-- ==========================================================================

-- 1. Ampliación de recurring_payments para soporte persistente de tipo de fuente de ingreso recurrente
alter table public.recurring_payments
  add column if not exists income_source_type text default null check (
    income_source_type is null or income_source_type in ('salary', 'pension', 'rental', 'benefit', 'other')
  );
