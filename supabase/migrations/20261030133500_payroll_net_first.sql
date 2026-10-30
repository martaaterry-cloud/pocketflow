-- Permite registrar el neto percibido antes de recibir el PDF.
-- Los registros completos conservan la validación contable existente.
-- No modifica ninguna fila ni saldo.
alter table public.payroll_events drop constraint if exists payroll_values_valid;
alter table public.payroll_events add constraint payroll_values_valid check (
  (kind = 'delete' and gross is null and social_security is null and irpf is null and net is null)
  or
  (kind in ('save', 'legacy') and net is not null and net between 0 and 1000000000000
    and (
      (gross is null and social_security is null and irpf is null)
      or
      (gross is not null and social_security is not null and irpf is not null
       and gross between 0 and 1000000000000
       and social_security between 0 and 1000000000000
       and irpf between 0 and 100
       and abs(gross - social_security - gross * irpf / 100 - net) <= 0.100000001)
    )
  )
);
