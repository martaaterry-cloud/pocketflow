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
import { createCleanInitialState, fetchRemoteState, uploadStateToSupabase } from './services/supabase/supabaseSync'
import { flushOfflineQueue, getPendingMutationsCount } from './services/supabase/offlineQueue'
import { initRealtimeSubscription, unsubscribeRealtime } from './services/supabase/supabaseRealtime'

type Tab = 'home' | 'movements' | 'calendar' | 'savings' | 'more'
type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Autenticación Supabase
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced')
  const [pendingCount, setPendingCount] = useState<number>(0)
  const isInitialSyncDoneRef = useRef(false)

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

  // 2. Asociar usuario autenticado a las mutaciones locales de useFinance
  useEffect(() => {
    finance.setSyncUser(user?.id ?? null)
  }, [user, finance.setSyncUser])

  // 3. Sincronización inicial determinista y Suscripción Realtime
  // ORDEN ESTRICTO:
  // 1. Inicialización app -> 2. Hidratación IndexedDB -> 3. Auth Supabase -> 4. Sincronización cloud -> 5. App lista
  useEffect(() => {
    if (!user || !authChecked || !finance.storageHydrated || isInitialSyncDoneRef.current) return
    const supabase = getSupabase()

    const runInitialSync = async () => {
      setSyncStatus('syncing')
      try {
        // A. Vaciado de cola offline pendiente
        await flushOfflineQueue(supabase, user.id)
        setPendingCount(getPendingMutationsCount())

        // B. Lectura de estado remoto validando cada consulta
        const remoteState = await fetchRemoteState(supabase, user.id)

        if (remoteState) {
          // La nube ya tiene datos de este usuario -> Fuente de verdad principal
          await finance.restoreState(remoteState)
        } else {
          // La nube está virgen para este usuario
          const localState = finance.getFullState()
          const hasRealData = localState.transactions.length > 0 &&
            !localState.transactions.every((t) => t.id.startsWith('tx-') || t.description === 'Mercadona')

          if (hasRealData) {
            // Migrar datos reales locales preexistentes una sola vez
            await uploadStateToSupabase(supabase, user.id, localState)
          } else {
            // Usuario nuevo sin datos o solo con seed demo -> inicializar con estado limpio (0 movimientos ficticios)
            const clean = createCleanInitialState()
            await uploadStateToSupabase(supabase, user.id, clean)
            await finance.restoreState(clean)
          }
        }

        // C. Conectar Suscripción Realtime (INSERT / UPDATE / DELETE sin echo loops)
        initRealtimeSubscription(supabase, user.id, {
          onTransactionInsert: (tx) => {
            finance.applyRemoteInsertTransaction(tx)
            showToast(`+${tx.amount.toFixed(2)} € (${tx.description})`)
          },
          onTransactionUpdate: (tx) => {
            finance.applyRemoteUpdateTransaction(tx)
          },
          onTransactionDelete: (txId) => {
            finance.applyRemoteDeleteTransaction(txId)
          },
          onAccountUpdate: (acc) => {
            finance.applyRemoteUpdateAccount(acc)
          },
          onBudgetUpsert: (b) => {
            finance.applyRemoteUpsertBudget(b)
          },
          onBudgetDelete: (budgetId) => {
            finance.applyRemoteDeleteBudget(budgetId)
          },
          onGoalUpsert: (g) => {
            finance.applyRemoteUpsertGoal(g)
          },
          onGoalDelete: (goalId) => {
            finance.applyRemoteDeleteGoal(goalId)
          },
          onReserveUpsert: (r) => {
            finance.applyRemoteUpsertReserve(r)
          },
          onReserveDelete: (reserveId) => {
            finance.applyRemoteDeleteReserve(reserveId)
          },
          onRecurringUpsert: (rec) => {
            finance.applyRemoteUpsertRecurring(rec)
          },
          onRecurringDelete: (recId) => {
            finance.applyRemoteDeleteRecurring(recId)
          },
          onSpecialPeriodUpsert: (sp) => {
            finance.applyRemoteUpsertSpecialPeriod(sp)
          },
          onSpecialPeriodDelete: (periodId) => {
            finance.applyRemoteDeleteSpecialPeriod(periodId)
          },
          onPlanSettingsUpdate: (ps) => {
            finance.applyRemoteUpdatePlanSettings(ps)
          },
        })

        isInitialSyncDoneRef.current = true
        setSyncStatus('synced')
      } catch (err) {
        console.warn('[Supabase] Error en sincronización inicial:', err)
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
      }
    }

    void runInitialSync()

    return () => {
      unsubscribeRealtime()
    }
  }, [user, authChecked, finance.storageHydrated, finance])

  // 4. Conectividad de red (Online / Offline)
  useEffect(() => {
    const handleOnline = async () => {
      if (!user) return
      setSyncStatus('syncing')
      try {
        const supabase = getSupabase()
        await flushOfflineQueue(supabase, user.id)
        setPendingCount(getPendingMutationsCount())

        // Reconciliación determinista al recuperar conexión
        const remote = await fetchRemoteState(supabase, user.id)
        if (remote) {
          await finance.restoreState(remote)
        }
        setSyncStatus('synced')
      } catch (err) {
        console.warn('[Sync] Error al sincronizar tras reconexión:', err)
        setSyncStatus('error')
      }
    }

    const handleOffline = () => {
      setSyncStatus('offline')
      setPendingCount(getPendingMutationsCount())
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user, finance])

  // 5. Fallback al volver a primer plano (sin comparación por length)
  useEffect(() => {
    if (!user) return

    const handleFocus = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        try {
          const supabase = getSupabase()
          const count = getPendingMutationsCount()
          if (count > 0) {
            await flushOfflineQueue(supabase, user.id)
            setPendingCount(getPendingMutationsCount())
          }
        } catch (err) {
          console.warn('[Supabase] Error en comprobación de primer plano:', err)
        }
      }
    }

    document.addEventListener('visibilitychange', handleFocus)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleFocus)
      window.removeEventListener('focus', handleFocus)
    }
  }, [user])

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

  // Si aún no se ha verificado la sesión o completado la hidratación de IndexedDB, mostramos shell sin parpadeo ni carreras
  if (!authChecked || !finance.storageHydrated) {
    return <div className="app-shell" />
  }

  // Si no hay sesión activa, mostramos la pantalla de login privado
  if (!user) {
    return <LoginPage onSuccess={() => setAuthChecked(false)} />
  }

  return (
    <div className="app-shell">
      {/* Indicador discreto de sincronización */}
      <div
        className={`sync-badge ${syncStatus}`}
        title={
          syncStatus === 'synced'
            ? 'Sincronizado con Supabase'
            : syncStatus === 'syncing'
            ? 'Sincronizando...'
            : syncStatus === 'offline'
            ? `Sin conexión (${pendingCount} operaciones pendientes)`
            : 'Error de sincronización'
        }
      >
        <span className="sync-dot" />
        <span>
          {syncStatus === 'synced' && 'Sincronizado'}
          {syncStatus === 'syncing' && 'Sincronizando…'}
          {syncStatus === 'offline' && (pendingCount > 0 ? `${pendingCount} offline` : 'Sin conexión')}
          {syncStatus === 'error' && 'Error sinc'}
        </span>
      </div>

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
