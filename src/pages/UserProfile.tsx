import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'

function formatPrice(priceCents: number, currency: string) {
  const value = (priceCents || 0) / 100
  return `${value.toFixed(value % 1 ? 2 : 0)} ${currency}`
}

function UserProfile() {
  const { username } = useParams()
  const { posts, meUsername, following, toggleFollow } = useOutletContext<AppOutletContext>()
  const target = (username || '').trim()

  if (!target) return <Navigate to="/app" replace />
  if (meUsername && target === meUsername) return <Navigate to="/app/perfil" replace />

  const authorPosts = useMemo(() => posts.filter((p) => p.author === target), [posts, target])
  const avatarUrl = authorPosts.find((p) => p.authorAvatarUrl)?.authorAvatarUrl || null
  const bio = authorPosts.find((p) => p.description)?.description || 'Artista en MusArt'
  const isFollowing = following.has(target)
  const [commissionProducts, setCommissionProducts] = useState<
    { id: string; title: string; imageUrl: string; priceCents: number; currency: string; description: string }[]
  >([])
  const [accepts, setAccepts] = useState(false)
  const [terms, setTerms] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/users/${encodeURIComponent(target)}/commissions`)
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error ?? 'request_failed')
        setCommissionProducts(Array.isArray(d?.products) ? d.products : [])
        setAccepts(Boolean(d?.acceptsCommissions))
        setTerms(String(d?.terms ?? ''))
      })
      .catch(() => {
        setCommissionProducts([])
        setAccepts(false)
        setTerms('')
      })
      .finally(() => setLoading(false))
  }, [target])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {avatarUrl ? (
              <div className="story" style={{ overflow: 'hidden' }}>
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 999 }} />
              </div>
            ) : (
              <div className="story"><div /></div>
            )}
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{target}</div>
              <div style={{ color: 'var(--muted)' }}>{bio}</div>
              <div className="stat-row" style={{ marginTop: 8 }}>
                <span>{authorPosts.length} Publicaciones</span>
              </div>
            </div>
          </div>
          <button className={isFollowing ? 'button secondary' : 'button'} type="button" onClick={() => toggleFollow(target)}>
            {isFollowing ? 'Siguiendo' : 'Seguir'}
          </button>
        </div>
      </div>

      <div className="portfolio-grid">
        {authorPosts.length ? (
          authorPosts.map((p) => (
            <Link key={p.id} to="/app" className="portfolio-item" style={{ display: 'block' }}>
              {p.mediaType === 'video' ? (
                <AutoVideo src={p.mediaUrl} className="video-fill" />
              ) : (
                <img src={p.mediaUrl} alt="Publicación" loading="lazy" />
              )}
            </Link>
          ))
        ) : (
          <div className="card" style={{ padding: 16, color: 'var(--muted)', fontWeight: 700 }}>
            Este usuario aún no tiene publicaciones.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900 }}>Comisiones</div>
          <div className="pill">{accepts ? 'Acepta comisiones' : 'No disponible'}</div>
        </div>
        {loading ? <div style={{ marginTop: 10, color: 'var(--muted)', fontWeight: 800 }}>Cargando...</div> : null}
        {terms ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 14, background: '#f7f0ff', whiteSpace: 'pre-wrap', fontWeight: 650 }}>
            {terms}
          </div>
        ) : null}
        <div className="grid" style={{ marginTop: 12 }}>
          {commissionProducts.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div style={{ height: 140, borderRadius: 14, overflow: 'hidden', background: '#ddd' }}>
                <img src={p.imageUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                  <div className="pill">{formatPrice(p.priceCents, p.currency)}</div>
                </div>
                {p.description ? (
                  <div style={{ color: 'var(--muted)', fontWeight: 650, fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.description}</div>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && commissionProducts.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontWeight: 700 }}>Este usuario aún no publicó productos de comisión.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default UserProfile
