-- ==============================================================================
-- Migración: Añadir payment_method a transactions para clasificar bank/bizum/cash
-- ==============================================================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('bank', 'bizum', 'cash'));

COMMENT ON COLUMN transactions.payment_method IS 'Método de pago: bank (cuenta/tarjeta), bizum (Bizum), cash (efectivo)';
