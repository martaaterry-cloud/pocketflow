import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shortcut-token',
}

const CATEGORY_ALIAS_MAP: Record<string, string> = {
  // Alias de Otros / Genéricos
  other: 'other',
  others: 'other',
  otro: 'other',
  otros: 'other',
  otra: 'other',
  otras: 'other',
  misc: 'other',
  miscellaneous: 'other',
  miscelanea: 'other',
  miscelaneas: 'other',
  varios: 'other',
  varias: 'other',
  general: 'other',
  default: 'other',

  // Alias de Alimentación
  food: 'food',
  comida: 'food',
  alimentacion: 'food',
  supermercado: 'food',
  super: 'food',
  restaurante: 'food',
  restaurantes: 'food',
  cena: 'food',
  cenas: 'food',
  almuerzo: 'food',
  desayuno: 'food',

  // Alias de Ocio
  leisure: 'leisure',
  ocio: 'leisure',
  entretenimiento: 'leisure',
  fiesta: 'leisure',
  cine: 'leisure',
  eventos: 'leisure',
  salidas: 'leisure',
  bares: 'leisure',

  // Alias de Transporte
  transport: 'transport',
  transporte: 'transport',
  coche: 'transport',
  gasolina: 'transport',
  combustible: 'transport',
  diesel: 'transport',
  metro: 'transport',
  bus: 'transport',
  taxi: 'transport',
  uber: 'transport',
  cabify: 'transport',
  parking: 'transport',

  // Alias de Ropa
  clothes: 'clothes',
  ropa: 'clothes',
  vestimenta: 'clothes',
  calzado: 'clothes',
  zapatos: 'clothes',
  moda: 'clothes',

  // Alias de Suscripciones
  subscriptions: 'subscriptions',
  suscripciones: 'subscriptions',
  suscripcion: 'subscriptions',
  subscription: 'subscriptions',
  streaming: 'subscriptions',
  cuotas: 'subscriptions',

  // Alias de Deporte
  sport: 'sport',
  deporte: 'sport',
  gym: 'sport',
  gimnasio: 'sport',
  fitness: 'sport',

  // Alias de Viajes
  travel: 'travel',
  viajes: 'travel',
  viaje: 'travel',
  vuelo: 'travel',
  vuelos: 'travel',
  hotel: 'travel',
  hoteles: 'travel',
  vacaciones: 'travel',

  // Alias de Salud
  health: 'health',
  salud: 'health',
  farmacia: 'health',
  medico: 'health',
  hospital: 'health',
  dentista: 'health',

  // Alias de Casa
  house: 'house',
  home: 'house',
  casa: 'house',
  hogar: 'house',
  vivienda: 'house',
  alquiler: 'house',
  mantenimiento: 'house',
}

function sanitizeCategoryKey(rawKey: string | undefined | null): string {
  if (!rawKey || typeof rawKey !== 'string') return ''
  return rawKey
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolveCanonicalCategoryId(rawCat: string | undefined | null): string {
  const clean = sanitizeCategoryKey(rawCat)
  if (!clean) return 'other'
  return CATEGORY_ALIAS_MAP[clean] || clean
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function formatEuro(num: number): string {
  return `${num.toFixed(2).replace('.', ',')} €`
}

Deno.serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // 1. Obtener token del Atajo
  const headerToken = req.headers.get('x-shortcut-token')
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const shortcutToken = headerToken?.trim() || bearerToken

  if (!shortcutToken) {
    return new Response(
      JSON.stringify({ error: 'Falta el token de autenticación del Atajo (x-shortcut-token).' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Error de configuración en el servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 2. Validar token contra shortcut_tokens
  const hashedToken = await hashToken(shortcutToken)
  const { data: tokenRow, error: tokenError } = await supabase
    .from('shortcut_tokens')
    .select('user_id')
    .eq('token_hash', hashedToken)
    .is('revoked_at', null)
    .single()

  if (tokenError || !tokenRow) {
    return new Response(
      JSON.stringify({ error: 'Token del Atajo no válido o revocado.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const userId = tokenRow.user_id

  // 3. Parsear y validar el payload
  let body: Record<string, any> = {}
  if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      body = {}
    }
  }

  const action = (body.action || 'add_expense').toLowerCase()

  // --------------------------------------------------------------------------
  // ACCIÓN 1: BALANCE_SUMMARY (Consultas de saldo / disponible / por cobrar)
  // --------------------------------------------------------------------------
  if (action === 'balance_summary' || action === 'get_balance' || req.method === 'GET') {
    const [accountsRes, txsRes, recurringRes, sharesRes] = await Promise.all([
      supabase.from('accounts').select('id, name, type, balance').eq('user_id', userId),
      supabase.from('transactions').select('id, account_id, type, income_kind, amount, date, recurring_payment_id, parent_expense_id, expense_share_id').eq('user_id', userId),
      supabase.from('recurring_payments').select('id, amount, active, account_id').eq('user_id', userId).eq('active', true),
      supabase.from('expense_shares').select('id, expense_transaction_id, participant_name, expected_amount, is_payer_share').eq('user_id', userId).eq('is_payer_share', false),
    ])

    const accounts = accountsRes.data || []
    const transactions = txsRes.data || []
    const recurring = recurringRes.data || []
    const externalShares = sharesRes.data || []

    const dailyAccount = accounts.find((a: any) => a.type === 'spending')
    const savingsAccount = accounts.find((a: any) => a.type === 'savings')

    const spendableBalance = Math.round((dailyAccount?.balance ?? 0) * 100) / 100
    const savingsBalance = Math.round((savingsAccount?.balance ?? 0) * 100) / 100
    const totalMoney = Math.round((spendableBalance + savingsBalance) * 100) / 100

    // Comprometido pendiente este mes
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const pendingRecurring = recurring.filter((r: any) => {
      const alreadyPaid = transactions.some((t: any) => {
        if (t.type !== 'expense') return false
        const d = new Date(t.date)
        if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false
        return t.recurring_payment_id === r.id
      })
      return !alreadyPaid
    })

    const committedAmount = Math.round(pendingRecurring.reduce((sum: number, r: any) => sum + r.amount, 0) * 100) / 100
    const realAvailable = Math.max(0, Math.round((spendableBalance - committedAmount) * 100) / 100)

    // Por cobrar
    let pendingReceivables = 0
    externalShares.forEach((s: any) => {
      const reimbursements = transactions.filter(
        (t: any) => t.type === 'income' && t.income_kind === 'reimbursement' && (t.expense_share_id === s.id || t.parent_expense_id === s.expense_transaction_id)
      )
      const received = reimbursements.reduce((sum: number, t: any) => sum + t.amount, 0)
      const pending = Math.max(0, s.expected_amount - received)
      pendingReceivables += pending
    })
    pendingReceivables = Math.round(pendingReceivables * 100) / 100

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalMoney,
          spendableBalance,
          savingsBalance,
          committedAmount,
          realAvailable,
          pendingReceivables,
        },
        formatted: {
          totalMoney: formatEuro(totalMoney),
          spendableBalance: formatEuro(spendableBalance),
          savingsBalance: formatEuro(savingsBalance),
          committedAmount: formatEuro(committedAmount),
          realAvailable: formatEuro(realAvailable),
          pendingReceivables: formatEuro(pendingReceivables),
        },
        text: `Disponible: ${formatEuro(realAvailable)} | Total: ${formatEuro(totalMoney)} | Por cobrar: ${formatEuro(pendingReceivables)}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 2: GET_PENDING_RECEIVABLES (Lista de deudas pendientes para Atajo)
  // --------------------------------------------------------------------------
  if (action === 'get_pending_receivables' || action === 'list_receivables') {
    const [sharesRes, txsRes] = await Promise.all([
      supabase.from('expense_shares').select('id, expense_transaction_id, participant_name, expected_amount, is_payer_share').eq('user_id', userId).eq('is_payer_share', false),
      supabase.from('transactions').select('id, description, date, type, income_kind, amount, parent_expense_id, expense_share_id').eq('user_id', userId),
    ])

    const externalShares = sharesRes.data || []
    const transactions = txsRes.data || []

    const items: Array<{
      id: string
      participantName: string
      expenseDescription: string
      expectedAmount: number
      receivedAmount: number
      pendingAmount: number
      parentExpenseId: string
      formattedText: string
    }> = []

    externalShares.forEach((s: any) => {
      const parentTx = transactions.find((t: any) => t.id === s.expense_transaction_id)
      const reimbursements = transactions.filter(
        (t: any) => t.type === 'income' && t.income_kind === 'reimbursement' && (t.expense_share_id === s.id || t.parent_expense_id === s.expense_transaction_id)
      )
      const receivedAmount = Math.round(reimbursements.reduce((sum: number, t: any) => sum + t.amount, 0) * 100) / 100
      const pendingAmount = Math.max(0, Math.round((s.expected_amount - receivedAmount) * 100) / 100)

      if (pendingAmount > 0) {
        const desc = parentTx?.description || 'Gasto compartido'
        items.push({
          id: s.id,
          participantName: s.participant_name,
          expenseDescription: desc,
          expectedAmount: s.expected_amount,
          receivedAmount,
          pendingAmount,
          parentExpenseId: s.expense_transaction_id,
          formattedText: `${s.participant_name} — ${desc} — ${formatEuro(pendingAmount)}`,
        })
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        count: items.length,
        items,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 3: AÑADIR GASTO (add_expense - retrocompatible)
  // --------------------------------------------------------------------------
  if (action === 'add_expense') {
    const rawAmount = String(body.amount ?? '').trim().replace(',', '.')
    const numAmount = Number(rawAmount)

    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'El importe (amount) debe ser un número válido mayor que 0.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amount = Math.round(numAmount * 100) / 100
    const rawDesc = typeof body.description === 'string' ? body.description.trim() : ''
    const description = rawDesc ? rawDesc.slice(0, 120) : 'Gasto rápido'

    const rawCategory = typeof body.category === 'string' ? body.category : ''
    const canonicalCat = resolveCanonicalCategoryId(rawCategory)
    let categoryId = 'other'

    if (canonicalCat) {
      const { data: catRow } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('id', canonicalCat)
        .single()

      if (catRow) {
        categoryId = catRow.id
      } else {
        const { data: otherCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('id', 'other')
          .single()
        categoryId = otherCat ? 'other' : 'other'
      }
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const nowIso = body.date ? new Date(body.date).toISOString() : new Date().toISOString()

    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        id: txId,
        user_id: userId,
        type: 'expense',
        amount,
        account_id: 'daily',
        category_id: categoryId || 'other',
        description,
        date: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, amount, description, date, category_id')
      .single()

    if (insertError) {
      console.error('[pocketflow-action] Error insertando transacción:', insertError)
      return new Response(
        JSON.stringify({ error: 'Error al registrar el gasto en la base de datos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Gasto añadido',
        transaction: newTx,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 4: AÑADIR INGRESO (add_income)
  // --------------------------------------------------------------------------
  if (action === 'add_income') {
    const rawAmount = String(body.amount ?? '').trim().replace(',', '.')
    const numAmount = Number(rawAmount)

    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'El importe (amount) debe ser un número válido mayor que 0.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amount = Math.round(numAmount * 100) / 100
    const rawDesc = typeof body.description === 'string' ? body.description.trim() : ''
    const description = rawDesc ? rawDesc.slice(0, 120) : 'Ingreso rápido'
    const nowIso = body.date ? new Date(body.date).toISOString() : new Date().toISOString()
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        id: txId,
        user_id: userId,
        type: 'income',
        income_kind: 'income',
        amount,
        account_id: 'daily',
        category_id: null,
        description,
        date: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, amount, description, date, type')
      .single()

    if (insertError) {
      console.error('[add-income] Error insertando ingreso:', insertError)
      return new Response(
        JSON.stringify({ error: 'Error al registrar el ingreso en la base de datos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Ingreso añadido',
        transaction: newTx,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 5: REGISTRAR REEMBOLSO / BIZUM (register_reimbursement)
  // --------------------------------------------------------------------------
  if (action === 'register_reimbursement' || action === 'add_reimbursement') {
    const rawAmount = String(body.amount ?? '').trim().replace(',', '.')
    const numAmount = Number(rawAmount)

    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'El importe (amount) debe ser un número válido mayor que 0.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amount = Math.round(numAmount * 100) / 100
    const rawDesc = typeof body.description === 'string' ? body.description.trim() : ''
    const description = rawDesc ? rawDesc.slice(0, 120) : 'Bizum recibido'
    const nowIso = body.date ? new Date(body.date).toISOString() : new Date().toISOString()
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    const parentExpenseId = body.parentExpenseId || body.parent_expense_id || null
    const expenseShareId = body.expenseShareId || body.expense_share_id || null

    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        id: txId,
        user_id: userId,
        type: 'income',
        income_kind: 'reimbursement',
        amount,
        account_id: 'daily',
        parent_expense_id: parentExpenseId,
        expense_share_id: expenseShareId,
        category_id: null,
        description,
        date: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, amount, description, date, type, income_kind, parent_expense_id, expense_share_id')
      .single()

    if (insertError) {
      console.error('[register_reimbursement] Error insertando reembolso:', insertError)
      return new Response(
        JSON.stringify({ error: 'Error al registrar el reembolso en la base de datos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reembolso registrado',
        transaction: newTx,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: `Acción '${action}' no reconocida.` }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
