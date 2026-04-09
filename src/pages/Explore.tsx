import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'

function Explore() {
  const { posts, following, toggleFollow, meUsername } = useOutletContext<AppOutletContext>()
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [users, setUsers] = useState<Array<{ username: string }>>([])

  const categories = useMemo(
    () => [
      { label: 'Anime', tag: 'anime', image: '/busqueda/anime.jpg' },
      { label: 'Digital', tag: 'digital', image: '/busqueda/digital.jpg.avif' },
      { label: 'Tradicional', tag: 'tradicional', image: '/busqueda/tradicional.jpg' },
      { label: 'Tattoo', tag: 'tattoo', image: '/busqueda/tattoo.jpg' },
      { label: 'Pixel Art', tag: 'pixelart', image: '/busqueda/pixelart.jpg' },
      { label: 'Animación', tag: 'animacion', image: '/busqueda/animacion.avif' }
    ],
    []
  )

  useEffect(() => {
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsers(Array.isArray(d?.users) ? d.users : []))
      .catch(() => setUsers([]))
  }, [])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const p of posts) for (const t of p.tags) set.add(t)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [posts])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter((p) => {
      const matchesTag = activeTag ? p.tags.includes(activeTag) : true
      const matchesQuery = q
        ? p.author.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        : true
      return matchesTag && matchesQuery
    })
  }, [activeTag, posts, query])

  const suggestedUsers = useMemo(() => {
    return users
      .map((u) => ({ username: String(u.username) }))
      .filter((u) => u.username && u.username !== meUsername)
      .slice(0, 12)
  }, [meUsername, users])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 14 }}>
        <input
          className="input"
          placeholder="Busca artistas, títulos o #tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {suggestedUsers.length ? (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 900 }}>Usuarios</div>
            <div className="pill">{suggestedUsers.length}</div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {suggestedUsers.map((u) => (
              <div key={u.username} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div>
                <button
                  type="button"
                  className={following.has(u.username) ? 'button secondary' : 'button'}
                  onClick={() => toggleFollow(u.username)}
                  style={{ padding: '8px 12px', borderRadius: 999, fontSize: 12 }}
                >
                  {following.has(u.username) ? 'Siguiendo' : 'Seguir'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {categories.map((c) => (
          <button
            key={c.label}
            type="button"
            className="category-card"
            onClick={() => {
              setQuery('')
              setActiveTag(c.tag)
            }}
            style={{
              backgroundImage: `url(${c.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <span className="category-label">{c.label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="pill">Filtros</span>
        {allTags.map((t) => (
          <button
            key={t}
            type="button"
            className={`tag${activeTag === t ? ' active' : ''}`}
            onClick={() => setActiveTag((prev) => (prev === t ? null : t))}
          >
            #{t}
          </button>
        ))}
        {activeTag ? (
          <button className="button secondary" type="button" onClick={() => setActiveTag(null)}>
            Quitar filtro
          </button>
        ) : null}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {results.map((p) => (
          <div key={p.id} className="card" style={{ padding: 14 }}>
            <div style={{ height: 180, borderRadius: 16, overflow: 'hidden', background: '#ddd' }}>
              <img
                src={p.imageUrl}
                alt="Publicación"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                loading="lazy"
              />
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{p.author}</div>
                <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 12 }}>
                  {(() => {
                    const created = new Date(p.createdAt).getTime()
                    const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000))
                    if (minutes < 60) return `hace ${minutes} min`
                    const hours = Math.floor(minutes / 60)
                    return `hace ${hours} h`
                  })()}
                </div>
              </div>
              <div style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>{p.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {p.tags.slice(0, 3).map((t) => (
                  <button key={t} type="button" className="tag" onClick={() => setActiveTag(t)}>
                    #{t}
                  </button>
                ))}
              </div>
              <Link className="button secondary" to="/app">
                Ver en inicio
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Explore
