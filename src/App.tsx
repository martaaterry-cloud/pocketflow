import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import type { User } from '@supabase/supabase-js'
import { AddTransactionModal } from './components/AddTransactionModal'
import { QuickActionSheet } from './components/QuickActionSheet'
import { ReimbursementModal } from './components/ReimbursementModal'
import { SharedExpenseDetailModal } from './components/SharedExpenseDetailModal'
import type { Transaction } from './models/finance'
import { CalendarPage } from './pages/CalendarPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MorePage, type MoreSubView } from './pages/MorePage'
import { MovementsPage } from './pages/MovementsPage'
import { SavingsPage } from './pages/SavingsPage'
import { AppIcon } from './ui/icons'
import { useFinance } from './store/useFinance'
import { cleanUrlQueryParams, createDeepLinkDeduplicator, parseShortcutUrl } from './utils/deepLink'
import { getSupabase } from './services/supabase/supabaseClient'
import { createCleanInitialState, fetchRemoteState, uploadStateToSupabase } from './services/supabase/supabaseSync'
import { flushOfflineQueue, getPendingMutationsCount, subscribeOfflineQueue } from './services/supabase/offlineQueue'
import { ensureRealtimeConnection, initRealtimeSubscription, unsubscribeRealtime } from './services/supabase/supabaseRealtime'

type Tab = 'home' | 'movements' | 'calendar' | 'savings' | 'more'
export type SyncStatus = 'connecting' | 'connected' | 'syncing' | 'up_to_date' | 'synced' | 'offline' | 'error'

export default function App() {
  const finance = useFinance()
  const [tab, setTab] = useState<Tab>('home')
  const [moreSubView, setMoreSubView] = useState<MoreSubView>('menu')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Autenticación Supabase
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const financeRef = useRef(finance)
  financeRef.current = finance

  const isInitialSyncInProgressRef = useRef(false)
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
    financeRef.current.setSyncUser(user?.id ?? null)
  }, [user?.id])

  // 2.1. Reflejar cambios de la cola offline de inmediato en el contador
  useEffect(() => {
    return subscribeOfflineQueue((count) => {
      setPendingCount(count)
    })
  }, [])

  // 2.2. Conectar mutaciones locales de useFinance al badge de sincronización
  useEffect(() => {
    financeRef.current.setOnSyncStatusChange((status) => {
      setSyncStatus(status)
    })
    return () => {
      financeRef.current.setOnSyncStatusChange(null)
    }
  }, [])

  // 2.3. Transición suave: tras confirmar "Al día", pasar a "Conectado" tras breve intervalo
  useEffect(() => {
    if (syncStatus === 'up_to_date' || syncStatus === 'synced') {
      const timer = setTimeout(() => {
        setSyncStatus((prev) =>
          (prev === 'up_to_date' || prev === 'synced') && isRealtimeConnected ? 'connected' : prev
        )
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [syncStatus, isRealtimeConnected])

  // 3. Sincronización inicial determinista (solo una vez por sesión de usuario)
  // Bloquea ejecuciones concurrentes y solo corre cuando storageHydrated es true
  useEffect(() => {
    if (!user?.id || !authChecked || !finance.storageHydrated) return
    if (isInitialSyncInProgressRef.current || isInitialSyncDoneRef.current) return

    isInitialSyncInProgressRef.current = true
    setSyncStatus('syncing')
    const supabase = getSupabase()
    const userId = user.id

    const runInitialSync = async () => {
      try {
        // A. Vaciado de cola offline pendiente
        await flushOfflineQueue(supabase, userId)
        setPendingCount(getPendingMutationsCount())

        // B. Lectura de estado remoto validando cada consulta
        const remoteState = await fetchRemoteState(supabase, userId)

        if (remoteState) {
          // La nube ya tiene datos de este usuario -> Fuente de verdad principal
          await financeRef.current.restoreState(remoteState)
        } else {
          // La nube está virgen para este usuario
          const localState = financeRef.current.getFullState()
          const hasRealData = localState.transactions.length > 0 &&
            !localState.transactions.every((t) => t.id.startsWith('tx-') || t.description === 'Mercadona')

          if (hasRealData) {
            // Migrar datos reales locales preexistentes una sola vez
            await uploadStateToSupabase(supabase, userId, localState)
          } else {
            // Usuario nuevo sin datos o solo con seed demo -> inicializar con estado limpio (0 movimientos ficticios)
            const clean = createCleanInitialState()
            await uploadStateToSupabase(supabase, userId, clean)
            await financeRef.current.restoreState(clean)
          }
        }

        isInitialSyncDoneRef.current = true
        // Al completar la reconciliación inicial confirmada, marcar "Al día"
        setSyncStatus('up_to_date')
      } catch (err) {
        console.warn('[Supabase] Error en sincronización inicial:', err)
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
      } finally {
        isInitialSyncInProgressRef.current = false
      }
    }

    void runInitialSync()
  }, [user?.id, authChecked, finance.storageHydrated, isRealtimeConnected])

  // 4. Suscripción Realtime PERMANENTE durante toda la sesión del usuario
  // DEPENDENCIAS ESTABLES: [user?.id]. Jamás se destruye por cambios de estado de finance!
  useEffect(() => {
    if (!user?.id) return
    const supabase = getSupabase()
    const userId = user.id

    initRealtimeSubscription(supabase, userId, {
      onStatusChange: (status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true)
          setSyncStatus((prev) => (prev === 'connecting' ? 'connected' : prev))
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsRealtimeConnected(false)
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            setSyncStatus('connecting')
          }
        }
      },
      onTransactionInsert: (tx) => {
        financeRef.current.applyRemoteInsertTransaction(tx)
        showToast(`+${tx.amount.toFixed(2)} € (${tx.description})`)
        setSyncStatus('up_to_date')
      },
      onTransactionUpdate: (tx) => {
        financeRef.current.applyRemoteUpdateTransaction(tx)
      },
      onTransactionDelete: (txId) => {
        financeRef.current.applyRemoteDeleteTransaction(txId)
      },
      onAccountUpdate: (acc) => {
        financeRef.current.applyRemoteUpdateAccount(acc)
      },
      onBudgetUpsert: (b) => {
        financeRef.current.applyRemoteUpsertBudget(b)
      },
      onBudgetDelete: (budgetId) => {
        financeRef.current.applyRemoteDeleteBudget(budgetId)
      },
      onGoalUpsert: (g) => {
        financeRef.current.applyRemoteUpsertGoal(g)
      },
      onGoalDelete: (goalId) => {
        financeRef.current.applyRemoteDeleteGoal(goalId)
      },
      onReserveUpsert: (r) => {
        financeRef.current.applyRemoteUpsertReserve(r)
      },
      onReserveDelete: (reserveId) => {
        financeRef.current.applyRemoteDeleteReserve(reserveId)
      },
      onRecurringUpsert: (rec) => {
        financeRef.current.applyRemoteUpsertRecurring(rec)
      },
      onRecurringDelete: (recId) => {
        financeRef.current.applyRemoteDeleteRecurring(recId)
      },
      onSpecialPeriodUpsert: (sp) => {
        financeRef.current.applyRemoteUpsertSpecialPeriod(sp)
      },
      onSpecialPeriodDelete: (periodId) => {
        financeRef.current.applyRemoteDeleteSpecialPeriod(periodId)
      },
      onPlanSettingsUpdate: (ps) => {
        financeRef.current.applyRemoteUpdatePlanSettings(ps)
      },
      onProfileUpdate: (p) => {
        financeRef.current.applyRemoteUpdateProfile(p)
      },
      onVariableExpenseEstimateUpsert: (est) => {
        financeRef.current.applyRemoteUpsertVariableExpenseEstimate(est)
      },
      onVariableExpenseEstimateDelete: (estId) => {
        financeRef.current.applyRemoteDeleteVariableExpenseEstimate(estId)
      },
      onSharedContactUpsert: (contact) => {
        financeRef.current.applyRemoteUpsertSharedContact(contact)
      },
      onSharedContactDelete: (contactId) => {
        financeRef.current.applyRemoteDeleteSharedContact(contactId)
      },
      onExpenseShareUpsert: (share) => {
        financeRef.current.applyRemoteUpsertExpenseShare(share)
      },
      onExpenseShareDelete: (shareId) => {
        financeRef.current.applyRemoteDeleteExpenseShare(shareId)
      },
    })

    return () => {
      // Este cleanup SOLO se ejecuta cuando el usuario cierra sesión, cambia de usuario o se desmonta la App
      unsubscribeRealtime()
      setIsRealtimeConnected(false)
    }
  }, [user?.id])

  // 5. Conectividad de red (Online / Offline)
  useEffect(() => {
    if (!user?.id) return

    const handleOnline = async () => {
      setSyncStatus('syncing')
      try {
        const supabase = getSupabase()
        ensureRealtimeConnection(supabase, user.id)
        await flushOfflineQueue(supabase, user.id)
        setPendingCount(getPendingMutationsCount())

        // Reconciliación determinista al recuperar conexión
        const remote = await fetchRemoteState(supabase, user.id)
        if (remote) {
          await financeRef.current.restoreState(remote)
        }
        setSyncStatus('up_to_date')
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
  }, [user?.id])

  // 6. Recuperación en primer plano (iOS PWA / Resume / Focus)
  // Al volver de background: comprueba socket zombie, hace pull inmediato y reconcilia
  useEffect(() => {
    if (!user?.id) return

    const handleFocus = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        setSyncStatus('syncing')
        try {
          const supabase = getSupabase()

          // A. Comprobar salud real del canal Realtime y reconectar si está muerto/zombie sin duplicar
          ensureRealtimeConnection(supabase, user.id)

          // B. Procesar cola offline si la había
          const count = getPendingMutationsCount()
          if (count > 0) {
            await flushOfflineQueue(supabase, user.id)
            setPendingCount(getPendingMutationsCount())
          }

          // C. Reconciliación incremental inmediata con pull cloud (recupera gastos del Atajo creados mientras dormía)
          const remote = await fetchRemoteState(supabase, user.id)
          if (remote) {
            await financeRef.current.restoreState(remote)
          }

          // D. Solo después de reconciliar con éxito marcar "Al día"
          setSyncStatus('up_to_date')
        } catch (err) {
          console.warn('[Supabase] Error en reconciliación de primer plano:', err)
          setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
        }
      }
    }

    document.addEventListener('visibilitychange', handleFocus)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleFocus)
      window.removeEventListener('focus', handleFocus)
    }
  }, [user?.id])

  const processIncomingUrl = useCallback(
    (rawUrl: string, isWebQuery = false) => {
      if (!deduplicatorRef.current.shouldProcess(rawUrl)) {
        if (isWebQuery) cleanUrlQueryParams()
        return
      }

      const validCategoryIds = financeRef.current.categories.map((c) => c.id)
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

      financeRef.current.addTransaction({
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
    []
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

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)
  const [modalDefaultType, setModalDefaultType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [isReimbursementModalOpen, setIsReimbursementModalOpen] = useState(false)
  const [reimbursementShareId, setReimbursementShareId] = useState<string | undefined>(undefined)
  const [selectedSharedTx, setSelectedSharedTx] = useState<Transaction | null>(null)

  const handleOpenAdd = () => {
    setIsActionSheetOpen(true)
  }

  const handleSelectTransaction = (tx: Transaction) => {
    if (tx.isShared) {
      setSelectedSharedTx(tx)
    } else {
      setSelectedTx(tx)
      setModalDefaultType(tx.type)
      setIsModalOpen(true)
    }
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
          syncStatus === 'up_to_date' || syncStatus === 'synced'
            ? 'Al día con Supabase'
            : syncStatus === 'connected'
            ? 'Conectado a Supabase Realtime'
            : syncStatus === 'syncing'
            ? 'Sincronizando…'
            : syncStatus === 'connecting'
            ? 'Conectando con Supabase Realtime…'
            : syncStatus === 'offline'
            ? (pendingCount > 0 ? `${pendingCount} operaciones pendientes sin conexión` : 'Sin conexión')
            : 'Error de sincronización'
        }
      >
        <span className="sync-dot" />
        <span>
          {(syncStatus === 'up_to_date' || syncStatus === 'synced') && 'Al día'}
          {syncStatus === 'connected' && 'Conectado'}
          {syncStatus === 'syncing' && 'Sincronizando…'}
          {syncStatus === 'connecting' && 'Conectando…'}
          {syncStatus === 'offline' && (pendingCount > 0 ? `${pendingCount} offline` : 'Sin conexión')}
          {syncStatus === 'error' && 'Error de sincronización'}
        </span>
      </div>

      {tab === 'home' && (
        <HomePage
          finance={finance}
          onAdd={handleOpenAdd}
          onSelectTransaction={handleSelectTransaction}
          onNavigateToVariableEstimates={() => {
            setMoreSubView('variable_estimates')
            setTab('more')
          }}
          onNavigateToReceivables={() => {
            setMoreSubView('receivables')
            setTab('more')
          }}
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
          initialSubView={moreSubView}
          onNavigateToSavings={() => setTab('savings')}
          onRecordReimbursement={(shareId) => {
            setReimbursementShareId(shareId)
            setIsReimbursementModalOpen(true)
          }}
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
          onClick={() => {
            setMoreSubView('menu')
            setTab('more')
          }}
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

      <QuickActionSheet
        open={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        onSelectExpense={() => {
          setSelectedTx(null)
          setModalDefaultType('expense')
          setIsModalOpen(true)
        }}
        onSelectIncome={() => {
          setSelectedTx(null)
          setModalDefaultType('income')
          setIsModalOpen(true)
        }}
        onSelectReimbursement={() => {
          setReimbursementShareId(undefined)
          setIsReimbursementModalOpen(true)
        }}
      />

      <ReimbursementModal
        open={isReimbursementModalOpen}
        onClose={() => {
          setIsReimbursementModalOpen(false)
          setReimbursementShareId(undefined)
        }}
        accounts={finance.accounts}
        transactions={finance.transactions}
        expenseShares={finance.expenseShares}
        initialShareId={reimbursementShareId}
        onSubmit={(input) => {
          finance.recordReimbursement(input)
          showToast(`Reembolso registrado (+${input.amount.toFixed(2)} €)`, 'success')
        }}
      />

      {selectedSharedTx && (
        <SharedExpenseDetailModal
          open={Boolean(selectedSharedTx)}
          onClose={() => setSelectedSharedTx(null)}
          expenseTransaction={selectedSharedTx}
          allTransactions={finance.transactions}
          expenseShares={finance.expenseShares}
          onRecordReimbursement={(shareId) => {
            setSelectedSharedTx(null)
            setReimbursementShareId(shareId)
            setIsReimbursementModalOpen(true)
          }}
          onEditExpense={(tx) => {
            setSelectedSharedTx(null)
            setSelectedTx(tx)
            setModalDefaultType('expense')
            setIsModalOpen(true)
          }}
        />
      )}

      <AddTransactionModal
        open={isModalOpen}
        onClose={handleCloseModal}
        accounts={finance.accounts}
        categories={finance.categories}
        sharedContacts={finance.sharedContacts}
        defaultType={modalDefaultType}
        initialTransaction={selectedTx}
        onAdd={finance.addTransaction}
        onAddShared={finance.addSharedExpense}
        onUpdate={finance.updateTransaction}
        onDelete={finance.deleteTransaction}
      />
    </div>
  )
}
