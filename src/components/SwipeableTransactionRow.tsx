import React, { useRef, useState, useEffect } from 'react'
import type { Category, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { AppIcon } from '../ui/icons'

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
  isOpen,
  onOpenChange,
}: SwipeableTransactionRowProps) {
  const [offsetX, setOffsetX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const startXRef = useRef<number>(0)
  const startYRef = useRef<number>(0)
  const isScrollingRef = useRef<boolean | null>(null)
  const currentOffsetRef = useRef<number>(0)
  const rowRef = useRef<HTMLDivElement>(null)

  const category = categories.find((c) => c.id === t.categoryId)
  const isTransfer = t.type === 'transfer'
  const isIncome = t.type === 'income'
  const isReimbursement = isIncome && t.incomeKind === 'reimbursement'

  // Si el padre indica que se cierre la fila abierta
  useEffect(() => {
    if (!isOpen && offsetX !== 0) {
      setOffsetX(0)
      setConfirmDelete(false)
    }
  }, [isOpen])

  const handlePointerDown = (e: React.PointerEvent) => {
    // Solo clic izquierdo o toque primario
    if (e.button !== 0) return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    currentOffsetRef.current = offsetX
    isScrollingRef.current = null
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return

    const deltaX = e.clientX - startXRef.current
    const deltaY = e.clientY - startYRef.current

    // Determinar si es scroll vertical o gesto horizontal
    if (isScrollingRef.current === null) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isScrollingRef.current = true // Es scroll vertical
        setIsDragging(false)
        return
      } else if (Math.abs(deltaX) > 8) {
        isScrollingRef.current = false // Es gesto horizontal
      }
    }

    if (isScrollingRef.current === false) {
      let nextOffset = currentOffsetRef.current + deltaX
      // Límites con resistencia: máx +80px (Editar), mín -80px (Eliminar)
      if (nextOffset > 90) nextOffset = 90
      if (nextOffset < -90) nextOffset = -90
      setOffsetX(nextOffset)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)

    const deltaX = e.clientX - startXRef.current
    const deltaY = e.clientY - startYRef.current

    // Si fue un tap sin desplazamiento, invocar selección
    if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
      if (offsetX !== 0) {
        setOffsetX(0)
        onOpenChange?.(false)
        setConfirmDelete(false)
      } else {
        onSelect?.(t)
      }
      return
    }

    // Snap a posiciones abiertas
    if (offsetX > 40 && onEdit) {
      setOffsetX(80)
      onOpenChange?.(true)
    } else if (offsetX < -40 && onDelete) {
      setOffsetX(-80)
      onOpenChange?.(true)
    } else {
      setOffsetX(0)
      onOpenChange?.(false)
      setConfirmDelete(false)
    }
  }

  const handlePointerCancel = () => {
    setIsDragging(false)
    setOffsetX(0)
    onOpenChange?.(false)
    setConfirmDelete(false)
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOffsetX(0)
    onOpenChange?.(false)
    onEdit?.(t)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setOffsetX(0)
    onOpenChange?.(false)
    onDelete?.(t)
  }

  return (
    <div className="swipeable-row-container" ref={rowRef}>
      {/* Botón Editar revelado tras deslizar a la derecha */}
      {onEdit && (
        <button
          type="button"
          className="swipe-action-button edit"
          onClick={handleEditClick}
          aria-label="Editar movimiento"
        >
          <AppIcon name="edit" size={18} color="#fff" />
          <span>Editar</span>
        </button>
      )}

      {/* Botón Eliminar revelado tras deslizar a la izquierda */}
      {onDelete && (
        <button
          type="button"
          className={`swipe-action-button delete ${confirmDelete ? 'confirm' : ''}`}
          onClick={handleDeleteClick}
          aria-label={confirmDelete ? 'Confirmar eliminación' : 'Eliminar movimiento'}
        >
          <AppIcon name="trash" size={18} color="#fff" />
          <span>{confirmDelete ? '¿Borrar?' : 'Eliminar'}</span>
        </button>
      )}

      {/* Contenido deslizable de la fila */}
      <div
        className={`transaction-row swipeable-content ${onSelect ? 'clickable' : ''}`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
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
              : category?.name ?? 'Sin categoría'}{' '}
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
