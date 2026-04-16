import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'

type Tab = 'portafolio' | 'comisiones'

function Profile() {
  const { posts, following, toggleFollow, toggleLike, addComment, sharePost, token, meUsername } = useOutletContext<AppOutletContext>()
  const [tab, setTab] = useState<Tab>('portafolio')
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)

  const portfolio = useMemo(
    () => [
      '/busqueda/anime.jpg',
      '/busqueda/digital.jpg.avif',
      '/busqueda/tradicional.jpg',
      '/busqueda/tattoo.jpg',
      '/busqueda/pixelart.jpg',
      '/busqueda/animacion.avif'
    ],
    []
  )

  const author = meUsername || 'Mi perfil'
  const isMe = Boolean(meUsername) && author === meUsername
  const authorPosts = useMemo(() => (meUsername ? posts.filter((p) => p.author === meUsername) : []), [meUsername, posts])
  const openPost = useMemo(() => (openPostId ? posts.find((p) => p.id === openPostId) ?? null : null), [openPostId, posts])

  function submitComment() {
    if (!openPost) return
    const text = draft.trim()
    if (!text) return
    addComment(openPost.id, text)
    setDraft('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Seguridad</div>
        <div style={{ color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
          Si antes entraste con Google, aquí puedes crear una contraseña para iniciar sesión con correo y contraseña.
        </div>
        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <input
            className="input"
            type="password"
            placeholder="Nueva contraseña (mínimo 6)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="button"
              type="button"
              disabled={!token || savingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
              onClick={async () => {
                if (!token) return
                setPasswordMsg(null)
                setSavingPassword(true)
                try {
                  const r = await fetch('/api/auth/set-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ password: newPassword })
                  })
                  const d = await r.json().catch(() => null)
                  if (!r.ok) throw new Error(d?.error ?? 'set_password_failed')
                  setPasswordMsg('Contraseña guardada. Ya puedes iniciar sesión con tu correo y contraseña.')
                  setNewPassword('')
                  setConfirmPassword('')
                } catch {
                  setPasswordMsg('No se pudo guardar la contraseña.')
                } finally {
                  setSavingPassword(false)
                }
              }}
            >
              Guardar contraseña
            </button>
          </div>
          {passwordMsg ? <div className="pill">{passwordMsg}</div> : null}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="story"><div /></div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{author}</div>
              <div style={{ color: 'var(--muted)' }}>Artista en MusArt</div>
              <div className="stat-row" style={{ marginTop: 8 }}>
                <span>{authorPosts.length} Publicaciones</span>
                <span>— Seguidores</span>
                <span>{following.size} Siguiendo</span>
              </div>
            </div>
          </div>
          {isMe ? (
            <button className="button secondary" type="button" disabled>
              Mi perfil
            </button>
          ) : (
            <button className={following.has(author) ? 'button secondary' : 'button'} type="button" onClick={() => toggleFollow(author)}>
              {following.has(author) ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="tabs" role="tablist" aria-label="Perfil">
            <button
              type="button"
              className={`tab${tab === 'portafolio' ? ' active' : ''}`}
              onClick={() => setTab('portafolio')}
              role="tab"
              aria-selected={tab === 'portafolio'}
            >
              Portafolio
            </button>
            <button
              type="button"
              className={`tab${tab === 'comisiones' ? ' active' : ''}`}
              onClick={() => setTab('comisiones')}
              role="tab"
              aria-selected={tab === 'comisiones'}
            >
              Comisiones
            </button>
          </div>
          <button className="button ghost" type="button">Solicitar comisión</button>
        </div>
      </div>

      {tab === 'portafolio' ? (
        <div className="portfolio-grid">
          {authorPosts.length ? (
            authorPosts.map((p) => (
              <button
                key={p.id}
                type="button"
                className="portfolio-item"
                onClick={() => setOpenPostId(p.id)}
              >
                {p.mediaType === 'video' ? (
                  <AutoVideo src={p.mediaUrl} className="video-fill" />
                ) : (
                  <img src={p.mediaUrl} alt="Portafolio" loading="lazy" />
                )}
              </button>
            ))
          ) : (
            portfolio.map((src, i) => (
              <button key={i} type="button" className="portfolio-item" onClick={() => setOpenPostId(null)}>
                <img src={src} alt="Portafolio" loading="lazy" />
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="split">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Tabla de valores</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="card" style={{ padding: 12, background: '#f7f0ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontWeight: 900 }}>Chibi</span>
                  <span style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>$5 USD</span>
                </div>
              </div>
              <div className="card" style={{ padding: 12, background: '#f7f0ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontWeight: 900 }}>Lineart</span>
                  <span style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>$8 USD</span>
                </div>
              </div>
              <div className="card" style={{ padding: 12, background: '#f7f0ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontWeight: 900 }}>Full body</span>
                  <span style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>$30 USD</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Términos y solicitud</div>
            <div style={{ color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
              Envía referencias y detalles. Se confirma disponibilidad y tiempo de entrega al responder.
            </div>
            <textarea className="input textarea" placeholder="Escribe tu solicitud..." style={{ height: 160 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="button" type="button">Enviar solicitud</button>
              <button className="button secondary" type="button">Adjuntar referencias</button>
            </div>
          </div>
        </div>
      )}

      {openPost ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpenPostId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div className="story" style={{ width: 44, height: 44 }}><div /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{openPost.author}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {openPost.tags.map((t) => (
                      <span key={t} className="tag">#{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button className="button secondary" type="button" onClick={() => setOpenPostId(null)}>Cerrar</button>
            </div>

            <div className="modal-body">
              <div className="modal-image">
                {openPost.mediaType === 'video' ? (
                  <AutoVideo src={openPost.mediaUrl} fit="contain" className="video-fill" />
                ) : (
                  <img src={openPost.mediaUrl} alt="Publicación" />
                )}
              </div>
              <div style={{ padding: 14, display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--primary-strong)' }}>{openPost.title}</div>
                <div className="post-actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className={`post-action${openPost.likedByMe ? ' active' : ''}`}
                    onClick={() => toggleLike(openPost.id)}
                  >
                    Me gusta {openPost.likesCount}
                  </button>
                  <button type="button" className="post-action" onClick={() => sharePost(openPost.id)}>
                    Compartir {openPost.sharesCount}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    className="input"
                    placeholder="Escribe un comentario..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitComment()
                    }}
                  />
                  <button className="button" type="button" onClick={submitComment}>Enviar</button>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {openPost.previewComments.slice(0, 6).map((c) => (
                    <div key={c.id} className="card" style={{ padding: 12, background: '#f7f0ff' }}>
                      <div style={{ fontWeight: 900 }}>{c.author}</div>
                      <div style={{ color: 'var(--text)', marginTop: 4 }}>{c.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Profile
