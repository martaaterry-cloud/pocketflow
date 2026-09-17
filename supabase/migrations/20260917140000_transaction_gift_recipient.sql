-- ==========================================================================
-- Pocketflow: Gift Recipient for Gifts Category
-- ==========================================================================

-- 1. Ampliación de transactions para soporte opcional de destinatario de regalo
alter table public.transactions
  add column if not exists gift_recipient text default null;
