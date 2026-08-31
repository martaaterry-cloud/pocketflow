import type { ReturnTypeFinance } from '../types'
import { TransactionList } from '../components/TransactionList'

export function MovementsPage({ finance, onAdd }: { finance: ReturnTypeFinance; onAdd: () => void }) {
  return <main className="page"><header className="simple-header"><h1>Movimientos</h1><button className="round-button" onClick={onAdd}>＋</button></header><div className="filter-pills"><button className="active">Todos</button><button>Gastos</button><button>Ingresos</button><button>Transferencias</button></div><section className="section"><TransactionList transactions={finance.transactions} categories={finance.categories} /></section></main>
}
