alter table public.special_periods add column if not exists future_category_id text;
alter table public.special_periods add column if not exists future_payment_method text;
alter table public.special_periods drop constraint if exists special_periods_future_payment_method_check;
alter table public.special_periods add constraint special_periods_future_payment_method_check
 check (future_payment_method is null or future_payment_method in ('bank','bizum','cash'));
