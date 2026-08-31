import { useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { AddTransactionModal } from './components/AddTransactionModal'
import type { Transaction } from './models/finance'
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
  } catch {
    return null
  }
}

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  useEffect(() => {
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const payload = shortcutPayload(url)
      if (!payload) return
      finance.addTransaction({
        type: 'expense',
        amount: payload.amount,
        description: payload.description,
        categoryId: payload.category,
        accountId: 'daily',
        date: new Date().toISOString(),
      })
      setTab('home')
    })
    return () => {
      void listener.then((h) => h.remove())
    }
  }, [finance])

  const handleOpenAdd = () => {
    setSelectedTx(null)
    setIsModalOpen(true)
  }

  const handleSelectTransaction = (tx: Transaction) => {
    setSelectedTx(tx)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedTx(null)
  }

  return (
    <div className="app-shell">
      {tab === 'home' && (
        <HomePage
          finance={finance}
          onAdd={handleOpenAdd}
          onSelectTransaction={handleSelectTransaction}
        />
      )}
      {tab === 'movements' && (
        <MovementsPage
          finance={finance}
          onAdd={handleOpenAdd}
          onSelectTransaction={handleSelectTransaction}
        />
      )}
      {tab === 'calendar' && (
        <CalendarPage
          finance={finance}
          onSelectTransaction={handleSelectTransaction}
        />
      )}
      {tab === 'savings' && <SavingsPage finance={finance} />}
      {tab === 'more' && <MorePage finance={finance} />}

      <nav className="bottom-nav">
        <button
          type="button"
          className={tab === 'home' ? 'active' : ''}
          onClick={() => setTab('home')}
        >
          <span className="nav-icon">⌂</span>
          <span className="nav-label">Inicio</span>
        </button>
        <button
          type="button"
          className={tab === 'movements' ? 'active' : ''}
          onClick={() => setTab('movements')}
        >
          <span className="nav-icon">≡</span>
          <span className="nav-label">Movimientos</span>
        </button>
        <button
          type="button"
          className={tab === 'calendar' ? 'active' : ''}
          onClick={() => setTab('calendar')}
        >
          <span className="nav-icon">□</span>
          <span className="nav-label">Calendario</span>
        </button>
        <button
          type="button"
          className={tab === 'savings' ? 'active' : ''}
          onClick={() => setTab('savings')}
        >
          <span className="nav-icon">◇</span>
          <span className="nav-label">Ahorro</span>
        </button>
        <button
          type="button"
          className={tab === 'more' ? 'active' : ''}
          onClick={() => setTab('more')}
        >
          <span className="nav-icon">•••</span>
          <span className="nav-label">Más</span>
        </button>
      </nav>

      <AddTransactionModal
        open={isModalOpen}
        onClose={handleCloseModal}
        accounts={finance.accounts}
        categories={finance.categories}
        initialTransaction={selectedTx}
        onAdd={finance.addTransaction}
        onUpdate={finance.updateTransaction}
        onDelete={finance.deleteTransaction}
      />
    </div>
  )
}
