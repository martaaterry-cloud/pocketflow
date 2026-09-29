import React from 'react'
import { AppIcon } from '../ui/icons'

export interface PwaUpdateBannerProps {
  show: boolean
  isUpdating?: boolean
  onUpdate?: () => void
}

export const PwaUpdateBanner: React.FC<PwaUpdateBannerProps> = ({
  show,
  isUpdating = true,
}) => {
  if (!show) return null

  return (
    <div className="pwa-update-banner" role="alert" aria-live="polite">
      <div className="pwa-update-content">
        <span className="pwa-update-icon" aria-hidden="true">
          <AppIcon name="sparkles" size={18} />
        </span>
        <span className="pwa-update-text">
          {isUpdating
            ? 'Nueva versión encontrada. Actualizando Pocket Flow…'
            : 'Nueva versión disponible. Actualizando…'}
        </span>
      </div>
    </div>
  )
}
