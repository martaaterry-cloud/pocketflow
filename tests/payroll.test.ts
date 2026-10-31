import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalPayroll, isPayrollValues, mergePayrollEvents, projectPayrollMonths, type PayrollEvent, type PayrollValues } from '../src/models/payroll'
import { migrateLegacyPayroll, PayrollStore, legacyPayrollKey, payrollKey, type PayrollGateway } from '../src/services/payroll/payrollStore'
import { createSupabasePayrollGateway, fromPayrollRow } from '../src/services/payroll/supabasePayroll'

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const salary: PayrollValues = { month: '2026-09', gross: 1000, socialSecurity: 65, irpf: 10, net: 835 }
const changed = { ...salary, gross: 2000, socialSecurity: 130, net: 1670 }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const memory = () => {
  const map = new Map<string, string>()
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) } }
}
function fakeCloud() {
  const events: PayrollEvent[] = []
  let sequence = 0
  const gateway = (userId = A): PayrollGateway => ({
    fetch: async () => clone(events.filter((e) => e.userId === userId)),
    append: async (event) => {
      assert.equal(event.userId, userId)
      let stored = events.find((e) => e.userId === userId && e.id === event.id)
      if (!stored) { stored = { ...clone(event), sequence: ++sequence, createdAt: new Date().toISOString() }; events.push(stored) }
      return clone(stored)
    },
  })
  return { events, gateway }
}
const event = (values = salary, userId = A): PayrollEvent => ({ id: crypto.randomUUID(), userId, month: values.month,
  kind: 'save', values: { ...values }, clientCreatedAt: '2026-10-13T12:00:00.000Z' })

test('validación rechaza meses, importes, porcentajes y netos incoherentes', () => {
  assert.ok(isPayrollValues(salary))
  for (const value of [{ ...salary, month: '2026-13' }, { ...salary, gross: -1 }, { ...salary, net: NaN },
    { ...salary, irpf: 101 }, { ...salary, net: 1 }, { ...salary, gross: '1000' }, { ...salary, gross: Infinity }]) assert.equal(isPayrollValues(value), false)
})

test('migración repetida o desde dos dispositivos genera IDs estables, sin duplicados', async () => {
  const raw = JSON.stringify([salary, salary])
  const first = await migrateLegacyPayroll(A, raw), second = await migrateLegacyPayroll(A, raw)
  assert.equal(first.events.length, 1)
  assert.deepEqual(first.events, second.events)
  assert.notEqual((await migrateLegacyPayroll(B, raw)).events[0].id, first.events[0].id)
  const cloud = fakeCloud(), one = memory(), two = memory()
  one.setItem(legacyPayrollKey(A), raw); two.setItem(legacyPayrollKey(A), raw)
  const s1 = new PayrollStore(A, one, cloud.gateway()), s2 = new PayrollStore(A, two, cloud.gateway())
  await s1.initialize(); await s2.initialize(); await s1.sync()
  assert.equal(cloud.events.length, 1)
  assert.equal(s1.getSnapshot().months.length, 1)
  assert.equal(s2.getSnapshot().months.length, 1)
  assert.equal(one.getItem(legacyPayrollKey(A)), raw)
  assert.equal(two.getItem(legacyPayrollKey(A)), raw)
})

test('la migración nunca sobrescribe una versión remota distinta del mismo mes', async () => {
  const cloud = fakeCloud(), local = memory()
  await cloud.gateway().append(event(changed))
  local.setItem(legacyPayrollKey(A), JSON.stringify([salary]))
  const store = new PayrollStore(A, local, cloud.gateway())
  await store.initialize()
  assert.equal(store.getSnapshot().months[0].current.values?.net, changed.net)
  assert.equal(store.getSnapshot().months[0].versions.length, 2)
  assert.equal(cloud.events.length, 2)
})

test('versiones locales divergentes se conservan y convergen independientemente del orden de migración', async () => {
  const legacy1 = (await migrateLegacyPayroll(A, JSON.stringify([salary]))).events
  const legacy2 = (await migrateLegacyPayroll(A, JSON.stringify([changed]))).events
  const one = projectPayrollMonths(mergePayrollEvents(A, legacy1, legacy2))
  const two = projectPayrollMonths(mergePayrollEvents(A, legacy2, legacy1))
  assert.equal(one[0].current.id, two[0].current.id)
  assert.equal(one[0].versions.length, 2)
})

test('registros legacy inválidos permanecen intactos y se señalan sin bloquear los válidos', async () => {
  const local = memory(), cloud = fakeCloud(), raw = JSON.stringify([salary, { ...salary, net: 'invalid' }])
  local.setItem(legacyPayrollKey(A), raw)
  const store = new PayrollStore(A, local, cloud.gateway())
  await store.initialize()
  assert.equal(store.getSnapshot().migrationIssues, 1)
  assert.equal(cloud.events.length, 1)
  assert.equal(local.getItem(legacyPayrollKey(A)), raw)
  assert.equal((await migrateLegacyPayroll(A, '{')).issues, 1)
})

test('guardado offline, reinicio y sincronización posterior conservan el registro y su ID', async () => {
  const local = memory(), cloud = fakeCloud()
  const first = new PayrollStore(A, local, cloud.gateway(), () => false)
  await first.initialize(); first.save(salary)
  assert.equal(first.getSnapshot().pending, 1)
  const id = first.getSnapshot().months[0].current.id
  first.dispose()
  const second = new PayrollStore(A, local, cloud.gateway())
  await second.initialize()
  assert.equal(second.getSnapshot().pending, 0)
  assert.equal(second.getSnapshot().months[0].current.id, id)
  assert.equal(cloud.events.length, 1)
})

test('confirmación perdida después del INSERT se reintenta sin duplicar', async () => {
  const cloud = fakeCloud(), gateway = cloud.gateway(), local = memory()
  let fail = true
  const store = new PayrollStore(A, local, { ...gateway, append: async (e) => {
    const saved = await gateway.append(e)
    if (fail) throw new Error('Respuesta perdida')
    return saved
  } })
  await store.initialize(); store.save(salary); await store.sync()
  assert.equal(cloud.events.length, 1)
  // La lectura posterior también puede confirmar el INSERT cuya respuesta se perdió.
  assert.ok(store.getSnapshot().pending <= 1)
  fail = false
  await store.sync()
  assert.equal(cloud.events.length, 1)
  assert.equal(store.getSnapshot().pending, 0)
})

test('ediciones simultáneas desde dos dispositivos conservan ambas versiones y convergen', async () => {
  const cloud = fakeCloud(), one = memory(), two = memory()
  let online = false
  const a = new PayrollStore(A, one, cloud.gateway(), () => online), b = new PayrollStore(A, two, cloud.gateway(), () => online)
  await a.initialize(); await b.initialize(); a.save(salary); b.save(changed)
  online = true; await a.sync(); await b.sync(); await a.sync()
  assert.equal(cloud.events.length, 2)
  assert.equal(a.getSnapshot().months[0].versions.length, 2)
  assert.equal(a.getSnapshot().months[0].current.id, b.getSnapshot().months[0].current.id)
  assert.equal(a.getSnapshot().months[0].current.values?.net, changed.net)
})

test('una eliminación sincronizada no resucita al migrar otro dispositivo antiguo', async () => {
  const cloud = fakeCloud(), one = memory(), two = memory()
  one.setItem(legacyPayrollKey(A), JSON.stringify([salary])); two.setItem(legacyPayrollKey(A), JSON.stringify([salary]))
  const a = new PayrollStore(A, one, cloud.gateway())
  await a.initialize(); a.remove(salary.month); await a.sync()
  const b = new PayrollStore(A, two, cloud.gateway())
  await b.initialize()
  assert.equal(b.getSnapshot().months[0].current.kind, 'delete')
  assert.equal(cloud.events.length, 2)
  b.save(salary); await b.sync(); await a.sync()
  assert.equal(a.getSnapshot().months[0].current.kind, 'save')
  assert.equal(a.getSnapshot().months[0].versions.length, 3)
})

test('caché, migración y cola están aisladas por usuario; nunca se adopta guest', async () => {
  const local = memory(), cloud = fakeCloud()
  local.setItem(legacyPayrollKey(A), JSON.stringify([salary]))
  local.setItem(legacyPayrollKey('guest'), JSON.stringify([changed]))
  const a = new PayrollStore(A, local, cloud.gateway()), b = new PayrollStore(B, local, cloud.gateway(B))
  await a.initialize(); await b.initialize()
  assert.equal(a.getSnapshot().months.length, 1)
  assert.equal(b.getSnapshot().months.length, 0)
  assert.notEqual(payrollKey(A), payrollKey(B))
  assert.throws(() => new PayrollStore('guest', local, cloud.gateway()))
  assert.throws(() => mergePayrollEvents(A, [event(salary, B)]))
})

test('caché corrupta o de otro usuario no se sobrescribe ni se envía a Supabase', async () => {
  for (const raw of ['{', JSON.stringify({ version: 1, userId: B, events: [event(salary, B)], migrationIssues: 0 })]) {
    const local = memory(), cloud = fakeCloud()
    local.setItem(payrollKey(A), raw)
    const store = new PayrollStore(A, local, cloud.gateway())
    await store.initialize()
    assert.equal(store.getSnapshot().ready, false)
    assert.equal(store.getSnapshot().status, 'error')
    assert.equal(local.getItem(payrollKey(A)), raw)
    assert.equal(cloud.events.length, 0)
  }
})

test('fallo de persistencia no se anuncia como guardado ni produce escrituras remotas', async () => {
  const local = memory(), cloud = fakeCloud()
  const store = new PayrollStore(A, { ...local, setItem() { throw new Error('QuotaExceeded') } }, cloud.gateway())
  await store.initialize()
  assert.equal(store.getSnapshot().ready, false)
  assert.throws(() => store.save(salary))
  assert.equal(cloud.events.length, 0)
})

test('cerrar sesión durante una petición ignora su respuesta y detiene la cola', async () => {
  const local = memory()
  let resolve!: (events: PayrollEvent[]) => void
  let writes = 0
  const store = new PayrollStore(A, local, { fetch: () => new Promise((r) => { resolve = r }), append: async (e) => { writes++; return e } })
  const initializing = store.initialize()
  await new Promise((r) => setTimeout(r, 0))
  store.dispose(); resolve([event()]); await initializing
  assert.equal(writes, 0)
  assert.equal(JSON.parse(local.getItem(payrollKey(A))!).events.length, 0)
  assert.throws(() => store.save(salary))
})

test('eventos remotos de otro usuario o IDs con contenidos distintos no se mezclan', async () => {
  const local = memory(), other = { ...event(salary, B), sequence: 1, createdAt: new Date().toISOString() }
  const store = new PayrollStore(A, local, { fetch: async () => [other], append: async (e) => e })
  await store.initialize()
  assert.equal(store.getSnapshot().months.length, 0)
  assert.equal(store.getSnapshot().status, 'error')
  const original = event()
  assert.throws(() => mergePayrollEvents(A, [original], [{ ...original, values: changed }]))
})

test('confirmación de contenido distinto deja la operación pendiente sin perder la versión local', async () => {
  const local = memory()
  const store = new PayrollStore(A, local, { fetch: async () => [], append: async (e) => ({ ...e, values: changed, sequence: 1, createdAt: new Date().toISOString() }) })
  await store.initialize(); store.save(salary); await store.sync()
  assert.equal(store.getSnapshot().pending, 1)
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().months[0].current.values?.net, salary.net)
})

test('adaptador exige identidad verificada y no consulta nóminas con una sesión distinta', async () => {
  let queries = 0
  const client = { auth: { getUser: async () => ({ data: { user: { id: B } }, error: null }) }, from() { queries++; throw new Error('No debe consultar') } } as unknown as SupabaseClient
  const gateway = createSupabasePayrollGateway(client, A)
  await assert.rejects(() => gateway.fetch(), /sesión/)
  await assert.rejects(() => gateway.append(event()), /sesión/)
  assert.equal(queries, 0)
})

test('decodificación valida propietario, importes y secuencia, y normaliza timestamps de Postgres', () => {
  const row = { id: crypto.randomUUID(), user_id: A, month: salary.month, kind: 'save', gross: salary.gross,
    social_security: salary.socialSecurity, irpf: salary.irpf, net: salary.net, sequence: 1,
    client_created_at: '2026-10-13T12:00:00+00:00', created_at: '2026-10-13T12:00:01+00:00' }
  const decoded = fromPayrollRow(row, A)
  assert.equal(decoded.clientCreatedAt, '2026-10-13T12:00:00.000Z')
  assert.equal(canonicalPayroll(decoded.values!), canonicalPayroll(salary))
  assert.throws(() => fromPayrollRow({ ...row, user_id: B }, A))
  assert.throws(() => fromPayrollRow({ ...row, gross: null }, A))
  assert.throws(() => fromPayrollRow({ ...row, sequence: 0 }, A))
})

test('guardado repetido del mismo contenido no duplica la nómina ni sus versiones', async () => {
  const local = memory(), cloud = fakeCloud()
  const store = new PayrollStore(A, local, cloud.gateway())
  await store.initialize(); store.save(salary); store.save({ ...salary }); await store.sync()
  assert.equal(cloud.events.length, 1)
  assert.equal(store.getSnapshot().months[0].versions.length, 1)
})

test('fallo de red conserva la cola durable y no modifica las claves financieras', async () => {
  const local = memory(), cloud = fakeCloud()
  const financial = JSON.stringify({ accounts: [{ balance: 1500 }], transactions: [{ amount: 300 }], income: 50 })
  local.setItem(`pocketflow:${A}:state`, financial)
  local.setItem(`pocketflow:${A}:offline-queue`, '[{"entity":"transaction"}]')
  let networkFailure = true
  const gateway = cloud.gateway()
  const store = new PayrollStore(A, local, { ...gateway, fetch: async () => {
    if (networkFailure) throw new Error('Sin red')
    return gateway.fetch()
  } })
  await store.initialize(); store.save(salary); await store.sync()
  assert.equal(store.getSnapshot().pending, 1)
  assert.equal(JSON.parse(local.getItem(payrollKey(A))!).events.length, 1)
  assert.equal(cloud.events.length, 0)
  networkFailure = false; await store.sync()
  assert.equal(cloud.events.length, 1)
  assert.equal(store.getSnapshot().pending, 0)
  assert.equal(local.getItem(`pocketflow:${A}:state`), financial)
  assert.equal(local.getItem(`pocketflow:${A}:offline-queue`), '[{"entity":"transaction"}]')
})

test('un cambio local durante una sincronización en vuelo no se sobrescribe con la respuesta antigua', async () => {
  const local = memory(), cloud = fakeCloud(), gateway = cloud.gateway()
  const store = new PayrollStore(A, local, gateway, () => false)
  await store.initialize()
  store.save(salary)
  const first = store.getSnapshot().months[0].current
  // Simular confirmación de la versión anterior desde otra pestaña.
  const confirmed = await gateway.append(first)
  store.save(changed)
  const cache = JSON.parse(local.getItem(payrollKey(A))!)
  cache.events = mergePayrollEvents(A, cache.events, [confirmed])
  local.setItem(payrollKey(A), JSON.stringify(cache))
  store.refresh()
  assert.equal(store.getSnapshot().months[0].current.values?.net, changed.net)
  assert.equal(store.getSnapshot().pending, 1)
  assert.equal(store.getSnapshot().months[0].versions.length, 2)
})

function adapterClient(rows: Record<string, unknown>[]) {
  const operations: { table: string; operation: string; filters: [string, unknown][]; payload?: Record<string, unknown>; options?: Record<string, unknown> }[] = []
  let listener: ((payload: { new: Record<string, unknown> }) => void) | undefined
  let removed = false
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) },
    from(table: string) {
      const operation = { table, operation: 'select', filters: [] as [string, unknown][], payload: undefined as Record<string, unknown> | undefined, options: undefined as Record<string, unknown> | undefined }
      const query = {
        select() { return query },
        eq(key: string, value: unknown) { operation.filters.push([key, value]); return query },
        order() { return query },
        range(start: number, end: number) { operations.push(operation); return Promise.resolve({ data: rows.slice(start, end + 1), error: null }) },
        upsert(payload: Record<string, unknown>, options: Record<string, unknown>) { operation.operation = 'insert'; operation.payload = payload; operation.options = options; operations.push(operation); return Promise.resolve({ error: null }) },
        single() { operations.push(operation); return Promise.resolve({ data: rows[0], error: null }) },
      }
      return query
    },
    channel() {
      const channel = {
        on(_type: string, filter: Record<string, unknown>, callback: typeof listener) { assert.equal(filter.filter, `user_id=eq.${A}`); listener = callback; return channel },
        subscribe(callback: (status: string) => void) { callback('SUBSCRIBED'); return channel },
      }
      return channel
    },
    removeChannel: async () => { removed = true },
  } as unknown as SupabaseClient
  return { client, operations, emit: (user_id: string) => listener?.({ new: { user_id } }), removed: () => removed }
}
const dbRow = (e: PayrollEvent, sequence = 1) => ({ id: e.id, user_id: e.userId, month: e.month, kind: e.kind,
  gross: e.values?.gross ?? null, social_security: e.values?.socialSecurity ?? null, irpf: e.values?.irpf ?? null,
  net: e.values?.net ?? null, sequence, client_created_at: e.clientCreatedAt, created_at: '2026-10-13T13:00:00Z' })

test('adaptador pagina el historial y limita todas las lecturas y escrituras a usuario y tabla', async () => {
  const pending = event(), rows = Array.from({ length: 401 }, (_, i) => dbRow({ ...pending, id: crypto.randomUUID() }, i + 1))
  const fake = adapterClient(rows), gateway = createSupabasePayrollGateway(fake.client, A)
  assert.equal((await gateway.fetch()).length, 401)
  assert.equal(fake.operations.length, 3)
  const single = adapterClient([dbRow(pending)])
  await createSupabasePayrollGateway(single.client, A).append(pending)
  for (const op of [...fake.operations, ...single.operations]) {
    assert.equal(op.table, 'payroll_events')
    if (op.operation === 'select') assert.ok(op.filters.some(([key, value]) => key === 'user_id' && value === A))
    else {
      assert.equal(op.payload?.user_id, A)
      assert.equal(op.options?.ignoreDuplicates, true)
      assert.equal(op.options?.onConflict, 'user_id,id')
      assert.equal(op.payload?.sequence, undefined)
      assert.equal(op.payload?.created_at, undefined)
    }
  }
})

test('Realtime ignora eventos ajenos y cierra únicamente el canal de nóminas', () => {
  const fake = adapterClient([])
  let active = true, updates = 0
  const gateway = createSupabasePayrollGateway(fake.client, A, () => active)
  const stop = gateway.subscribe!(() => { updates++ })
  assert.equal(updates, 1)
  fake.emit(B); assert.equal(updates, 1)
  fake.emit(A); assert.equal(updates, 2)
  active = false; fake.emit(A); assert.equal(updates, 2)
  stop(); assert.equal(fake.removed(), true)
})

test('nómina con solo neto se guarda y luego se completa sin duplicar meses', async () => {
  const partial: PayrollValues = { month: '2026-10', net: 1234.56 }
  assert.equal(isPayrollValues(partial), true)
  assert.equal(isPayrollValues({ ...partial, gross: 1500 }), false)
  const cloud = fakeCloud(), store = new PayrollStore(A, memory(), cloud.gateway())
  await store.initialize()
  store.save(partial)
  await store.sync()
  assert.equal(store.getSnapshot().months.length, 1)
  assert.equal(store.getSnapshot().months[0].current.values?.net, 1234.56)
  store.save({ month: '2026-10', gross: 1500, socialSecurity: 97.5, irpf: 11.196, net: 1234.56 })
  await store.sync()
  assert.equal(store.getSnapshot().months.length, 1)
  assert.equal(store.getSnapshot().months[0].versions.length, 2)
})

test('ingreso de nómina: categoría virtual no se envía como FK a Supabase', async () => {
  const { toDbTransaction } = await import('../src/services/supabase/supabaseSync')
  const row = toDbTransaction({ id: crypto.randomUUID(), type: 'income', amount: 1446.28,
    date: '2026-10-31', accountId: 'daily', categoryId: 'income', description: 'Nómina 2026-10' }, A)
  assert.equal(row.category_id, null)
  assert.equal(row.amount, 1446.28)
  assert.equal(row.account_id, 'daily')
})
