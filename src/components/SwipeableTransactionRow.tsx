import React, { useRef, useState, useEffect } from 'react'
import type { Category, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { AppIcon } from '../ui/icons'

export const SWIPE_MAX_REVEAL = 72 // Desplazamiento máximo de revelación (±72px)
export const SWIPE_THRESHOLD = 36  // Umbral de activación para snap abierto (36px)

interface SwipeableTransactionRowProps {
  transaction: Transaction
  categories: Category[]
  isShared?: boolean
  pendingToRecover?: number
  onSelect?: (t: Transaction) => void
  onEdit?: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SwipeableTransactionRow({
  transaction: t,
  categories,
  isShared,
  pendingToRecover,
  onSelect,
  onEdit,
  onDelete,
  isOpen = false,
  onOpenChange,
}: SwipeableTransactionRowProps) {
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startTranslateRef = useRef(0)
  const currentTranslateRef = useRef(0)
  const directionRef = useRef<'horizontal' | 'vertical' | null>(null)
  const hasMovedRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)

  const category = categories.find((c) => c.id === t.categoryId)
  const isTransfer = t.type === 'transfer'
  const isIncome = t.type === 'income'
  const isReimbursement = isIncome && t.incomeKind === 'reimbursement'

  // Sincronizar SOLO cuando isOpen cambia externamente y NO estamos arrastrando
  useEffect(() => {
    if (!isDraggingRef.current) {
      if (!isOpen && translateX !== 0) {
        setTranslateX(0)
        currentTranslateRef.current = 0
      }
    }
  }, [isOpen])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Solo admitir click izquierdo o toque primario
    if (e.button !== 0) return

    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    startTranslateRef.current = translateX
    currentTranslateRef.current = translateX
    directionRef.current = null
    hasMovedRef.current = false
    pointerIdRef.current = e.pointerId

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Ignorar si el navegador no permite setPointerCapture en este contexto
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    const dx = e.clientX - startXRef.current
    const dy = e.clientY - startYRef.current
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    // 1. Detección temprana de dirección
    if (directionRef.current === null) {
      if (absY > 6 && absY > absX) {
        // Intención claramente vertical -> cancelar swipe y permitir scroll fluido nativo
        directionRef.current = 'vertical'
        isDraggingRef.current = false
        setIsDragging(false)
        setTranslateX(startTranslateRef.current)
        currentTranslateRef.current = startTranslateRef.current
        try {
          if (pointerIdRef.current !== null) {
            e.currentTarget.releasePointerCapture(pointerIdRef.current)
          }
        } catch {}
        return
      }
      if (absX > 6 && absX >= absY) {
        // Intención horizontal confirmada -> bloquear scroll
        directionRef.current = 'horizontal'
        hasMovedRef.current = true
      } else {
        return
      }
    }

    // 2. Seguimiento 1:1 del dedo mientras dragging = true
    if (directionRef.current === 'horizontal') {
      let raw = startTranslateRef.current + dx

      // Si no hay acción disponible en esa dirección, no permitir desplazamiento
      if (raw > 0 && !onEdit) raw = 0
      if (raw < 0 && !onDelete) raw = 0

      // Clamp estricto 1:1 entre -72px y +72px
      const clamped = Math.max(-SWIPE_MAX_REVEAL, Math.min(SWIPE_MAX_REVEAL, raw))
      currentTranslateRef.current = clamped
      setTranslateX(clamped)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current && directionRef.current !== 'horizontal') {
      return
    }

    isDraggingRef.current = false
    setIsDragging(false)

    try {
      if (pointerIdRef.current !== null) {
        e.currentTarget.releasePointerCapture(pointerIdRef.current)
      }
    } catch {}

    // Si fue scroll vertical, restaurar posición previa
    if (directionRef.current === 'vertical') {
      setTranslateX(startTranslateRef.current)
      currentTranslateRef.current = startTranslateRef.current
      return
    }

    // Si fue un tap limpio sin movimiento
    if (!hasMovedRef.current) {
      if (startTranslateRef.current !== 0) {
        // Si estaba abierta, el tap simplemente la cierra
        setTranslateX(0)
        currentTranslateRef.current = 0
        onOpenChange?.(false)
      } else {
        // Si estaba cerrada, abrir detalle de la transacción
        onSelect?.(t)
      }
      return
    }

    // Snap horizontal al soltar el dedo
    const current = currentTranslateRef.current
    if (current > SWIPE_THRESHOLD && onEdit) {
      setTranslateX(SWIPE_MAX_REVEAL)
      currentTranslateRef.current = SWIPE_MAX_REVEAL
      onOpenChange?.(true)
    } else if (current < -SWIPE_THRESHOLD && onDelete) {
      setTranslateX(-SWIPE_MAX_REVEAL)
      currentTranslateRef.current = -SWIPE_MAX_REVEAL
      onOpenChange?.(true)
    } else {
      setTranslateX(0)
      currentTranslateRef.current = 0
      onOpenChange?.(false)
    }
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false
    setIsDragging(false)
    try {
      if (pointerIdRef.current !== null) {
        e.currentTarget.releasePointerCapture(pointerIdRef.current)
      }
    } catch {}
    setTranslateX(startTranslateRef.current)
    currentTranslateRef.current = startTranslateRef.current
  }

  return (
    <div className="swipeable-row-container">
      {/* Capa de acciones de fondo (z-index: 0, siempre debajo del foreground) */}
      <div className="swipe-actions-layer">
        {onEdit && (
          <button
            type="button"
            className="swipe-action-button edit"
            onClick={(e) => {
              e.stopPropagation()
              setTranslateX(0)
              currentTranslateRef.current = 0
              onOpenChange?.(false)
              onEdit(t)
            }}
            aria-label={`Editar ${t.description}`}
            tabIndex={translateX > 0 ? 0 : -1}
          >
            <AppIcon name="pencil" size={18} color="#ffffff" />
            <span>Editar</span>
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="swipe-action-button delete"
            onClick={(e) => {
              e.stopPropagation()
              setTranslateX(0)
              currentTranslateRef.current = 0
              onOpenChange?.(false)
              onDelete(t)
            }}
            aria-label={`Eliminar ${t.description}`}
            tabIndex={translateX < 0 ? 0 : -1}
          >
            <AppIcon name="trash-2" size={18} color="#ffffff" />
            <span>Eliminar</span>
          </button>
        )}
      </div>

      {/* Capa de contenido (Foreground, z-index: 1, fondo sólido que oculta acciones a 0px) */}
      <div
        className={`transaction-row swipeable-content ${onSelect && translateX === 0 ? 'clickable' : ''}`}
        style={{
          transform: `translate3d(${translateX}px, 0, 0)`,
          transition: isDragging ? 'none' : 'transform 180ms ease-out',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={(e) => {
          if (hasMovedRef.current) {
            e.stopPropagation()
          }
        }}
      >
        <div
          className="category-dot"
          style={{
            background: isTransfer
              ? '#768ca5'
              : isReimbursement
              ? '#8b70a0'
              : isIncome
              ? '#5d9c74'
              : category?.color ?? '#bbb',
          }}
        >
          {isTransfer ? (
            <AppIcon name="arrow-left-right" size={15} color="#fff" />
          ) : isReimbursement ? (
            <AppIcon name="refresh-cw" size={15} color="#fff" />
          ) : isIncome ? (
            <AppIcon name="arrow-down-left" size={15} color="#fff" />
          ) : (
            <AppIcon name={category?.iconKey || category?.icon || 'shopping-basket'} size={15} color="#fff" />
          )}
        </div>

        <div className="transaction-main">
          <div className="transaction-title-row">
            <strong>{t.description}</strong>
            {isReimbursement && <span className="pill-reimbursement">Reembolso</span>}
            {isShared && (
              <span className={`pill-shared ${pendingToRecover && pendingToRecover > 0 ? 'pending' : 'completed'}`}>
                {pendingToRecover && pendingToRecover > 0
                  ? `Faltan ${money(pendingToRecover)}`
                  : 'Compartido'}
              </span>
            )}
          </div>
          <span>
            {isTransfer
              ? 'Transferencia interna'
              : isReimbursement
              ? 'Reembolso recibido'
              : isIncome
              ? 'Ingreso'
              : category?.name ?? 'Otros'}{' '}
            · {shortDate(t.date)}
          </span>
        </div>

        <strong
          className={`transaction-amount ${
            isReimbursement ? 'positive reimbursement' : isIncome ? 'positive' : isTransfer ? 'transfer' : ''
          }`}
        >
          {isIncome ? '+' : isTransfer ? '↔ ' : '−'}
          {money(t.amount)}
        </strong>
      </div>
    </div>
  )
}
