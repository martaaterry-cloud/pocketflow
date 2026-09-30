import { useState, useMemo } from 'react'
import type { Account } from '../models/finance'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface AdjustBalanceModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  cashBalance: number
  onAdjustCash: (realAmount: number, date?: string, note?: string) => void
  onAdjustAccount: (accountId: string, realAmount: number, date?: string, note?: string) => void
}

export function AdjustBalanceModal({
  open,
  onClose,
  accounts,
  cashBalance,
  onAdjustCash,
  onAdjustAccount,
}: AdjustBalanceModalProps) {
  const [targetType, setTargetType] = useState<'account' | 'cash'>('account')
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => accounts[0]?.id ?? 'daily')
  const [realBalanceInput, setRealBalanceInput] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentSelectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0]
  }, [accounts, selectedAccountId])

  const appBalance = useMemo(() => {
    if (targetType === 'cash') {
      return cashBalance
    }
    return currentSelectedAccount?.balance ?? 0
  }, [targetType, cashBalance, currentSelectedAccount])

  const parsedRealBalance = useMemo(() => {
    const raw = realBalanceInput.trim().replace(',', '.')
    if (!raw) return null
    const num = Number(raw)
    return isNaN(num) ? null : num
  }, [realBalanceInput])

  const difference = useMemo(() => {
    if (parsedRealBalance === null) return null
    return Math.round((parsedRealBalance - appBalance) * 100) / 100
  }, [parsedRealBalance, appBalance])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (parsedRealBalance === null) {
      setError('Introduce un saldo real válido.')
      return
    }

    if (difference === 0) {
      setError('El saldo introducido es idéntico al actual en la aplicación. No se requiere ajuste.')
      return
    }

    if (targetType === 'cash') {
      onAdjustCash(parsedRealBalance, date, note.trim() || undefined)
    } else {
      if (!selectedAccountId) {
        setError('Selecciona una cuenta.')
        return
      }
      onAdjustAccount(selectedAccountId, parsedRealBalance, date, note.trim() || undefined)
    }

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name="scale" size={18} color="#fff" />
            </div>
            <h3>Ajustar Saldo Real</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Selector de Medio: Cuenta vs Efectivo */}
          <div className="form-group">
            <label>Ubicación a corregir</label>
            <div className="segmented-control" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                className={`segmented-btn ${targetType === 'account' ? 'active' : ''}`}
                onClick={() => {
                  setTargetType('account')
                  setError(null)
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <AppIcon name="landmark" size={15} />
                <span>Cuenta bancaria</span>
              </button>
              <button
                type="button"
                className={`segmented-btn ${targetType === 'cash' ? 'active' : ''}`}
                onClick={() => {
                  setTargetType('cash')
                  setError(null)
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <AppIcon name="wallet" size={15} />
                <span>Efectivo</span>
              </button>
            </div>
          </div>

          {/* Selector de Cuenta si es Cuenta */}
          {targetType === 'account' && (
            <div className="form-group">
              <label htmlFor="adjust-account-select">Cuenta</label>
              <select
                id="adjust-account-select"
                className="form-control"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({money(acc.balance ?? 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Saldo actual en App */}
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--bg-card-light, #f8fafc)',
              borderRadius: 12,
              border: '1px solid var(--border-color, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Saldo en Pocket Flow:</span>
            <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{money(appBalance)}</strong>
          </div>

          {/* Input Saldo Real Final */}
          <div className="form-group">
            <label htmlFor="adjust-real-amount">
              {targetType === 'cash' ? 'Efectivo real contado (€)' : 'Saldo real en la cuenta bancaria (€)'}
            </label>
            <input
              id="adjust-real-amount"
              type="text"
              inputMode="decimal"
              className="form-control"
              placeholder="Ej. 78,00"
              value={realBalanceInput}
              onChange={(e) => setRealBalanceInput(e.target.value)}
              autoFocus
            />
          </div>

          {/* Cálculo de diferencia */}
          {difference !== null && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background:
                  difference === 0
                    ? 'var(--bg-card-light, #f8fafc)'
                    : difference > 0
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${
                  difference === 0
                    ? 'var(--border-color, #e2e8f0)'
                    : difference > 0
                    ? '#10b981'
                    : '#ef4444'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {difference === 0
                  ? 'Sin diferencia'
                  : difference > 0
                  ? 'Ajuste positivo (falta dinero en app):'
                  : 'Ajuste negativo (sobra dinero en app):'}
              </span>
              <strong
                style={{
                  fontSize: '0.95rem',
                  color: difference === 0 ? 'var(--text-muted)' : difference > 0 ? '#10b981' : '#ef4444',
                }}
              >
                {difference > 0 ? `+${money(difference)}` : money(difference)}
              </strong>
            </div>
          )}

          {/* Fecha */}
          <div className="form-group">
            <label htmlFor="adjust-date">Fecha del ajuste</label>
            <input
              id="adjust-date"
              type="date"
              className="form-control"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Nota opcional */}
          <div className="form-group">
            <label htmlFor="adjust-note">Motivo / Nota (opcional)</label>
            <input
              id="adjust-note"
              type="text"
              className="form-control"
              placeholder="Ej. Arqueo físico, redondeo, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions" style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={parsedRealBalance === null || difference === 0}
              style={{ flex: 1, background: '#f59e0b', borderColor: '#f59e0b' }}
            >
              Confirmar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
