import type { SupabaseClient } from '@supabase/supabase-js'

export interface ShortcutTokenInfo {
  id: string
  name: string
  createdAt: string
  revokedAt?: string | null
}

async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Genera un nuevo token de alta entropía para el Atajo de iPhone.
 * Retorna el token en crudo (para que el usuario lo pegue en su Atajo) y guarda el hash en Supabase.
 */
export async function createShortcutToken(
  supabase: SupabaseClient,
  userId: string,
  name = 'Atajo iPhone'
): Promise<{ rawToken: string; tokenInfo: ShortcutTokenInfo } | null> {
  try {
    const rawToken = `pf_sec_${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 10)}`
    const tokenHash = await sha256Hex(rawToken)

    const { data, error } = await supabase
      .from('shortcut_tokens')
      .insert({
        user_id: userId,
        name,
        token_hash: tokenHash,
      })
      .select('id, name, created_at')
      .single()

    if (error || !data) {
      console.error('[ShortcutToken] Error guardando token en Supabase:', error)
      return null
    }

    return {
      rawToken,
      tokenInfo: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
      },
    }
  } catch (err) {
    console.error('[ShortcutToken] Error creando token:', err)
    return null
  }
}

/**
 * Obtiene los tokens activos del usuario.
 */
export async function getActiveShortcutTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<ShortcutTokenInfo[]> {
  try {
    const { data, error } = await supabase
      .from('shortcut_tokens')
      .select('id, name, created_at, revoked_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error || !data) return []

    return data.map((d) => ({
      id: d.id,
      name: d.name,
      createdAt: d.created_at,
      revokedAt: d.revoked_at,
    }))
  } catch {
    return []
  }
}

/**
 * Revoca un token para invalidarlo de inmediato en la Edge Function.
 */
export async function revokeShortcutToken(
  supabase: SupabaseClient,
  userId: string,
  tokenId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('shortcut_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('user_id', userId)

    return !error
  } catch {
    return false
  }
}
