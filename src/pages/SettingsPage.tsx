import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'

export function SettingsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const dailyAccount = finance.accounts.find((a) => a.type === 'spending')
  const savingsAccount = finance.accounts.find((a) => a.type === 'savings')

  const [dailyInitial, setDailyInitial] = useState(() =>
    String(dailyAccount?.initialBalance ?? 0).replace('.', ',')
  )
  const [savingsInitial, setSavingsInitial] = useState(() =>
    String(savingsAccount?.initialBalance ?? 0).replace('.', ',')
  )
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const numDaily = Number(dailyInitial.replace(',', '.'))
    const numSavings = Number(savingsInitial.replace(',', '.'))

    if (!isNaN(numDaily) && dailyAccount) {
      finance.updateAccountInitialBalance(dailyAccount.id, numDaily)
    }
    if (!isNaN(numSavings) && savingsAccount) {
      finance.updateAccountInitialBalance(savingsAccount.id, numSavings)
    }

    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          ‹ Más
        </button>
        <h1>Ajustes</h1>
        <div style={{ width: 44 }} />
      </header>

      <form onSubmit={handleSave} className="settings-form">
        <section className="settings-section">
          <h2>Saldos iniciales</h2>
          <p className="settings-desc">
            Configura el punto de partida con el que comenzaste a registrar tus finanzas.
          </p>

          <div className="form-group">
            <label>
              Saldo inicial de Cuenta diaria (€)
              <input
                type="text"
                inputMode="decimal"
                value={dailyInitial}
                onChange={(e) => setDailyInitial(e.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Saldo inicial de Cuenta de Ahorro (€)
              <input
                type="text"
                inputMode="decimal"
                value={savingsInitial}
                onChange={(e) => setSavingsInitial(e.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>

          <div className="info-callout">
            <p>
              ℹ️ <strong>Importante:</strong> Modificar los saldos iniciales recalcula
              automáticamente todo el histórico de movimientos sin borrar ninguna transacción.
            </p>
          </div>

          <button type="submit" className="primary-button" style={{ marginTop: 16 }}>
            Guardar saldos iniciales
          </button>

          {savedSuccess && (
            <div className="success-toast">
              ✓ Saldos iniciales guardados y balances recalculados correctamente.
            </div>
          )}
        </section>

        <section className="settings-section" style={{ marginTop: 28 }}>
          <h2>Almacenamiento y Privacidad</h2>
          <div className="privacy-card">
            <p>
              🔒 <strong>Local-first:</strong> Todos tus datos financieros se almacenan
              únicamente en este dispositivo. No hay servidores externos, rastreadores ni cuentas en la nube.
            </p>
          </div>
        </section>
      </form>
    </main>
  )
}
