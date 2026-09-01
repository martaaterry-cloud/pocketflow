import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import type { User } from '@supabase/supabase-js'
import { AddTransactionModal } from './components/AddTransactionModal'
import type { Transaction } from './models/finance'
import { CalendarPage } from './pages/CalendarPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MorePage } from './pages/MorePage'
import { MovementsPage } from './pages/MovementsPage'
import { SavingsPage } from './pages/SavingsPage'
import { AppIcon } from './ui/icons'
import { useFinance } from './store/useFinance'
import { cleanUrlQueryParams, createDeepLinkDeduplicator, parseShortcutUrl } from './utils/deepLink'
import { getSupabase } from './services/supabase/supabaseClient'
import { fetchRemoteState, uploadStateToSupabase } from './services/supabase/supabaseSync'
import { flushOfflineQueue } from './services/supabase/offlineQueue'

type Tab = 'home' | 'movements' | 'calendar' | 'savings' | 'more'

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Autenticación Supabase
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const isInitialSyncDoneRef = useRef(false)
  const prevFullStateRef = useRef<string>('')

  const deduplicatorRef = useRef(createDeepLinkDeduplicator(2500))

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  // 1. Verificar sesión persistente de Supabase al arrancar
  useEffect(() => {
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthChecked(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthChecked(true)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // 2. Sincronización inicial cuando el usuario está logueado
  useEffect(() => {
    if (!user || isInitialSyncDoneRef.current) return
    const supabase = getSupabase()

    const initialSync = async () => {
      try {
        await flushOfflineQueue(supabase, user.id)
        const remoteState = await fetchRemoteState(supabase, user.id)
        if (remoteState) {
          await finance.restoreState(remoteState)
        } else {
          // Primera subida: migrar datos locales existentes a Supabase
          const localState = finance.getFullState()
          await uploadStateToSupabase(supabase, user.id, localState)
        }
        isInitialSyncDoneRef.current = true
      } catch (err) {
        console.warn('[Supabase] Error en sincronización inicial:', err)
      }
    }

    void initialSync()
  }, [user, finance])

  // 3. Subir cambios locales a Supabase (debounced)
  useEffect(() => {
    if (!user || !isInitialSyncDoneRef.current) return
    const currentState = finance.getFullState()
    const currentStateJson = JSON.stringify(currentState)

    if (prevFullStateRef.current === '') {
      prevFullStateRef.current = currentStateJson
      return
    }
    if (prevFullStateRef.current === currentStateJson) return
    prevFullStateRef.current = currentStateJson

    const timer = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const supabase = getSupabase()
        await uploadStateToSupabase(supabase, user.id, currentState)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [finance, user])

  // 4. Sincronizar desde la nube al volver a primer plano (recupera gastos creados por el Atajo)
  useEffect(() => {
    if (!user) return

    const pullRemoteChanges = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        try {
          const supabase = getSupabase()
          const remote = await fetchRemoteState(supabase, user.id)
          if (remote && remote.transactions.length !== finance.transactions.length) {
            await finance.restoreState(remote)
            showToast('Sincronizado con la nube')
          }
        } catch (err) {
          console.warn('[Supabase] Error al comprobar cambios en primer plano:', err)
        }
      }
    }

    document.addEventListener('visibilitychange', pullRemoteChanges)
    window.addEventListener('focus', pullRemoteChanges)
    return () => {
      document.removeEventListener('visibilitychange', pullRemoteChanges)
      window.removeEventListener('focus', pullRemoteChanges)
    }
  }, [user, finance])

  const processIncomingUrl = useCallback(
    (rawUrl: string, isWebQuery = false) => {
      if (!deduplicatorRef.current.shouldProcess(rawUrl)) {
        if (isWebQuery) cleanUrlQueryParams()
        return
      }

      const validCategoryIds = finance.categories.map((c) => c.id)
      const parsed = parseShortcutUrl(rawUrl, validCategoryIds)

      if (isWebQuery) {
        cleanUrlQueryParams()
      }

      if (!parsed.valid) {
        if (!isWebQuery || rawUrl.includes('action=expense')) {
          showToast('Enlace no válido', 'error')
        }
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
    },
    [finance]
  )

  useEffect(() => {
    // 1. Procesa URL web si se abrió desde navegador / PWA con query params
    if (typeof window !== 'undefined' && window.location.search) {
      const search = window.location.search
      if (search.includes('action=expense') || search.includes('amount=')) {
        processIncomingUrl(window.location.href, true)
      }
    }

    // 2. Capacitor native appUrlOpen listener
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      processIncomingUrl(url, false)
    })

    return () => {
      void listener.then((h) => h.remove())
    }
  }, [processIncomingUrl])

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

  // Si aún no se ha verificado la sesión, mostramos shell ligero sin parpadeo
  if (!authChecked) {
    return <div className="app-shell" />
  }

  // Si no hay sesión activa, mostramos la pantalla de login privado
  if (!user) {
    return <LoginPage onSuccess={() => setAuthChecked(false)} />
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
        <MorePage
          finance={finance}
          user={user}
          onNavigateToSavings={() => setTab('savings')}
          onToast={showToast}
          onSignOut={() => setUser(null)}
        />
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
