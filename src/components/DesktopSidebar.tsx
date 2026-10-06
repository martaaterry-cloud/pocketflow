import React from 'react'
import { AppIcon } from '../ui/icons'
import type { MoreSubView } from '../pages/MorePage'
import { getAppFullVersionLabel } from '../version'

export interface DesktopSidebarProps {
  activeTab: 'home' | 'movements' | 'calendar' | 'savings' | 'more'
  moreSubView: MoreSubView
  onTabChange: (tab: 'home' | 'movements' | 'calendar' | 'savings' | 'more') => void
  onSubViewChange: (subView: MoreSubView) => void
  onOpenAdd: () => void
  syncStatus: string
  pendingCount?: number
  userDisplayName?: string | null
}

export function DesktopSidebar({
  activeTab,
  moreSubView,
  onTabChange,
  onSubViewChange,
  onOpenAdd,
  syncStatus,
  pendingCount = 0,
  userDisplayName,
}: DesktopSidebarProps) {
  const isHomeActive = activeTab === 'home'
  const isMovementsActive = activeTab === 'movements'
  const isCalendarActive = activeTab === 'calendar'
  const isSavingsActive = activeTab === 'savings'

  const isPlanActive = activeTab === 'more' && moreSubView === 'plan'
  const isReceivablesActive = activeTab === 'more' && moreSubView === 'receivables'
  const isRecurringActive = activeTab === 'more' && moreSubView === 'recurring'
  const isStatsActive = activeTab === 'more' && moreSubView === 'statistics'
  const isBudgetsActive = activeTab === 'more' && moreSubView === 'budgets'
  const isAccountsActive = activeTab === 'more' && moreSubView === 'accounts'
  const isMoreMenuActive = activeTab === 'more' && moreSubView === 'menu'

  const handleNavigate = (tab: 'home' | 'movements' | 'calendar' | 'savings' | 'more', subView?: MoreSubView) => {
    onTabChange(tab)
    if (subView) {
      onSubViewChange(subView)
    }
  }

  return (
    <aside className="desktop-sidebar" aria-label="Navegación principal de escritorio">
      {/* 1. Encabezado con Logo y Estado de Sincronización */}
      <div className="desktop-sidebar-header">
        <div className="desktop-sidebar-brand">
          <div className="desktop-sidebar-logo">
            <AppIcon name="wallet" size={20} color="#ffffff" />
          </div>
          <div className="desktop-sidebar-title-group">
            <span className="desktop-sidebar-title">PocketFlow</span>
            <span className="desktop-sidebar-subtitle">Finanzas personales</span>
          </div>
        </div>

        {/* Indicador integrado de sincronización */}
        <div
          className={`desktop-sync-pill ${syncStatus}`}
          title={
            syncStatus === 'up_to_date' || syncStatus === 'synced'
              ? 'Al día con Supabase'
              : syncStatus === 'connected'
              ? 'Conectado a Supabase'
              : syncStatus === 'syncing'
              ? 'Sincronizando…'
              : syncStatus === 'offline'
              ? (pendingCount > 0 ? `${pendingCount} pendientes offline` : 'Sin conexión')
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
            {syncStatus === 'error' && 'Error de sync'}
          </span>
        </div>
      </div>

      {/* 2. Botón de Acción Rápida */}
      <div className="desktop-sidebar-action-wrap">
        <button
          type="button"
          className="btn-desktop-add-movement"
          onClick={onOpenAdd}
          aria-label="Añadir nuevo movimiento"
        >
          <AppIcon name="plus" size={18} />
          <span>Nuevo movimiento</span>
        </button>
      </div>

      {/* 3. Navegación Principal */}
      <nav className="desktop-sidebar-nav" aria-label="Secciones principales">
        <div className="desktop-nav-group">
          <span className="desktop-nav-group-title">Vistas principales</span>
          <button
            type="button"
            className={`desktop-nav-item ${isHomeActive ? 'active' : ''}`}
            onClick={() => handleNavigate('home')}
          >
            <span className="desktop-nav-icon"><AppIcon name="home" size={18} /></span>
            <span className="desktop-nav-label">Inicio</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isMovementsActive ? 'active' : ''}`}
            onClick={() => handleNavigate('movements')}
          >
            <span className="desktop-nav-icon"><AppIcon name="receipt" size={18} /></span>
            <span className="desktop-nav-label">Movimientos</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isCalendarActive ? 'active' : ''}`}
            onClick={() => handleNavigate('calendar')}
          >
            <span className="desktop-nav-icon"><AppIcon name="calendar" size={18} /></span>
            <span className="desktop-nav-label">Calendario</span>
          </button>
        </div>

        {/* 4. Planificación y Gestión */}
        <div className="desktop-nav-group">
          <span className="desktop-nav-group-title">Planificación y gestión</span>
          <button
            type="button"
            className={`desktop-nav-item ${isPlanActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'plan')}
          >
            <span className="desktop-nav-icon"><AppIcon name="target" size={18} /></span>
            <span className="desktop-nav-label">Plan financiero</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isReceivablesActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'receivables')}
          >
            <span className="desktop-nav-icon"><AppIcon name="users" size={18} /></span>
            <span className="desktop-nav-label">Cobros y deudas</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isRecurringActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'recurring')}
          >
            <span className="desktop-nav-icon"><AppIcon name="refresh-cw" size={18} /></span>
            <span className="desktop-nav-label">Gastos recurrentes</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isSavingsActive ? 'active' : ''}`}
            onClick={() => handleNavigate('savings')}
          >
            <span className="desktop-nav-icon"><AppIcon name="piggy-bank" size={18} /></span>
            <span className="desktop-nav-label">Ahorro e inversión</span>
          </button>
        </div>

        {/* 5. Análisis y Ajustes */}
        <div className="desktop-nav-group">
          <span className="desktop-nav-group-title">Análisis y configuración</span>
          <button
            type="button"
            className={`desktop-nav-item ${isStatsActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'statistics')}
          >
            <span className="desktop-nav-icon"><AppIcon name="chart-pie" size={18} /></span>
            <span className="desktop-nav-label">Estadísticas</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isBudgetsActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'budgets')}
          >
            <span className="desktop-nav-icon"><AppIcon name="pie-chart" size={18} /></span>
            <span className="desktop-nav-label">Presupuestos</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isAccountsActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'accounts')}
          >
            <span className="desktop-nav-icon"><AppIcon name="wallet" size={18} /></span>
            <span className="desktop-nav-label">Cuentas</span>
          </button>
          <button
            type="button"
            className={`desktop-nav-item ${isMoreMenuActive ? 'active' : ''}`}
            onClick={() => handleNavigate('more', 'menu')}
          >
            <span className="desktop-nav-icon"><AppIcon name="settings" size={18} /></span>
            <span className="desktop-nav-label">Más opciones</span>
          </button>
        </div>
      </nav>

      {/* 6. Pie de Sidebar */}
      <div className="desktop-sidebar-footer">
        {userDisplayName && (
          <div className="desktop-user-pill">
            <span className="desktop-user-avatar">
              <AppIcon name="user" size={14} />
            </span>
            <span className="desktop-user-name">{userDisplayName}</span>
          </div>
        )}
        <span className="desktop-version-label">{getAppFullVersionLabel()}</span>
      </div>
    </aside>
  )
}
