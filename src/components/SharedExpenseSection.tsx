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
}

export interface SharedExpenseSectionProps {
  isShared: boolean
  onToggleShared: (checked: boolean) => void
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
  return (
    <div className="shared-expense-section">
      <div className="shared-toggle-row">
        <div className="shared-toggle-text">
          <strong>Gasto compartido</strong>
          <span>Repartir con amigos y registrar quién te debe</span>
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={selfParticipates}
              onChange={(e) => onToggleSelfParticipates(e.target.checked)}
            />
            <span>Yo también participo en este gasto</span>
          </label>

          <div className="participant-input-row">
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
              <span className="split-preview-title">Reparto exacto de céntimos:</span>
              <div className="split-preview-list">
                {computedShares.map((s, idx) => (
                  <div className="split-preview-item" key={idx}>
                    <span>{s.participantName}</span>
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
