import { AppIcon } from '../ui/icons'

interface CashActionSelectorModalProps {
  open: boolean
  onClose: () => void
  onSelectIncome: () => void
  onSelectExpense: () => void
  onSelectAdjust: () => void
}

export function CashActionSelectorModal({
  open,
  onClose,
  onSelectIncome,
  onSelectExpense,
  onSelectAdjust,
}: CashActionSelectorModalProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '100%',
          padding: '24px',
          borderRadius: 'var(--radius-lg, 24px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#16a34a' }}>
              Efectivo
            </span>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Añadir en Efectivo
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Opción 1: Entrada de efectivo */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onSelectIncome()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 16px)',
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1.5px solid rgba(34, 197, 94, 0.25)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.1s ease, background 0.15s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#16a34a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AppIcon name="plus" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: '1.02rem', color: '#14532d' }}>
                + Entrada de efectivo
              </strong>
              <small style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Dinero recibido, guardado o ingresado físicamente
              </small>
            </div>
            <AppIcon name="chevron-right" size={18} color="#16a34a" />
          </button>

          {/* Opción 2: Salida de efectivo */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onSelectExpense()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 16px)',
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1.5px solid rgba(239, 68, 68, 0.22)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.1s ease, background 0.15s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#dc2626',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AppIcon name="minus" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: '1.02rem', color: '#7f1d1d' }}>
                − Salida de efectivo
              </strong>
              <small style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Gasto pagado con monedas o billetes
              </small>
            </div>
            <AppIcon name="chevron-right" size={18} color="#dc2626" />
          </button>

          {/* Opción 3: Actualizar efectivo */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onSelectAdjust()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 16px)',
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1.5px solid rgba(59, 130, 246, 0.22)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.1s ease, background 0.15s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AppIcon name="scale" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: '1.02rem', color: '#1e3a8a' }}>
                Actualizar efectivo
              </strong>
              <small style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Contar y cuadrar el saldo físico real
              </small>
            </div>
            <AppIcon name="chevron-right" size={18} color="#2563eb" />
          </button>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 'var(--radius-md, 14px)',
            fontWeight: 600,
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
