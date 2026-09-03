import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { FinanceStore } from '../store/useFinance'
import { AppIcon } from '../ui/icons'
import { getSupabase, signOut } from '../services/supabase/supabaseClient'
import { uploadStateToSupabase } from '../services/supabase/supabaseSync'
import {
  createShortcutToken,
  getActiveShortcutTokens,
  revokeShortcutToken,
  type ShortcutTokenInfo,
} from '../services/supabase/shortcutTokenService'

interface CloudSettingsPageProps {
  finance: FinanceStore
  user: User | null
  onBack: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
  onSignOut: () => void
}

export function CloudSettingsPage({
  finance,
  user,
  onBack,
  onToast,
  onSignOut,
}: CloudSettingsPageProps) {
  const [tokens, setTokens] = useState<ShortcutTokenInfo[]>([])
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null)
  const [isGeneratingToken, setIsGeneratingToken] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'token' | 'guide'>('token')

  const actionEndpointUrl = 'https://xcarqzopfaozxugfhslo.supabase.co/functions/v1/pocketflow-action'
  const legacyEndpointUrl = 'https://xcarqzopfaozxugfhslo.supabase.co/functions/v1/add-expense'

  useEffect(() => {
    if (!user) return
    const supabase = getSupabase()
    getActiveShortcutTokens(supabase, user.id).then(setTokens)
  }, [user])

  const handleCreateToken = async () => {
    if (!user) return
    setIsGeneratingToken(true)
    try {
      const supabase = getSupabase()
      const res = await createShortcutToken(supabase, user.id, 'iPhone Shortcut')
      if (res) {
        setNewlyCreatedToken(res.rawToken)
        setTokens((prev) => [res.tokenInfo, ...prev])
        onToast('Token de Atajo generado con éxito', 'success')
      } else {
        onToast('Error generando token', 'error')
      }
    } catch {
      onToast('Error al conectar con Supabase', 'error')
    } finally {
      setIsGeneratingToken(false)
    }
  }

  const handleRevokeToken = async (id: string) => {
    if (!user) return
    const supabase = getSupabase()
    const ok = await revokeShortcutToken(supabase, user.id, id)
    if (ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id))
      if (newlyCreatedToken) setNewlyCreatedToken(null)
      onToast('Token revocado correctamente', 'success')
    } else {
      onToast('Error revocando token', 'error')
    }
  }

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
      onToast('Copiado al portapapeles', 'success')
    } catch {
      onToast('No se pudo copiar automáticamente', 'error')
    }
  }

  const handleManualMigrate = async () => {
    if (!user) return
    setIsMigrating(true)
    try {
      const supabase = getSupabase()
      const state = finance.getFullState()
      const ok = await uploadStateToSupabase(supabase, user.id, state)
      if (ok) {
        onToast('Todos los datos locales se han subido a Supabase', 'success')
      } else {
        onToast('Error al sincronizar datos con Supabase', 'error')
      }
    } catch {
      onToast('Error durante la migración', 'error')
    } finally {
      setIsMigrating(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    onSignOut()
  }

  return (
    <div className="page cloud-settings-page">
      <header className="page-header">
        <div className="header-left">
          <button type="button" className="btn-icon" onClick={onBack} aria-label="Volver">
            <AppIcon name="chevron-left" size={22} />
          </button>
          <h2>Nube y Atajo iPhone</h2>
        </div>
      </header>

      {/* Estado de conexión */}
      <section className="card cloud-status-card">
        <div className="status-indicator-dot online" />
        <div className="status-info">
          <span className="label">Conectado a Supabase</span>
          <strong className="value">{user?.email || 'Usuario autenticado'}</strong>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </section>

      {/* Sección Atajo de iPhone */}
      <section className="card cloud-action-card">
        <div className="card-title-row">
          <div className="action-icon shortcut-icon">
            <AppIcon name="zap" size={20} />
          </div>
          <div>
            <h3>Atajo &quot;Pocketflow&quot; de iPhone</h3>
            <p className="description">
              Registra gastos, ingresos, Bizums y consulta saldos <strong>sin abrir la app</strong>.
            </p>
          </div>
        </div>

        {/* Selector de sub-sección */}
        <div className="segmented-control" style={{ margin: '14px 0' }}>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'token' ? 'active' : ''}`}
            onClick={() => setActiveTab('token')}
          >
            Tokens de acceso
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            Guía de acciones
          </button>
        </div>

        {activeTab === 'token' ? (
          <>
            <div className="code-box">
              <span className="code-label">Endpoint de acciones rápidas (POST)</span>
              <div className="code-value-row">
                <code>{actionEndpointUrl}</code>
                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={() => handleCopy(actionEndpointUrl, 'actionUrl')}
                  aria-label="Copiar URL de acciones"
                >
                  <AppIcon name={copiedKey === 'actionUrl' ? 'check' : 'copy'} size={16} />
                </button>
              </div>
            </div>

            {newlyCreatedToken && (
              <div className="new-token-banner">
                <div className="banner-header">
                  <AppIcon name="check" size={16} />
                  <strong>¡Nuevo token generado!</strong>
                </div>
                <p>
                  Copia este token y pégalo en la cabecera <code>x-shortcut-token</code> de tu Atajo de iOS:
                </p>
                <div className="code-value-row">
                  <code>{newlyCreatedToken}</code>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleCopy(newlyCreatedToken, 'newToken')}
                  >
                    <AppIcon name={copiedKey === 'newToken' ? 'check' : 'copy'} size={14} />
                    <span>{copiedKey === 'newToken' ? 'Copiado' : 'Copiar token'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="token-list-section">
              <h4>Tokens activos</h4>
              {tokens.length === 0 ? (
                <p className="muted-text">No tienes ningún token activo. Genera uno para tu iPhone.</p>
              ) : (
                <div className="tokens-list">
                  {tokens.map((t) => (
                    <div className="token-row" key={t.id}>
                      <div>
                        <strong>{t.name}</strong>
                        <small>Creado el {new Date(t.createdAt).toLocaleDateString()}</small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleRevokeToken(t.id)}
                      >
                        Revocar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleCreateToken}
              disabled={isGeneratingToken}
            >
              <AppIcon name="plus" size={16} />
              <span>{isGeneratingToken ? 'Generando...' : 'Generar nuevo token para Atajo'}</span>
            </button>
          </>
        ) : (
          <div className="shortcut-guide-box">
            <h4 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Acciones disponibles en el Atajo
            </h4>

            <div className="guide-actions-list">
              <div className="guide-action-card">
                <strong>1. Añadir gasto</strong>
                <code>POST {actionEndpointUrl}</code>
                <pre>{JSON.stringify({ action: 'add_expense', amount: 12.50, description: 'Café', category: 'food' }, null, 2)}</pre>
              </div>

              <div className="guide-action-card">
                <strong>2. Añadir ingreso</strong>
                <code>POST {actionEndpointUrl}</code>
                <pre>{JSON.stringify({ action: 'add_income', amount: 1500.00, description: 'Nómina' }, null, 2)}</pre>
              </div>

              <div className="guide-action-card">
                <strong>3. Registrar Bizum / Reembolso</strong>
                <code>POST {actionEndpointUrl}</code>
                <pre>{JSON.stringify({ action: 'register_reimbursement', amount: 2.50, description: 'Bizum Crunchyroll', expenseShareId: 'share_id_opcional' }, null, 2)}</pre>
              </div>

              <div className="guide-action-card">
                <strong>4. Consultar deudas pendientes (Por cobrar)</strong>
                <code>POST {actionEndpointUrl}</code>
                <pre>{JSON.stringify({ action: 'get_pending_receivables' }, null, 2)}</pre>
              </div>

              <div className="guide-action-card">
                <strong>5. Consultar resumen de saldo</strong>
                <code>POST {actionEndpointUrl}</code>
                <pre>{JSON.stringify({ action: 'balance_summary' }, null, 2)}</pre>
              </div>
            </div>

            <p className="muted-text" style={{ fontSize: 11, marginTop: 12 }}>
              Cabecera obligatoria en todas las peticiones: <code>x-shortcut-token: TU_TOKEN</code>
            </p>
          </div>
        )}
      </section>

      {/* Sincronización manual */}
      <section className="card cloud-action-card">
        <div className="card-title-row">
          <div className="action-icon sync-icon">
            <AppIcon name="refresh-cw" size={20} />
          </div>
          <div>
            <h3>Sincronización manual</h3>
            <p className="description">
              Sube todos los datos locales actuales (cuentas, movimientos, presupuestos, reservas y objetivos) a tu nube de Supabase.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={handleManualMigrate}
          disabled={isMigrating}
        >
          <AppIcon name="upload" size={16} />
          <span>{isMigrating ? 'Subiendo a la nube...' : 'Subir estado local a Supabase'}</span>
        </button>
      </section>
    </div>
  )
}
