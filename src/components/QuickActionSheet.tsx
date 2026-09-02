import { AppIcon } from '../ui/icons'

interface QuickActionSheetProps {
  open: boolean
  onClose: () => void
  onSelectExpense: () => void
  onSelectIncome: () => void
  onSelectReimbursement: () => void
}

export function QuickActionSheet({
  open,
  onClose,
  onSelectExpense,
  onSelectIncome,
  onSelectReimbursement,
}: QuickActionSheetProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-header">
          <h3>¿Qué deseas registrar?</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <div className="action-sheet-options">
          <button
            type="button"
            className="action-sheet-option"
            onClick={() => {
              onClose()
              onSelectExpense()
            }}
          >
            <div className="action-sheet-icon expense">
              <AppIcon name="arrow-up-right" size={20} color="#fff" />
            </div>
            <div className="action-sheet-text">
              <strong>Gasto</strong>
              <span>Compra, pago o gasto compartido</span>
            </div>
            <AppIcon name="chevron-right" size={16} color="var(--text-muted)" />
          </button>

          <button
            type="button"
            className="action-sheet-option"
            onClick={() => {
              onClose()
              onSelectIncome()
            }}
          >
            <div className="action-sheet-icon income">
              <AppIcon name="arrow-down-left" size={20} color="#fff" />
            </div>
            <div className="action-sheet-text">
              <strong>Ingreso</strong>
              <span>Nómina, regalo o ganancia real</span>
            </div>
            <AppIcon name="chevron-right" size={16} color="var(--text-muted)" />
          </button>

          <button
            type="button"
            className="action-sheet-option"
            onClick={() => {
              onClose()
              onSelectReimbursement()
            }}
          >
            <div className="action-sheet-icon reimbursement">
              <AppIcon name="refresh-cw" size={20} color="#fff" />
            </div>
            <div className="action-sheet-text">
              <strong>Bizum / Reembolso</strong>
              <span>Cobro de un gasto que adelantaste</span>
            </div>
            <AppIcon name="chevron-right" size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    </div>
  )
}
