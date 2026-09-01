import { AppIcon, GOAL_RESERVE_ICON_OPTIONS } from '../ui/icons'

interface IconPickerProps {
  selectedKey: string
  onSelect: (key: string) => void
  options?: Array<{ key: string; label: string }>
}

export function IconPicker({
  selectedKey,
  onSelect,
  options = GOAL_RESERVE_ICON_OPTIONS,
}: IconPickerProps) {
  return (
    <div className="icon-picker-grid" role="radiogroup" aria-label="Seleccionar icono">
      {options.map((opt) => {
        const isSelected = selectedKey === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            className={`icon-picker-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(opt.key)}
            title={opt.label}
            aria-label={opt.label}
            aria-checked={isSelected}
            role="radio"
          >
            <AppIcon name={opt.key} size={20} />
            <span className="icon-picker-label">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
