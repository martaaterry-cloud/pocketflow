import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shortcut-token',
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método no permitido. Solo se admite POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
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
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Cuerpo JSON malformado.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validar importe
  const rawAmount = String(body.amount ?? '').trim().replace(',', '.')
  const numAmount = Number(rawAmount)

  if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
    return new Response(
      JSON.stringify({ error: 'El importe (amount) debe ser un número válido mayor que 0.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const amount = Math.round(numAmount * 100) / 100

  // Validar descripción (saneada, máx 120 caracteres)
  const rawDesc = typeof body.description === 'string' ? body.description.trim() : ''
  const description = rawDesc ? rawDesc.slice(0, 120) : 'Gasto rápido'

  // Validar categoría contra categorías existentes del usuario
  const requestedCat = typeof body.category === 'string' ? body.category.trim().toLowerCase() : ''
  let categoryId = 'other'

  if (requestedCat) {
    const { data: catRow } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('id', requestedCat)
      .single()

    if (catRow) {
      categoryId = catRow.id
    } else {
      // Si la categoría solicitada no existe, verificar si existe fallback 'other'
      const { data: otherCat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('id', 'other')
        .single()

      categoryId = otherCat ? 'other' : ''
    }
  }

  // 4. Insertar transacción en la cuenta diaria
  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const nowIso = new Date().toISOString()

  const { data: newTx, error: insertError } = await supabase
    .from('transactions')
    .insert({
      id: txId,
      user_id: userId,
      type: 'expense',
      amount,
      account_id: 'daily',
      category_id: categoryId || null,
      description,
      date: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, amount, description, date, category_id')
    .single()

  if (insertError) {
    console.error('[add-expense] Error insertando transacción:', insertError)
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
})
