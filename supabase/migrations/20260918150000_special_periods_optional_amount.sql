-- Migración: Periodos especiales con importe extra opcional
-- Permite que expected_extra_budget sea NULL en public.special_periods cuando no hay estimación económica definida

alter table public.special_periods alter column expected_extra_budget drop not null;
alter table public.special_periods alter column expected_extra_budget set default null;
