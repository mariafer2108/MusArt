import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'
import { upload } from '@vercel/blob/client'

type Tab = 'portafolio' | 'comisiones'

function Profile() {
  const { posts, following, toggleFollow, toggleLike, addComment, sharePost, meUsername, meBio, meAvatarUrl, token, saveMyProfile } =
    useOutletContext<AppOutletContext>()
  const [tab, setTab] = useState<Tab>('portafolio')
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [bioDraft, setBioDraft] = useState(meBio)
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(meAvatarUrl)
  const [savingProfile, setSavingProfile] = useState(false)

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

  useEffect(() => {
    setBioDraft(meBio)
    setAvatarDraftUrl(meAvatarUrl)
  }, [meBio, meAvatarUrl])

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {avatarDraftUrl ? (
              <div className="story" style={{ overflow: 'hidden' }}>
                <img src={avatarDraftUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 999 }} />
              </div>
            ) : (
              <div className="story"><div /></div>
            )}
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{author}</div>
              <div style={{ color: 'var(--muted)' }}>{meBio || 'Artista en MusArt'}</div>
              <div className="stat-row" style={{ marginTop: 8 }}>
                <span>{authorPosts.length} Publicaciones</span>
                <span>— Seguidores</span>
                <span>{following.size} Siguiendo</span>
              </div>
            </div>
          </div>
          {isMe ? (
            <div style={{ display: 'grid', gap: 8, width: 'min(420px, 100%)' }}>
              <textarea
                className="input textarea"
                placeholder="Describe tu perfil..."
                style={{ height: 92 }}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value.slice(0, 220))}
              />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  style={{ maxWidth: 220 }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !token) return
                    const ext = (file.name.split('.').pop() || '').toLowerCase()
                    const safeExt = ext && ext.length <= 8 ? ext : 'jpg'
                    const blob = await upload(`avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`, file, {
                      access: 'public',
                      handleUploadUrl: '/api/blob/upload',
                      headers: { Authorization: `Bearer ${token}` }
                    })
                    setAvatarDraftUrl(blob.url)
                  }}
                />
                <button
                  className="button"
                  type="button"
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true)
                    try {
                      await saveMyProfile({ bio: bioDraft.trim(), avatarUrl: avatarDraftUrl })
                    } finally {
                      setSavingProfile(false)
                    }
                  }}
                >
                  Guardar perfil
                </button>
              </div>
            </div>
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
