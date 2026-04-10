import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()
  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'login_failed')
      const token = String(data.token || '')
      localStorage.setItem('musart_token', token)
      localStorage.setItem('musart_username', data.user?.username ?? '')
      const interestsRes = await fetch('/api/me/interests', { headers: { Authorization: `Bearer ${token}` } })
      const interestsData = await interestsRes.json().catch(() => null)
      const hasInterests = interestsRes.ok && Array.isArray(interestsData?.interests) && interestsData.interests.length > 0
      navigate(hasInterests ? '/app' : '/intereses')
    } catch {
      setError('Correo/usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-inner">
          <div className="login-hero">
            <div className="login-hero-image" />
          </div>
          <div className="login-form">
            <div className="login-logo">
              <img src="/logomusart.PNG" alt="MusArt" />
              <div>
                <div className="brand">MusArt</div>
                <p className="login-subtitle">Donde el arte se encuentra con la inspiración</p>
              </div>
            </div>

            <input
              className="input"
              placeholder="Escribe tu correo o usuario..."
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Escribe tu contraseña aquí..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
            <button className="button" type="button" onClick={submit} disabled={loading}>
              Iniciar
            </button>
            {error ? <div className="pill">{error}</div> : null}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="pill">¿No tienes cuenta?</span>
              <Link className="button ghost" to="/registro">Crear cuenta</Link>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="button secondary" type="button" onClick={() => { window.location.href = '/api/oauth/google/start' }}>
                Inicia sesión con Google
              </button>
              <button className="button secondary" type="button" onClick={() => { window.location.href = '/api/oauth/apple/start' }}>
                Inicia sesión con Apple
              </button>
              <button className="button secondary" type="button" onClick={() => { window.location.href = '/api/oauth/instagram/start' }}>
                Inicia sesión con Instagram
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
