import React, { useRef, useState, useEffect } from 'react'
import type { Category, CashTransaction, Transaction } from '../models/finance'
import type { UnifiedMovement } from '../utils/unifiedMovementSelectors'
import { money, shortDate } from '../utils/money'
import { AppIcon } from '../ui/icons'

export const SWIPE_MAX_REVEAL = 66 // Desplazamiento máximo visual (~64-68px)
export const SWIPE_THRESHOLD = 33  // Umbral proporcional para snap abierto (~33px)

interface SwipeableTransactionRowProps {
  movement?: UnifiedMovement
  transaction?: Transaction
  categories: Category[]
  isShared?: boolean
  pendingToRecover?: number
  onSelect?: (t: Transaction | CashTransaction) => void
  onEdit?: (t: Transaction | CashTransaction) => void
  onDelete?: (t: Transaction) => void
  onDeleteCash?: (c: CashTransaction) => void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SwipeableTransactionRow({
  movement,
  transaction: t,
  categories,
  isShared,
  pendingToRecover,
  onSelect,
  onEdit,
  onDelete,
  onDeleteCash,
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

  const item: UnifiedMovement = movement ?? {
    id: t!.id,
    source: 'bank',
    type: t!.type,
    amount: t!.amount,
    date: t!.date,
    description: t!.description,
    categoryId: t!.categoryId,
    note: t!.note,
    accountId: t!.accountId,
    toAccountId: t!.toAccountId,
    incomeKind: t!.incomeKind,
    expenseNature: t!.expenseNature,
    giftRecipient: t!.giftRecipient,
    isShared: Boolean(isShared),
    isCashWithdrawal: t!.specialType === 'cash_withdrawal',
    isLinkedCashWithdrawal: false,
    isReimbursement: t!.type === 'income' && t!.incomeKind === 'reimbursement',
    isAdjustment: false,
    originalTransaction: t!,
  }

  const category = categories.find((c) => c.id === item.categoryId)
  const isTransfer = item.type === 'transfer'
  const isIncome = item.type === 'income'
  const isReimbursement = item.isReimbursement
  const isAdjustment = item.isAdjustment
  const isCashWithdrawal = item.isCashWithdrawal
  const isLinkedCashWithdrawal = item.isLinkedCashWithdrawal
  const sharedFlag = isShared ?? item.isShared

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
      // Fallback seguro si pointer capture no está disponible
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
        // Intención vertical -> cancelar swipe y permitir scroll fluido nativo
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
        // Intención horizontal confirmada -> fijar dirección
        directionRef.current = 'horizontal'
        hasMovedRef.current = true
      } else {
        return
      }
    }

    // 2. Seguimiento 1:1 del dedo durante dragging
    if (directionRef.current === 'horizontal') {
      let raw = startTranslateRef.current + dx

      // Si no hay callback disponible en esa dirección, bloquear
      if (raw > 0 && !onEdit) raw = 0
      if (raw < 0 && !onDelete) raw = 0

      // Clamp estricto 1:1 entre -SWIPE_MAX_REVEAL y +SWIPE_MAX_REVEAL
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
        onSelect?.(item.originalTransaction)
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
      {/* Capa de acciones de fondo (z-index: 0, perfectamente contenida debajo) */}
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
              onEdit(item.originalTransaction)
            }}
            aria-label={`Editar ${item.description}`}
            tabIndex={translateX > 0 ? 0 : -1}
          >
            <AppIcon name="pencil" size={15} color="#ffffff" />
            <span>Editar</span>
          </button>
        )}
        {(onDelete || onDeleteCash) && (
          <button
            type="button"
            className="swipe-action-button delete"
            onClick={(e) => {
              e.stopPropagation()
              setTranslateX(0)
              currentTranslateRef.current = 0
              onOpenChange?.(false)
              if (item.source === 'cash') {
                onDeleteCash?.(item.originalTransaction as CashTransaction)
              } else {
                onDelete?.(item.originalTransaction as Transaction)
              }
            }}
            aria-label={`Eliminar ${item.description}`}
            tabIndex={translateX < 0 ? 0 : -1}
          >
            <AppIcon name="trash-2" size={15} color="#ffffff" />
            <span>Eliminar</span>
          </button>
        )}
      </div>

      {/* Capa de contenido (Foreground, z-index: 1, fondo sólido opaco que cubre acciones a 0px) */}
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
          if (!hasMovedRef.current) {
            onSelect?.(item.originalTransaction)
          } else {
            e.stopPropagation()
          }
        }}
      >
        <div
          className="category-dot"
          style={{
            background: isAdjustment
              ? '#3b82f6'
              : isCashWithdrawal || isLinkedCashWithdrawal
              ? '#0284c7'
              : isTransfer
              ? '#768ca5'
              : isReimbursement
              ? '#8b70a0'
              : isIncome
              ? '#5d9c74'
              : category?.color ?? '#bbb',
          }}
        >
          {isAdjustment ? (
            <AppIcon name="scale" size={15} color="#fff" />
          ) : isCashWithdrawal || isLinkedCashWithdrawal ? (
            <AppIcon name="banknote" size={15} color="#fff" />
          ) : isTransfer ? (
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
            <strong>{item.description}</strong>

            {/* Badges de origen */}
            {item.source === 'bank' && isCashWithdrawal && (
              <span className="pill-withdrawal">Cajero · Banco → Efectivo</span>
            )}
            {item.source === 'bank' && !isCashWithdrawal && (
              <span className="pill-source bank">Banco</span>
            )}
            {item.source === 'cash' && isLinkedCashWithdrawal && (
              <span className="pill-source cash-linked">Desde Banco</span>
            )}
            {item.source === 'cash' && !isLinkedCashWithdrawal && !isAdjustment && (
              <span className="pill-source cash">Efectivo</span>
            )}
            {isAdjustment && (
              <span className="pill-source adjustment">Ajuste</span>
            )}

            {/* Badges de características */}
            {item.expenseNature === 'fixed' && <span className="pill-nature fixed">Fijo</span>}
            {item.expenseNature === 'extraordinary' && <span className="pill-nature extraordinary">Extraordinario</span>}
            {isReimbursement && <span className="pill-reimbursement">Reembolso</span>}
            {sharedFlag && (
              <span className={`pill-shared ${pendingToRecover && pendingToRecover > 0 ? 'pending' : 'completed'}`}>
                {pendingToRecover && pendingToRecover > 0
                  ? `Faltan ${money(pendingToRecover)}`
                  : 'Compartido'}
              </span>
            )}
          </div>
          <span>
            {isCashWithdrawal
              ? `Efectivo / Cajero (${category?.name ?? 'Otros'})`
              : isLinkedCashWithdrawal
              ? 'Entrada vinculada desde Banco'
              : isAdjustment
              ? 'Ajuste de efectivo'
              : isTransfer
              ? 'Transferencia interna'
              : isReimbursement
              ? `Reembolso recibido (${item.source === 'cash' ? 'efectivo' : 'banco'})`
              : isIncome
              ? `Ingreso (${item.source === 'cash' ? 'efectivo' : 'banco'})`
              : item.giftRecipient
              ? `Regalo · ${item.giftRecipient}`
              : category?.name ?? 'Otros'}{' '}
            · {shortDate(item.date)}
          </span>
        </div>

        <strong
          className={`transaction-amount ${
            isAdjustment
              ? item.amount >= 0
                ? 'positive'
                : 'negative'
              : isReimbursement
              ? 'positive reimbursement'
              : isIncome
              ? 'positive'
              : isTransfer || isCashWithdrawal || isLinkedCashWithdrawal
              ? 'transfer'
              : ''
          }`}
        >
          {isAdjustment
            ? item.amount >= 0
              ? `+${money(item.amount)}`
              : money(item.amount)
            : isIncome
            ? '+'
            : isTransfer || isCashWithdrawal || isLinkedCashWithdrawal
            ? '↔ '
            : '−'}
          {!isAdjustment && money(item.amount)}
        </strong>
      </div>
    </div>
  )
}
