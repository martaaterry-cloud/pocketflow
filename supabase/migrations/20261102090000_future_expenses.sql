alter table public.special_periods add column if not exists future_status text;
alter table public.special_periods add column if not exists paid_transaction_id uuid;
alter table public.special_periods drop constraint if exists special_periods_future_status_check;
alter table public.special_periods add constraint special_periods_future_status_check check (future_status is null or future_status in ('confirmed','possible','paid'));
-- paid_transaction_id is informational: app validates an existing own expense before linking.
