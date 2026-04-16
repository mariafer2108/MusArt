import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

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
  mediaUrl: string
  mediaType: 'image' | 'video'
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
  addPost: (input: { title: string; tags: string[]; mediaUrl: string; mediaType: 'image' | 'video' }) => Promise<void>
  updatePost: (postId: string, input: { title: string; tags: string[] }) => Promise<void>
  token: string | null
  setToken: (token: string | null) => void
  meUsername: string | null
  meBio: string
  meAvatarUrl: string | null
  saveMyProfile: (input: { bio: string; avatarUrl: string | null }) => Promise<void>
}

function decodeJwtPayload(token: string): unknown {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const json = atob(padded)
  return JSON.parse(json)
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [posts, setPosts] = useState<Post[]>([])
  const [following, setFollowing] = useState<Set<string>>(() => new Set())
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('musart_token'))
  const [meBio, setMeBio] = useState('')
  const [meAvatarUrl, setMeAvatarUrl] = useState<string | null>(null)

  const meUsername = useMemo(() => {
    if (!token) return null
    try {
      const payload = decodeJwtPayload(token) as { username?: unknown }
      if (!payload?.username) return null
      return String(payload.username)
    } catch {
      return null
    }
  }, [token])

  function setToken(next: string | null) {
    setTokenState(next)
    if (next) localStorage.setItem('musart_token', next)
    else localStorage.removeItem('musart_token')
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const incoming = params.get('token')
    if (!incoming) return
    setToken(incoming)
    params.delete('token')
    const rest = params.toString()
    navigate(rest ? `/app?${rest}` : '/app', { replace: true })
  }, [location.search, navigate])

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(path, { ...init, headers })
    if (res.status === 401) {
      setToken(null)
      navigate('/', { replace: true })
      throw new Error('unauthorized')
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'request_failed')
    return data as T
  }

  useEffect(() => {
    api<{ posts: Post[] }>('/api/posts')
      .then((d) => setPosts(d.posts))
      .catch(() => setPosts([]))
  }, [token])

  useEffect(() => {
    if (!token) {
      setFollowing(new Set())
      setMeBio('')
      setMeAvatarUrl(null)
      return
    }
    api<{ following: string[]; user?: { bio?: string; avatarUrl?: string | null } }>('/api/me')
      .then((d) => {
        setFollowing(new Set(d.following))
        setMeBio(String(d.user?.bio ?? ''))
        setMeAvatarUrl(d.user?.avatarUrl ?? null)
      })
      .catch(() => {
        setFollowing(new Set())
        setMeBio('')
        setMeAvatarUrl(null)
      })
  }, [token])

  function toggleFollow(author: string) {
    setFollowing((prev) => {
      const next = new Set(prev)
      if (next.has(author)) next.delete(author)
      else next.add(author)
      return next
    })
    api<{ following: boolean }>(`/api/follow/${encodeURIComponent(author)}/toggle`, { method: 'POST', body: '{}' })
      .then((r) => {
        setFollowing((prev) => {
          const next = new Set(prev)
          if (r.following) next.add(author)
          else next.delete(author)
          return next
        })
      })
      .catch(() => {
        setFollowing((prev) => {
          const next = new Set(prev)
          if (next.has(author)) next.delete(author)
          else next.add(author)
          return next
        })
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

  async function addPost(input: { title: string; tags: string[]; mediaUrl: string; mediaType: 'image' | 'video' }) {
    const r = await api<{ post: Post }>('/api/posts', { method: 'POST', body: JSON.stringify(input) })
    setPosts((prev) => [r.post, ...prev])
  }

  async function updatePost(postId: string, input: { title: string; tags: string[] }) {
    const r = await api<{ post: Post }>(`/api/posts/${encodeURIComponent(postId)}`, { method: 'PATCH', body: JSON.stringify(input) })
    setPosts((prev) => prev.map((p) => (p.id === postId ? r.post : p)))
  }

  async function saveMyProfile(input: { bio: string; avatarUrl: string | null }) {
    const r = await api<{ user: { bio?: string; avatarUrl?: string | null } }>('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(input)
    })
    setMeBio(String(r.user?.bio ?? ''))
    setMeAvatarUrl(r.user?.avatarUrl ?? null)
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
              <button
                className="side-link"
                type="button"
                onClick={() => {
                  setToken(null)
                  navigate('/', { replace: true })
                }}
                style={{ border: 'none', background: 'transparent', textAlign: 'left' }}
              >
                Cerrar sesión
              </button>
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
                    updatePost,
                    token,
                    setToken,
                    meUsername,
                    meBio,
                    meAvatarUrl,
                    saveMyProfile
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
