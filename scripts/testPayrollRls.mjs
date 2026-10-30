import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const container = process.env.PAYROLL_TEST_CONTAINER
if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) throw new Error('Indica PAYROLL_TEST_CONTAINER: debe ser un contenedor PostgreSQL de pruebas vacío.')
const migration = readFileSync(new URL('../supabase/migrations/20261013120000_payroll_events.sql', import.meta.url), 'utf8')
const netFirstMigration = readFileSync(new URL('../supabase/migrations/20261030133500_payroll_net_first.sql', import.meta.url), 'utf8')
const tests = readFileSync(new URL('../tests/payrollRls.sql', import.meta.url), 'utf8')
  .replaceAll('-- APPLY_PAYROLL_MIGRATION', () => migration)
  .replace('-- APPLY_PAYROLL_NET_FIRST', netFirstMigration)
const output = execFileSync('docker', ['--host=unix:///var/run/docker.sock', 'exec', '-i', container,
  'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: tests, encoding: 'utf8' })
if (!output.includes('PAYROLL_NET_FIRST_OK')) throw new Error('No se ha confirmado la nómina neta sin PDF.');
if (!output.includes('PAYROLL_RLS_OK')) throw new Error('No se ha confirmado el aislamiento de nóminas.')
console.log('Payroll PostgreSQL 17: migración idempotente, RLS multiusuario, acceso anónimo bloqueado y libro financiero intacto.')
