import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function AccountsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const dailyAccount = finance.accounts.find((a) => a.type === 'spending')
  const savingsAccount = finance.accounts.find((a) => a.type === 'savings')

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [tempInitialBalance, setTempInitialBalance] = useState('')

  const handleStartEdit = (accountId: string, currentInitial: number) => {
    setEditingAccountId(accountId)
    setTempInitialBalance(String(currentInitial).replace('.', ','))
  }

  const handleSaveInitial = (accountId: string) => {
    const numeric = Number(tempInitialBalance.replace(',', '.'))
    if (!isNaN(numeric)) {
      finance.updateAccountInitialBalance(accountId, numeric)
    }
    setEditingAccountId(null)
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          ‹ Más
        </button>
        <h1>Cuentas</h1>
        <div style={{ width: 44 }} />
      </header>

      {/* Tarjeta de Dinero Total */}
      <section className="hero-card light" style={{ marginBottom: 20 }}>
        <span>Dinero total (derivado)</span>
        <strong>{money(finance.totals.totalMoney)}</strong>
        <div className="hero-meta">
          <span>Cuenta diaria + Cuenta de ahorro</span>
        </div>
      </section>

      {/* Cuenta diaria */}
      {dailyAccount && (
        <section className="account-card">
          <div className="account-header">
            <div className="account-title">
              <span className="account-icon spending">💳</span>
              <div>
                <strong>{dailyAccount.name}</strong>
                <span className="account-subtitle">Uso cotidiano y gastos del día a día</span>
              </div>
            </div>
            <div className="account-balance-box">
              <span className="balance-label">Saldo actual (calculado)</span>
              <strong className="balance-value">{money(dailyAccount.balance ?? 0)}</strong>
            </div>
          </div>

          <div className="account-footer">
            {editingAccountId === dailyAccount.id ? (
              <div className="initial-balance-edit">
                <label>Saldo inicial (€):</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tempInitialBalance}
                  onChange={(e) => setTempInitialBalance(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="save-btn"
                  onClick={() => handleSaveInitial(dailyAccount.id)}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setEditingAccountId(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="initial-balance-info">
                <span>
                  Saldo inicial: <b>{money(dailyAccount.initialBalance ?? 0)}</b>
                </span>
                <button
                  type="button"
                  className="edit-initial-btn"
                  onClick={() => handleStartEdit(dailyAccount.id, dailyAccount.initialBalance ?? 0)}
                >
                  Editar saldo inicial
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Cuenta Ahorro */}
      {savingsAccount && (
        <section className="account-card" style={{ marginTop: 16 }}>
          <div className="account-header">
            <div className="account-title">
              <span className="account-icon savings">🏦</span>
              <div>
                <strong>{savingsAccount.name}</strong>
                <span className="account-subtitle">Fondo de reserva y metas de ahorro</span>
              </div>
            </div>
            <div className="account-balance-box">
              <span className="balance-label">Saldo actual (calculado)</span>
              <strong className="balance-value">{money(savingsAccount.balance ?? 0)}</strong>
            </div>
          </div>

          <div className="account-footer">
            {editingAccountId === savingsAccount.id ? (
              <div className="initial-balance-edit">
                <label>Saldo inicial (€):</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tempInitialBalance}
                  onChange={(e) => setTempInitialBalance(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="save-btn"
                  onClick={() => handleSaveInitial(savingsAccount.id)}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setEditingAccountId(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="initial-balance-info">
                <span>
                  Saldo inicial: <b>{money(savingsAccount.initialBalance ?? 0)}</b>
                </span>
                <button
                  type="button"
                  className="edit-initial-btn"
                  onClick={() => handleStartEdit(savingsAccount.id, savingsAccount.initialBalance ?? 0)}
                >
                  Editar saldo inicial
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="info-callout" style={{ marginTop: 24 }}>
        <p>
          💡 <strong>Regla de integridad:</strong> El saldo actual nunca es editable directamente.
          Se deriva siempre de sumar o restar todas las transacciones históricas a tu saldo inicial.
        </p>
      </div>
    </main>
  )
}
