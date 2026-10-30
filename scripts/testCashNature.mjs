import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const container = process.env.PAYROLL_TEST_CONTAINER
if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) throw new Error('Se necesita un contenedor PostgreSQL aislado.')
const migration = readFileSync(new URL('../supabase/migrations/20261030134000_cash_expense_nature.sql', import.meta.url), 'utf8')
const sql = `
create table public.cash_transactions (id text primary key, amount numeric not null);
insert into public.cash_transactions(id, amount) values ('cash-demo', 47.20);
${migration}
${migration}
update public.cash_transactions set expense_nature='extraordinary' where id='cash-demo';
do $$ begin
  if not exists(select 1 from public.cash_transactions where id='cash-demo' and amount=47.20 and expense_nature='extraordinary') then
    raise exception 'No se mantuvo el gasto original';
  end if;
  begin
    update public.cash_transactions set expense_nature='invalid' where id='cash-demo';
    raise exception 'Clasificación inválida aceptada';
  exception when check_violation then null; end;
end $$;
select 'CASH_NATURE_OK' as result;
`;
const output = execFileSync('docker', ['--host=unix:///var/run/docker.sock', 'exec', '-i', container, 'psql',
  '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
if (!output.includes('CASH_NATURE_OK')) throw new Error('Clasificación de efectivo sin verificar.')
console.log('Clasificación de efectivo: migración idempotente, sin alterar importes; valores inválidos rechazados.')
