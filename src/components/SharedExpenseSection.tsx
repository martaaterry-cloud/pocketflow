import type { SharedContact } from '../models/finance'
import { money } from '../utils/money'

export interface SharedExpenseParticipant {
  id?: string
  name: string
  contactId?: string
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
}

export function SharedExpenseSection({
  isShared,
  onToggleShared,
  paidBy = 'user',
  onPaidByChange,
  payerName = '',
  onPayerNameChange,
  payerContactId,
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
  placeholder = 'Escribe nombre (ej. Manuela)...',
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
                  style={{ padding: '8px', fontSize: '0.85rem' }}
                >
                  💳 Yo pagué
                </button>
                <button
                  type="button"
                  className={isPayerContact ? 'active' : ''}
                  onClick={() => onPaidByChange('contact')}
                  style={{ padding: '8px', fontSize: '0.85rem' }}
                >
                  👥 Pagó otra persona
                </button>
              </div>

              {isPayerContact && (
                <div className="payer-input-row" style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted, #8e8e93)', marginBottom: '4px' }}>
                    Nombre de quien pagó (tu acreedor):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Carlos, Mamá..."
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
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8e8e93)', marginTop: '4px', marginInline: 0 }}>
                    💡 No se descontará de tus cuentas bancarias/efectivo hasta que registres el pago a {payerName.trim() || 'esta persona'}.
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

          {participants.length > 0 && (
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

          {computedShares.length > 0 && (
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

