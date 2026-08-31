import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function MorePage({ finance }: { finance: ReturnTypeFinance }) {
  return <main className="page"><header className="simple-header"><h1>Más</h1></header><section className="section"><h2>Próximos pagos</h2>{finance.recurring.map(r=><div className="mini-row" key={r.id}><div><strong>{r.name}</strong><span>{r.nextDate}</span></div><strong>{money(r.amount)}</strong></div>)}</section><section className="menu-card"><button><span>◎</span><div><strong>Estadísticas</strong><small>Día, semana, mes y año</small></div><b>›</b></button><button><span>◔</span><div><strong>Presupuestos</strong><small>Límites opcionales por categoría</small></div><b>›</b></button><button><span>↻</span><div><strong>Gastos recurrentes</strong><small>Suscripciones y pagos programados</small></div><b>›</b></button><button><span>◫</span><div><strong>Cuentas</strong><small>Cuenta diaria y ahorro</small></div><b>›</b></button><button><span>⚙</span><div><strong>Ajustes</strong><small>Saldo inicial, categorías y seguridad</small></div><b>›</b></button></section></main>
}
