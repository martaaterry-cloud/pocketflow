import React, { useRef, useState, useEffect, useCallback } from 'react'
import type { Category, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { AppIcon } from '../ui/icons'

export const SWIPE_REVEAL_WIDTH = 76 // Ancho exacto del botón de acción en px
export const SWIPE_MAX_DRAG = 84    // Límite máximo de arrastre con resistencia en px
export const SWIPE_THRESHOLD = 48   // Mínimo desplazamiento horizontal para snap abierto en px
export const SWIPE_ANGLE_RATIO = 1.25 // Ratio horizontal vs vertical para considerar gesto horizontal

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
  const [offsetX, setOffsetX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const startXRef = useRef<number>(0)
  const startYRef = useRef<number>(0)
  const initialOffsetRef = useRef<number>(0)
  const isIntentDeterminedRef = useRef<boolean>(false)
  const isCanceledRef = useRef<boolean>(false)
  const hasMovedRef = useRef<boolean>(false)
  const rowContainerRef = useRef<HTMLDivElement>(null)

  const category = categories.find((c) => c.id === t.categoryId)
  const isTransfer = t.type === 'transfer'
  const isIncome = t.type === 'income'
  const isReimbursement = isIncome && t.incomeKind === 'reimbursement'

  // Sincronizar estado abierto/cerrado gobernado por el padre (TransactionList)
  useEffect(() => {
    if (!isOpen && offsetX !== 0) {
      setOffsetX(0)
    }
  }, [isOpen, offsetX])

  const closeRow = useCallback(() => {
    setOffsetX(0)
    onOpenChange?.(false)
  }, [onOpenChange])

  const handlePointerDown = (e: React.PointerEvent) => {
    // Solo admitir click izquierdo o toque primario
    if (e.button !== 0) return

    startXRef.current = e.clientX
    startYRef.current = e.clientY
    initialOffsetRef.current = offsetX
    isIntentDeterminedRef.current = false
    isCanceledRef.current = false
    hasMovedRef.current = false
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || isCanceledRef.current) return

    const deltaX = e.clientX - startXRef.current
    const deltaY = e.clientY - startYRef.current
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    // 1. Detección temprana de intención (scroll vertical vs swipe horizontal)
    if (!isIntentDeterminedRef.current) {
      // Si el movimiento es vertical, cancelar swipe para permitir scroll fluido nativo
      if (absY > 7 && absY > absX * 0.8) {
        isCanceledRef.current = true
        setIsDragging(false)
        setOffsetX(0)
        return
      }

      // Si el movimiento supera 7px con claro predominio horizontal, fijar intención horizontal
      if (absX > 7 && absX >= absY * SWIPE_ANGLE_RATIO) {
        isIntentDeterminedRef.current = true
        hasMovedRef.current = true
      } else {
        return
      }
    }

    // 2. Calcular desplazamiento con resistencia tras el límite
    const rawOffset = initialOffsetRef.current + deltaX

    // Si no hay callback de editar o eliminar disponible en esa dirección, bloquear
    if (rawOffset > 0 && !onEdit) {
      setOffsetX(0)
      return
    }
    if (rawOffset < 0 && !onDelete) {
      setOffsetX(0)
      return
    }

    let nextOffset = rawOffset

    if (rawOffset > SWIPE_REVEAL_WIDTH) {
      // Resistencia elástica a la derecha
      const excess = rawOffset - SWIPE_REVEAL_WIDTH
      nextOffset = Math.min(SWIPE_MAX_DRAG, SWIPE_REVEAL_WIDTH + excess * 0.2)
    } else if (rawOffset < -SWIPE_REVEAL_WIDTH) {
      // Resistencia elástica a la izquierda
      const excess = rawOffset + SWIPE_REVEAL_WIDTH
      nextOffset = Math.max(-SWIPE_MAX_DRAG, -SWIPE_REVEAL_WIDTH + excess * 0.2)
    }

    setOffsetX(nextOffset)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)

    if (isCanceledRef.current) {
      setOffsetX(0)
      return
    }

    const deltaX = e.clientX - startXRef.current
    const deltaY = e.clientY - startYRef.current
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    // 1. Caso: Tap limpio sin desplazamiento
    if (!hasMovedRef.current || (absX < 6 && absY < 6)) {
      if (initialOffsetRef.current !== 0) {
        // Si estaba abierta, el tap simplemente la cierra sin abrir detalle
        closeRow()
      } else {
        // Si estaba cerrada, es un click válido para seleccionar
        onSelect?.(t)
      }
      return
    }

    // 2. Caso: Gesto horizontal completado -> Snap a estado abierto o cerrado
    if (offsetX >= SWIPE_THRESHOLD && onEdit) {
      setOffsetX(SWIPE_REVEAL_WIDTH)
      onOpenChange?.(true)
    } else if (offsetX <= -SWIPE_THRESHOLD && onDelete) {
      setOffsetX(-SWIPE_REVEAL_WIDTH)
      onOpenChange?.(true)
    } else {
      closeRow()
    }
  }

  const handlePointerCancel = () => {
    setIsDragging(false)
    closeRow()
  }

  const handleEditTap = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeRow()
    onEdit?.(t)
  }

  const handleDeleteTap = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeRow()
    onDelete?.(t)
  }

  return (
    <div className="swipeable-row-container" ref={rowContainerRef}>
      {/* Botón Editar (Capa de acción izquierda, revelada al deslizar hacia la derecha) */}
      {onEdit && (
        <button
          type="button"
          className="swipe-action-button edit"
          onClick={handleEditTap}
          aria-label={`Editar ${t.description}`}
          tabIndex={offsetX > 0 ? 0 : -1}
        >
          <AppIcon name="pencil" size={18} color="#ffffff" />
          <span>Editar</span>
        </button>
      )}

      {/* Botón Eliminar (Capa de acción derecha, revelada al deslizar hacia la izquierda) */}
      {onDelete && (
        <button
          type="button"
          className="swipe-action-button delete"
          onClick={handleDeleteTap}
          aria-label={`Eliminar ${t.description}`}
          tabIndex={offsetX < 0 ? 0 : -1}
        >
          <AppIcon name="trash-2" size={18} color="#ffffff" />
          <span>Eliminar</span>
        </button>
      )}

      {/* Tarjeta de movimiento deslizante */}
      <div
        className={`transaction-row swipeable-content ${onSelect && offsetX === 0 ? 'clickable' : ''}`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
