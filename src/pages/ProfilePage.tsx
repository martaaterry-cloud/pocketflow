import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { AppIcon } from '../ui/icons'
import type { User } from '@supabase/supabase-js'

export function ProfilePage({
  finance,
  user,
  onBack,
  onToast,
}: {
  finance: ReturnTypeFinance
  user?: User | null
  onBack: () => void
  onToast?: (message: string, type?: 'success' | 'error') => void
}) {
  const [displayName, setDisplayName] = useState(finance.profile?.displayName ?? '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      finance.updateProfile({ displayName: displayName.trim() })
      if (onToast) {
        onToast('Perfil actualizado correctamente', 'success')
      }
    } catch {
      if (onToast) {
        onToast('Error al actualizar el perfil', 'error')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Perfil</h1>
        <div style={{ width: 44 }} />
      </header>

      <form onSubmit={handleSave} className="settings-form">
        <section className="settings-section">
          <h2>Datos personales</h2>
          <p className="settings-desc">
            Personaliza cómo se muestra tu nombre en el saludo principal de Pocketflow.
          </p>

          <div className="form-group">
            <label htmlFor="profile-display-name">
              Nombre
              <input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre (ej. Marta)"
                maxLength={60}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="profile-email">
              Correo electrónico
              <input
                id="profile-email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </label>
            <small className="muted" style={{ display: 'block', marginTop: 4 }}>
              El correo está vinculado a tu cuenta privada de Supabase (solo lectura).
            </small>
          </div>

          <button type="submit" className="save-button" disabled={isSaving}>
            Guardar cambios
          </button>
        </section>
      </form>
    </main>
  )
}
