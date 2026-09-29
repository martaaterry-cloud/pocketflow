import type { SharedContact } from '../models/finance'
import type { CustomSplitCalculation, SplitMode } from '../utils/sharedExpenseSelectors'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

export interface SharedExpenseParticipant {
  id?: string
  name: string
  contactId?: string
  customAmount?: number
}

export interface SharedExpenseComputedShare {
  participantName: string
  amount: number
  isPayerShare?: boolean
  isUserShare?: boolean
  contactId?: string
}

export interface SharedExpenseSectionProps {
  isShared: boolean
  onToggleShared: (checked: boolean) => void
  paidBy?: 'user' | 'contact'
  onPaidByChange?: (paidBy: 'user' | 'contact') => void
  payerName?: string
  onPayerNameChange?: (name: string, contactId?: string) => void
  payerContactId?: string
  selfParticipates: boolean
  onToggleSelfParticipates: (checked: boolean) => void
  newParticipantInput: string
  onNewParticipantInputChange: (value: string) => void
  onAddParticipant: (name?: string) => void
  participants: SharedExpenseParticipant[]
  onRemoveParticipant: (index: number) => void
  sharedContacts?: SharedContact[]
  computedShares: SharedExpenseComputedShare[]
  datalistId?: string
  placeholder?: string
  // Custom split props
  splitMode?: SplitMode
  onSplitModeChange?: (mode: SplitMode) => void
  customAmounts?: Record<string, string>
  onCustomAmountChange?: (participantKey: string, val: string) => void
  customSplitSummary?: CustomSplitCalculation
  totalExpenseAmount?: number
}

export function SharedExpenseSection({
  isShared,
  onToggleShared,
  paidBy = 'user',
  onPaidByChange,
  payerName = '',
  onPayerNameChange,
  selfParticipates,
  onToggleSelfParticipates,
  newParticipantInput,
  onNewParticipantInputChange,
  onAddParticipant,
  participants,
  onRemoveParticipant,
  sharedContacts = [],
  computedShares,
  datalistId = 'shared-contacts-list',
  placeholder = 'Escribe nombre (ej. Sergi)...',
  splitMode = 'equal',
  onSplitModeChange,
  customAmounts = {},
  onCustomAmountChange,
  customSplitSummary,
  totalExpenseAmount = 0,
}: SharedExpenseSectionProps) {
  const isPayerContact = paidBy === 'contact'

  const handlePayerChange = (name: string) => {
    const matched = sharedContacts.find(
      (c) => c.displayName.toLowerCase() === name.trim().toLowerCase()
    )
    onPayerNameChange?.(name, matched?.id)
  }

  return (
    <div className="shared-expense-section">
      <div className="shared-toggle-row">
        <div className="shared-toggle-text">
          <strong>Gasto compartido</strong>
          <span>Repartir cuentas, registrar deudas y quién pagó</span>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => onToggleShared(e.target.checked)}
          />
          <span className="switch-slider" />
        </label>
      </div>

      {isShared && (
        <div className="shared-config-box">
          {/* Selector de quién pagó */}
          {onPaidByChange && (
            <div className="payer-selector-group" style={{ marginBottom: '12px' }}>
              <span className="section-subtitle" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                ¿Quién pagó este gasto?
              </span>
              <div className="type-toggle" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <button
                  type="button"
                  className={!isPayerContact ? 'active' : ''}
                  onClick={() => onPaidByChange('user')}
                  style={{ padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <AppIcon name="credit-card" size={16} /> Yo pagué
                </button>
                <button
                  type="button"
                  className={isPayerContact ? 'active' : ''}
                  onClick={() => onPaidByChange('contact')}
                  style={{ padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <AppIcon name="users" size={16} /> Pagó otra persona
                </button>
              </div>

              {isPayerContact && (
                <div className="payer-input-row" style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted, #8e8e93)', marginBottom: '4px' }}>
                    Nombre de quien pagó (tu acreedor):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Sergi, Carlos, Mamá..."
                    value={payerName}
                    onChange={(e) => handlePayerChange(e.target.value)}
                    list="payer-contacts-list"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}
                  />
                  <datalist id="payer-contacts-list">
                    {sharedContacts.map((c) => (
                      <option key={c.id} value={c.displayName} />
                    ))}
                  </datalist>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8e8e93)', marginTop: '4px', marginInline: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AppIcon name="info" size={14} /> No se descontará de tus cuentas bancarias/efectivo hasta que registres el pago a {payerName.trim() || 'esta persona'}.
                  </p>
                </div>
              )}
            </div>
          )}

          <label className="checkbox-row" style={{ marginTop: '6px' }}>
            <input
              type="checkbox"
              checked={selfParticipates}
              onChange={(e) => onToggleSelfParticipates(e.target.checked)}
            />
            <span>Yo también participo en este gasto</span>
          </label>

          {/* Selector de Modo de Reparto: Igual vs Personalizado */}
          {onSplitModeChange && (
            <div className="split-mode-selector" style={{ marginTop: '12px', marginBottom: '8px' }}>
              <span className="section-subtitle" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                Modo de reparto
              </span>
              <div className="type-toggle" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  className={splitMode === 'equal' ? 'active' : ''}
                  onClick={() => onSplitModeChange('equal')}
                  style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                >
                  Reparto igual
                </button>
                <button
                  type="button"
                  className={splitMode === 'custom' ? 'active' : ''}
                  onClick={() => onSplitModeChange('custom')}
                  style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                >
                  Importes personalizados
                </button>
              </div>
            </div>
          )}

          <div className="participant-input-row" style={{ marginTop: '10px' }}>
            <input
              type="text"
              placeholder={placeholder}
              value={newParticipantInput}
              onChange={(e) => onNewParticipantInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAddParticipant()
                }
              }}
              list={datalistId}
            />
            <datalist id={datalistId}>
              {sharedContacts.map((c) => (
                <option key={c.id} value={c.displayName} />
              ))}
            </datalist>
            <button
              type="button"
              className="secondary-button add-participant-btn"
              onClick={() => onAddParticipant()}
            >
              + Añadir
            </button>
          </div>

          {participants.length > 0 && splitMode === 'equal' && (
            <div className="participant-chips">
              {participants.map((p, idx) => (
                <span className="participant-chip" key={idx}>
                  {p.name}
                  <button
                    type="button"
                    onClick={() => onRemoveParticipant(idx)}
                    aria-label={`Quitar ${p.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Reparto personalizado: lista con inputs editables */}
          {splitMode === 'custom' && onCustomAmountChange && (
            <div className="custom-split-table" style={{ marginTop: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #a1a1aa)', display: 'block', marginBottom: '8px' }}>
                Asignación de importes por persona:
              </span>

              {/* Fila Tú si selfParticipates */}
              {selfParticipates && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                    Tú {isPayerContact ? '(Por pagar)' : '(Tu parte)'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={customAmounts['user'] ?? ''}
                      onChange={(e) => onCustomAmountChange('user', e.target.value)}
                      style={{
                        width: '90px',
                        textAlign: 'right',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                        background: 'var(--bg-input, rgba(0,0,0,0.2))',
                        color: 'inherit',
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8e8e93)' }}>€</span>
                  </div>
                </div>
              )}

              {/* Participantes externos */}
              {participants.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: idx < participants.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => onRemoveParticipant(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted, #8e8e93)',
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: '1rem',
                        lineHeight: 1,
                      }}
                      aria-label={`Eliminar ${p.name}`}
                    >
                      ×
                    </button>
                    <span style={{ fontSize: '0.88rem' }}>{p.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={customAmounts[p.name] ?? ''}
                      onChange={(e) => onCustomAmountChange(p.name, e.target.value)}
                      style={{
                        width: '90px',
                        textAlign: 'right',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                        background: 'var(--bg-input, rgba(0,0,0,0.2))',
                        color: 'inherit',
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8e8e93)' }}>€</span>
                  </div>
                </div>
              ))}

              {/* Resumen de totales del reparto personalizado */}
              {customSplitSummary && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted, #8e8e93)' }}>
                    <span>Total gasto:</span>
                    <strong>{money(totalExpenseAmount)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted, #8e8e93)', marginTop: '2px' }}>
                    <span>Asignado:</span>
                    <strong>{money(customSplitSummary.assignedCents / 100)}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      fontWeight: 600,
                      color: customSplitSummary.remainingCents === 0 ? 'var(--color-success, #34c759)' : 'var(--color-danger, #ff453a)',
                    }}
                  >
                    <span>Restante:</span>
                    <span>{money(customSplitSummary.remainingAmount)}</span>
                  </div>

                  {customSplitSummary.errorMessage && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 69, 58, 0.12)',
                        color: 'var(--color-danger, #ff453a)',
                        fontWeight: 500,
                      }}
                    >
                      {customSplitSummary.errorMessage}
                    </div>
                  )}

                  {customSplitSummary.isValid && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(52, 199, 89, 0.12)',
                        color: 'var(--color-success, #34c759)',
                        fontWeight: 500,
                      }}
                    >
                      Reparto exacto (cuadrado al céntimo)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Vista previa del reparto en modo igual */}
          {splitMode === 'equal' && computedShares.length > 0 && (
            <div className="split-preview">
              <span className="split-preview-title">
                {isPayerContact
                  ? `Reparto del gasto (pagado por ${payerName.trim() || 'otra persona'}):`
                  : 'Reparto exacto de céntimos (te deben a ti):'}
              </span>
              <div className="split-preview-list">
                {computedShares.map((s, idx) => (
                  <div className="split-preview-item" key={idx}>
                    <span>
                      {s.participantName}
                      {s.isPayerShare && ' (Pagador)'}
                      {s.isUserShare && isPayerContact && ' (Por pagar)'}
                    </span>
                    <strong>{money(s.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
