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

  return <main className="page">
    <header className="simple-header">
      <button type="button" className="back-button" onClick={onBack} aria-label="Volver"><AppIcon name="chevron-left" size={22} /></button>
      <h1>Nóminas</h1>
    </header>
    <section className="section">
      <div className="section-title"><h2>Simulador de salario</h2></div>
      <div className="menu-card" style={{ padding: 18, display: 'grid', gap: 14 }}>
        <label>Bruto mensual estimado (€)<input type="number" min="0" step="0.01" value={monthlyGross} onChange={e => setMonthlyGross(safe(Number(e.target.value)))} style={{ display: 'block', width: '100%', padding: 10 }} /></label>
        <div style={{ textAlign: 'center' }}>
          <div className="muted">IRPF seleccionado</div>
          <strong style={{ fontSize: 32 }}>{rate.toLocaleString('es-ES')} %</strong>
          <input aria-label="Porcentaje de IRPF" type="range" min="0" max="30" step="0.5" value={rate} onChange={e => setRate(Number(e.target.value))} style={{ display: 'block', width: '100%' }} />
          <strong style={{ fontSize: 26 }}>{format(monthlyNet)}</strong>
          <div className="muted">Neto orientativo · cotización estimada del 6,5 %</div>
        </div>
        <div>Seguridad Social estimada: {format(monthlySS)}</div>
        <div>Retención IRPF: {format(monthlyGross * rate / 100)}</div>
        <small className="muted">Es una simulación, no una predicción fiscal ni un ingreso real.</small>
      </div>
    </section>
    <section className="section">
      <div className="section-title"><h2>Registrar nómina informativa</h2></div>
      <div className="menu-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
        <p className="muted">Los datos se guardan solo en este dispositivo. No se sincronizan con la nube ni generan ingresos o alteran balances.</p>
        <label>Mes de la nómina<input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} /></label>
        {([{ label: 'Bruto (€)', value: gross, set: setGross }, { label: 'Seguridad Social (€)', value: socialSecurity, set: setSocialSecurity }, { label: 'IRPF (%)', value: irpf, set: setIrpf }, { label: 'Neto (€)', value: net, set: setNet }] as const).map(field => <label key={field.label}>{field.label}<input type="number" min="0" step="0.01" value={field.value} onChange={e => field.set(e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} /></label>)}
        <button type="button" className="primary-button" onClick={addEntry}>Guardar nómina</button>
      </div>
    </section>
    <section className="section">
      <div className="section-title"><h2>Historial</h2></div>
      <div className="transaction-list">
        {entries.length === 0 ? <p className="muted" style={{ padding: 16 }}>Aún no has guardado nóminas.</p> : entries.map(e => <div className="mini-row" key={e.month}><div><strong>{e.month}</strong><span>Bruto {format(e.gross)} · IRPF {e.irpf.toLocaleString('es-ES')} %</span></div><div style={{ textAlign: 'right' }}><strong>{format(e.net)}</strong><button type="button" onClick={() => { if (window.confirm('¿Eliminar esta nómina informativa?')) setEntries(prev => prev.filter(p => p.month !== e.month)) }} aria-label={'Eliminar nómina ' + e.month}><AppIcon name="trash-2" size={16}/></button></div></div>)}
      </div>
    </section>
  </main>
}
