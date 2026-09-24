-- ==========================================================================
-- Migration: 20260924110000_reserve_special_period_link.sql
-- Pocketflow: Vínculo opcional entre Reservas y Periodos Especiales
-- ==========================================================================

-- 1. Añadir columna special_period_id a reserves (nullable)
alter table public.reserves
  add column if not exists special_period_id text null;

-- 2. Índice para acelerar consultas por usuario y periodo especial vinculado
create index if not exists idx_reserves_user_special_period
  on public.reserves(user_id, special_period_id);
