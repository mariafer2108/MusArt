import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'register_failed')
      const token = String(data.token || '')
      localStorage.setItem('musart_token', token)
      localStorage.setItem('musart_username', data.user?.username ?? '')
      navigate('/intereses')
    } catch {
      setError('No se pudo crear la cuenta. Revisa los datos o prueba otro usuario/correo.')
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
                <p className="login-subtitle">Crea tu cuenta de artista</p>
              </div>
            </div>

            <input className="input" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className="input" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              className="input"
              type="password"
              placeholder="Contraseña (mínimo 6)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />

            <button className="button" type="button" onClick={submit} disabled={loading}>
              Crear cuenta
            </button>
            {error ? <div className="pill">{error}</div> : null}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="pill">¿Ya tienes cuenta?</span>
              <Link className="button ghost" to="/">Iniciar sesión</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
