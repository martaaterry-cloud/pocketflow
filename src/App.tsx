import { useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { AddTransactionModal } from './components/AddTransactionModal'
import { CalendarPage } from './pages/CalendarPage'
import { HomePage } from './pages/HomePage'
import { MorePage } from './pages/MorePage'
import { MovementsPage } from './pages/MovementsPage'
import { SavingsPage } from './pages/SavingsPage'
import { useFinance } from './store/useFinance'

type Tab = 'home' | 'movements' | 'calendar' | 'savings' | 'more'

function shortcutPayload(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'expense' && parsed.pathname !== '/expense') return null
    const amount = Number((parsed.searchParams.get('amount') ?? '').replace(',', '.'))
    const description = parsed.searchParams.get('description') ?? 'Gasto rápido'
    const category = parsed.searchParams.get('category') ?? 'other'
    if (!amount) return null
    return { amount, description, category }
  } catch { return null }
}

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const payload = shortcutPayload(url)
      if (!payload) return
      finance.addTransaction({ type: 'expense', amount: payload.amount, description: payload.description, categoryId: payload.category, accountId: 'daily', date: new Date().toISOString() })
      setTab('home')
    })
    return () => { void listener.then(h => h.remove()) }
  }, [finance])

  const pages = {
    home: <HomePage finance={finance} onAdd={() => setAddOpen(true)} />,
    movements: <MovementsPage finance={finance} onAdd={() => setAddOpen(true)} />,
    calendar: <CalendarPage finance={finance} />,
    savings: <SavingsPage finance={finance} />,
    more: <MorePage finance={finance} />,
  }

  return <div className="app-shell">{pages[tab]}<nav className="bottom-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><span>⌂</span>Inicio</button><button className={tab==='movements'?'active':''} onClick={()=>setTab('movements')}><span>≡</span>Movimientos</button><button className={tab==='calendar'?'active':''} onClick={()=>setTab('calendar')}><span>□</span>Calendario</button><button className={tab==='savings'?'active':''} onClick={()=>setTab('savings')}><span>◇</span>Ahorro</button><button className={tab==='more'?'active':''} onClick={()=>setTab('more')}><span>•••</span>Más</button></nav><AddTransactionModal open={addOpen} onClose={()=>setAddOpen(false)} accounts={finance.accounts} categories={finance.categories} onAdd={finance.addTransaction} /></div>
}
