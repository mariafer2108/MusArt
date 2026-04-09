import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

export type Comment = {
  id: string
  author: string
  text: string
  createdAt: string
}

export type Post = {
  id: string
  author: string
  title: string
  tags: string[]
  imageUrl: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  likedByMe: boolean
  previewComments: Comment[]
  createdAt: string
}

export type AppOutletContext = {
  posts: Post[]
  following: Set<string>
  toggleFollow: (author: string) => void
  toggleLike: (postId: string) => void
  addComment: (postId: string, text: string) => void
  sharePost: (postId: string) => Promise<void>
  addPost: (input: { title: string; tags: string[]; imageUrl: string }) => Promise<void>
  token: string | null
  setToken: (token: string | null) => void
}

function AppLayout() {
  const [posts, setPosts] = useState<Post[]>([])
  const [following, setFollowing] = useState<Set<string>>(() => new Set())
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('musart_token'))

  function setToken(next: string | null) {
    setTokenState(next)
    if (next) localStorage.setItem('musart_token', next)
    else localStorage.removeItem('musart_token')
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(path, { ...init, headers })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'request_failed')
    return data as T
  }

  useEffect(() => {
    api<{ posts: Post[] }>('/api/posts')
      .then((d) => setPosts(d.posts))
      .catch(() => setPosts([]))
  }, [token])

  function toggleFollow(author: string) {
    setFollowing((prev) => {
      const next = new Set(prev)
      if (next.has(author)) next.delete(author)
      else next.add(author)
      return next
    })
  }

  function toggleLike(postId: string) {
    api<{ likesCount: number; likedByMe: boolean }>(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'POST', body: '{}' })
      .then((r) => {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likesCount: r.likesCount, likedByMe: r.likedByMe } : p)))
      })
      .catch(() => null)
  }

  function addComment(postId: string, text: string) {
    api<{ comment: Comment; commentsCount: number }>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text })
    })
      .then((r) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, commentsCount: r.commentsCount, previewComments: [r.comment, ...p.previewComments].slice(0, 5) }
              : p
          )
        )
      })
      .catch(() => null)
  }

  async function sharePost(postId: string) {
    const url = `${window.location.origin}/app?post=${encodeURIComponent(postId)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
    }
    try {
      const r = await api<{ sharesCount: number }>(`/api/posts/${encodeURIComponent(postId)}/share`, { method: 'POST', body: '{}' })
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, sharesCount: r.sharesCount } : p)))
    } catch {
      return
    }
  }

  async function addPost(input: { title: string; tags: string[]; imageUrl: string }) {
    const r = await api<{ post: Post }>('/api/posts', { method: 'POST', body: JSON.stringify(input) })
    setPosts((prev) => [r.post, ...prev])
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="app-inner">
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <img src="/logomusart.PNG" alt="MusArt" />
              </div>
              <div className="sidebar-title">MusArt</div>
            </div>
            <nav style={{ display: 'grid', gap: 6 }}>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app" end>Inicio</NavLink>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app/explorar">Explorar</NavLink>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app/comisiones">Comisiones</NavLink>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app/mensajes">Mensajes</NavLink>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app/perfil">Perfil</NavLink>
              <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to="/app/crear">Crear</NavLink>
              <Link className="side-link" to="/">Cerrar sesión</Link>
            </nav>
          </aside>
          <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minWidth: 0 }}>
            <div className="topbar">
              <div className="topbar-brand">
                <img src="/logomusart.PNG" alt="MusArt" />
                <div className="topbar-wordmark">MusArt</div>
              </div>
              <div className="search">
                <input className="input" placeholder="Descubre artistas..." />
              </div>
            </div>
            <div className="content">
              <Outlet
                context={
                  {
                    posts,
                    following,
                    toggleFollow,
                    toggleLike,
                    addComment,
                    sharePost,
                    addPost,
                    token,
                    setToken
                  } satisfies AppOutletContext
                }
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppLayout
