import { useEffect, useState } from 'react'
import { AppIcon } from '../ui/icons'

type Payroll = { month: string; gross: number; socialSecurity: number; irpf: number; net: number }
const format = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
const safe = (n: number) => Number.isFinite(n) && n >= 0 ? n : 0

/** Datos informativos locales: nunca generan movimientos ni modifican saldos. */
export function PayrollPage({ onBack, userId }: { onBack: () => void; userId: string }) {
  const key = 'pocketflow:payroll:local:' + userId
  const [entries, setEntries] = useState<Payroll[]>([])
  const [month, setMonth] = useState('2026-09')
  const [gross, setGross] = useState('830.15')
  const [socialSecurity, setSocialSecurity] = useState('53.97')
  const [irpf, setIrpf] = useState('9.2')
  const [net, setNet] = useState('699.81')
  const [rate, setRate] = useState(12)
  const [monthlyGross, setMonthlyGross] = useState(1660.30)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    try {
      const raw = localStorage.getItem(key)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      setEntries(Array.isArray(parsed) ? parsed.filter((e): e is Payroll => Boolean(e && typeof e.month === 'string' && typeof e.gross === 'number' && typeof e.net === 'number' && typeof e.socialSecurity === 'number' && typeof e.irpf === 'number')) : [])
    } catch { setEntries([]) }
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(key, JSON.stringify(entries)) } catch { /* Almacenamiento no disponible */ }
  }, [key, entries, loaded])

  const monthlySS = monthlyGross * 0.065
  const monthlyNet = monthlyGross - monthlySS - monthlyGross * rate / 100
  const addEntry = () => {
    const record = { month, gross: Number(gross), socialSecurity: Number(socialSecurity), irpf: Number(irpf), net: Number(net) }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Object.values(record).some(v => typeof v === 'number' && (!Number.isFinite(v) || v < 0)) || record.irpf > 100 || Math.abs(record.gross - record.socialSecurity - record.gross * record.irpf / 100 - record.net) > 0.1) {
      window.alert('Revisa los importes: bruto menos Seguridad Social e IRPF debe coincidir con el neto.')
      return
    }
    setEntries(prev => [...prev.filter(e => e.month !== month), record].sort((a, b) => b.month.localeCompare(a.month)))
  }

  const monthLabel = (value: string) => {
    const [year, monthNumber] = value.split('-').map(Number)
    if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return value
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1))
  }

  return <main className="page payroll-page">
    <style>{`
      .payroll-page { width: 100%; max-width: 760px; margin-inline: auto; padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
      .payroll-page .payroll-heading { display: flex; align-items: center; gap: 14px; padding: 12px 0 18px; }
      .payroll-page .payroll-heading h1 { margin: 0; font-size: clamp(25px, 6vw, 32px); line-height: 1.2; }
      .payroll-page .payroll-back { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border: 0; border-radius: 14px; background: var(--surface-secondary, #ededed); color: var(--text-primary, #222); }
      .payroll-page .payroll-section { margin: 0 0 24px; }
      .payroll-page .payroll-section h2 { font-size: 19px; margin: 0 0 12px; line-height: 1.35; }
      .payroll-page .payroll-card { background: var(--surface, #fff); border: 1px solid var(--border, #ededed); border-radius: 22px; padding: 18px; min-width: 0; box-shadow: 0 3px 18px rgba(0,0,0,.025); }
      .payroll-page .payroll-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; font-size: 13px; font-weight: 600; }
      .payroll-page .payroll-field input { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--border, #ddd); background: var(--surface, #fff); color: var(--text-primary, #222); border-radius: 12px; min-height: 46px; padding: 9px 12px; font-size: 16px; font-weight: 500; }
      .payroll-page .payroll-field select { display: block; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; border: 1px solid var(--border, #ddd); background: var(--surface, #fff); color: var(--text-primary, #222); border-radius: 12px; min-height: 46px; padding: 9px 8px; font-size: 16px; }
      .payroll-page .payroll-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 13px; }
      .payroll-page .payroll-sim { display: grid; gap: 16px; }
      .payroll-page .payroll-result { background: var(--surface-secondary, #f5f5f5); border-radius: 17px; padding: 17px 12px; text-align: center; }
      .payroll-page .payroll-result .payroll-amount { display: block; font-size: clamp(27px, 7vw, 36px); font-weight: 750; line-height: 1.25; margin: 4px 0; font-variant-numeric: tabular-nums; }
      .payroll-page .payroll-muted { color: var(--text-muted, #777); font-size: 12px; line-height: 1.5; }
      .payroll-page .payroll-range { width: 100%; margin: 12px 0 2px; accent-color: #2563eb; }
      .payroll-page .payroll-breakdown { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 4px 0; }
      .payroll-page .payroll-breakdown strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .payroll-page .payroll-save { width: 100%; min-height: 50px; display: flex; justify-content: center; align-items: center; gap: 9px; border: 0; border-radius: 13px; background: #1768d2; color: #fff; font-weight: 750; font-size: 16px; cursor: pointer; margin-top: 17px; box-shadow: 0 5px 14px rgba(23,104,210,.2); }
      .payroll-page .payroll-save:active { transform: scale(.99); }
      .payroll-page .payroll-entry { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border, #eee); }
      .payroll-page .payroll-entry:last-child { border-bottom: 0; }
      .payroll-page .payroll-entry-title { font-size: 15px; font-weight: 700; text-transform: capitalize; }
      .payroll-page .payroll-entry-amount { font-size: 18px; font-weight: 750; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .payroll-page .payroll-entry-actions { display: flex; align-items: center; gap: 8px; }
      .payroll-page .payroll-delete { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 38px; border: 0; border-radius: 12px; background: var(--surface-secondary, #f0f0f0); color: var(--text-primary, #333); }
      @media(max-width: 350px) { .payroll-page .payroll-card { padding: 14px; } .payroll-page .payroll-grid { gap: 9px; } }
    `}</style>
    <header className="payroll-heading">
      <button type="button" className="payroll-back" onClick={onBack} aria-label="Volver"><AppIcon name="chevron-left" size={23}/></button>
      <h1>Nóminas</h1>
    </header>
    <section className="payroll-section">
      <h2>Simulador de salario</h2>
      <div className="payroll-card payroll-sim">
        <label className="payroll-field">Bruto mensual estimado (€)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={monthlyGross} onChange={e => setMonthlyGross(safe(Number(e.target.value)))}/>
        </label>
        <div className="payroll-result">
          <div className="payroll-muted">Neto mensual orientativo</div>
          <strong className="payroll-amount">{format(monthlyNet)}</strong>
          <div className="payroll-muted">IRPF seleccionado: <strong>{rate.toLocaleString('es-ES')} %</strong></div>
          <input className="payroll-range" aria-label="Porcentaje de IRPF" type="range" min="0" max="30" step="0.5" value={rate} onChange={e => setRate(Number(e.target.value))}/>
        </div>
        <div>
          <div className="payroll-breakdown"><span>Seguridad Social estimada (6,5 %)</span><strong>−{format(monthlySS)}</strong></div>
          <div className="payroll-breakdown"><span>Retención IRPF</span><strong>−{format(monthlyGross * rate / 100)}</strong></div>
        </div>
        <p className="payroll-muted" style={{ margin: 0 }}>Estimación informativa, no una predicción fiscal ni un ingreso real.</p>
      </div>
    </section>
    <section className="payroll-section">
      <h2>Registrar nómina</h2>
      <div className="payroll-card">
        <div className="payroll-grid" style={{ marginBottom: 14 }}>
          <label className="payroll-field">Mes
            <select aria-label="Mes de la nómina" value={month.split('-')[1] ?? '09'} onChange={e => setMonth((month.split('-')[0] || '2026') + '-' + e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => {
                const value = String(i + 1).padStart(2, '0')
                const label = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, i, 1))
                return <option key={value} value={value}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>
              })}
            </select>
          </label>
          <label className="payroll-field">Año
            <select aria-label="Año de la nómina" value={month.split('-')[0] ?? '2026'} onChange={e => setMonth(e.target.value + '-' + (month.split('-')[1] || '09'))}>
              {Array.from({ length: 11 }, (_, i) => 2024 + i).map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>
        <div className="payroll-grid">
          {([{ label: 'Bruto (€)', value: gross, set: setGross }, { label: 'Seguridad Social (€)', value: socialSecurity, set: setSocialSecurity }, { label: 'IRPF (%)', value: irpf, set: setIrpf }, { label: 'Neto (€)', value: net, set: setNet }] as const).map(field =>
            <label className="payroll-field" key={field.label}>{field.label}
              <input type="number" min="0" step="0.01" inputMode="decimal" value={field.value} onChange={e => field.set(e.target.value)}/>
            </label>
          )}
        </div>
        <button type="button" className="payroll-save" onClick={addEntry}><AppIcon name="check" size={20}/>Guardar nómina</button>
        <p className="payroll-muted" style={{ margin: '12px 0 0', textAlign: 'center' }}>Guardado solo en este dispositivo. No modifica tus saldos ni se sincroniza con la nube.</p>
      </div>
    </section>
    <section className="payroll-section">
      <h2>Historial <span className="payroll-muted">({entries.length})</span></h2>
      <div className="payroll-card">
        {entries.length === 0 ? <p className="payroll-muted" style={{ margin: 0 }}>Aún no has guardado nóminas.</p> : entries.map(e =>
          <div className="payroll-entry" key={e.month}>
            <div style={{ minWidth: 0 }}>
              <div className="payroll-entry-title">{monthLabel(e.month)}</div>
              <div className="payroll-muted">Bruto {format(e.gross)} · IRPF {e.irpf.toLocaleString('es-ES')} %</div>
            </div>
            <div className="payroll-entry-actions">
              <span className="payroll-entry-amount">{format(e.net)}</span>
              <button type="button" className="payroll-delete" onClick={() => { if (window.confirm('¿Eliminar esta nómina informativa?')) setEntries(prev => prev.filter(p => p.month !== e.month)) }} aria-label={'Eliminar nómina ' + e.month}><AppIcon name="trash-2" size={17}/></button>
            </div>
          </div>
        )}
      </div>
    </section>
  </main>
}
