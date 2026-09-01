import { useState, type FormEvent } from 'react'
import { getSupabase } from '../services/supabase/supabaseClient'

interface LoginPageProps {
  onSuccess: () => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !password) {
      setErrorMessage('Por favor introduce tu correo y contraseña.')
      return
    }

    setIsLoading(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Credenciales no válidas. Revisa tu correo y contraseña.')
        } else {
          setErrorMessage(error.message)
        }
        return
      }

      onSuccess()
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || 'Error de conexión con el servidor.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img
            src="./apple-touch-icon.png"
            alt="Pocketflow Logo"
            className="login-logo"
            width={64}
            height={64}
          />
          <h2>Pocketflow</h2>
          <p className="subtitle">Acceso privado y exclusivo a tus finanzas personales</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {errorMessage && (
            <div className="login-error-banner" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block login-btn" disabled={isLoading}>
            {isLoading ? 'Iniciando sesión...' : 'Entrar en Pocketflow'}
          </button>
        </form>

        <div className="login-footer">
          <small>100% privado · Sin registro público</small>
        </div>
      </div>
    </div>
  )
}
