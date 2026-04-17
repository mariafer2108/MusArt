import { useMemo } from 'react'
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'

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
    </div>
  )
}

export default UserProfile

