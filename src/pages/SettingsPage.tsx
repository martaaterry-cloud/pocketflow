import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { AppIcon } from '../ui/icons'

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
          <AppIcon name="chevron-left" size={16} /> Más
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
            <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="info" size={16} />
              <span>
                <strong>Importante:</strong> Modificar los saldos iniciales recalcula
                automáticamente todo el histórico de movimientos sin borrar ninguna transacción.
              </span>
            </p>
          </div>

          <button type="submit" className="primary-button" style={{ marginTop: 16 }}>
            Guardar saldos iniciales
          </button>

          {savedSuccess && (
            <div className="success-toast" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="check" size={16} />
              <span>Saldos iniciales guardados y balances recalculados correctamente.</span>
            </div>
          )}
        </section>

        <section className="settings-section" style={{ marginTop: 28 }}>
          <h2>Almacenamiento y Sincronización</h2>
          <div className="privacy-card">
            <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="lock" size={16} />
              <span>
                <strong>Sincronización en la nube:</strong> Supabase es la fuente principal de datos.
                Pocketflow mantiene una copia local en este dispositivo para que puedas seguir utilizándola
                sin conexión. Los cambios se sincronizan automáticamente al recuperar la red.
              </span>
            </p>
          </div>
        </section>
      </form>
    </main>
  )
}
