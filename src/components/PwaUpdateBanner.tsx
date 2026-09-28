import React from 'react'
import { AppIcon } from '../ui/icons'

export interface PwaUpdateBannerProps {
  show: boolean
  isUpdating?: boolean
  onUpdate: () => void
}

export const PwaUpdateBanner: React.FC<PwaUpdateBannerProps> = ({
  show,
  isUpdating = false,
  onUpdate,
}) => {
  if (!show) return null

  return (
    <div className="pwa-update-banner" role="alert" aria-live="polite">
      <div className="pwa-update-content">
        <span className="pwa-update-icon" aria-hidden="true">
          <AppIcon name="sparkles" size={18} />
        </span>
        <span className="pwa-update-text">
          Hay una nueva versión de Pocket Flow disponible.
        </span>
      </div>
      <div className="pwa-update-actions">
        <button
          type="button"
          className="pwa-update-button"
          onClick={onUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}
