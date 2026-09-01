import { useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { AddTransactionModal } from './components/AddTransactionModal'
import type { Transaction } from './models/finance'
import { CalendarPage } from './pages/CalendarPage'
import { HomePage } from './pages/HomePage'
import { MorePage } from './pages/MorePage'
import { MovementsPage } from './pages/MovementsPage'
import { SavingsPage } from './pages/SavingsPage'
import { AppIcon } from './ui/icons'
import { useFinance } from './store/useFinance'
import { createDeepLinkDeduplicator, parseShortcutUrl } from './utils/deepLink'

type Tab = 'home' | 'movements' | 'calendar' | 'savings' | 'more'

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const deduplicatorRef = useRef(createDeepLinkDeduplicator(2500))

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!deduplicatorRef.current.shouldProcess(url)) {
        return
      }

      const validCategoryIds = finance.categories.map((c) => c.id)
      const parsed = parseShortcutUrl(url, validCategoryIds)

      if (!parsed.valid) {
        showToast('Enlace no válido', 'error')
        return
      }

      finance.addTransaction({
        type: 'expense',
        amount: parsed.amount,
        description: parsed.description,
        categoryId: parsed.categoryId,
        accountId: 'daily',
        date: new Date().toISOString(),
      })

      setTab('home')
      showToast('Gasto añadido', 'success')
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
      {tab === 'more' && (
        <MorePage finance={finance} onNavigateToSavings={() => setTab('savings')} />
      )}

      <nav className="bottom-nav">
        <button
          type="button"
          className={tab === 'home' ? 'active' : ''}
          onClick={() => setTab('home')}
        >
          <span className="nav-icon"><AppIcon name="home" size={20} /></span>
          <span className="nav-label">Inicio</span>
        </button>
        <button
          type="button"
          className={tab === 'movements' ? 'active' : ''}
          onClick={() => setTab('movements')}
        >
          <span className="nav-icon"><AppIcon name="receipt" size={20} /></span>
          <span className="nav-label">Movimientos</span>
        </button>
        <button
          type="button"
          className={tab === 'calendar' ? 'active' : ''}
          onClick={() => setTab('calendar')}
        >
          <span className="nav-icon"><AppIcon name="calendar" size={20} /></span>
          <span className="nav-label">Calendario</span>
        </button>
        <button
          type="button"
          className={tab === 'savings' ? 'active' : ''}
          onClick={() => setTab('savings')}
        >
          <span className="nav-icon"><AppIcon name="piggy-bank" size={20} /></span>
          <span className="nav-label">Ahorro</span>
        </button>
        <button
          type="button"
          className={tab === 'more' ? 'active' : ''}
          onClick={() => setTab('more')}
        >
          <span className="nav-icon"><AppIcon name="more-horizontal" size={20} /></span>
          <span className="nav-label">Más</span>
        </button>
      </nav>

      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <AppIcon name={toast.type === 'success' ? 'check' : 'circle-alert'} size={16} />
          <span>{toast.message}</span>
        </div>
      )}

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
