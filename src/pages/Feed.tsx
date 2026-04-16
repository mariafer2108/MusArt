import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext, Post } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'

function formatTimeAgo(createdAt: string) {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const minutes = Math.max(0, Math.floor((now - created) / 60000))
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}

function formatCount(n: number) {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) {
    const k = n / 1000
    const digits = k >= 100 ? 0 : 1
    return `${k.toFixed(digits)}k`
  }
  const m = n / 1_000_000
  const digits = m >= 100 ? 0 : 1
  return `${m.toFixed(digits)}M`
}

function PostCard({
  post,
  isFollowing,
  canEdit,
  onToggleFollow,
  onToggleLike,
  onAddComment,
  onShare,
  onTagClick,
  onEdit
}: {
  post: Post
  isFollowing: boolean
  canEdit: boolean
  onToggleFollow: (author: string) => void
  onToggleLike: (postId: string) => void
  onAddComment: (postId: string, text: string) => void
  onShare: (postId: string) => void
  onTagClick: (tag: string) => void
  onEdit: (postId: string, next: { title: string; tags: string[] }) => Promise<void>
}) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(post.title)
  const [editTags, setEditTags] = useState(post.tags.map((t) => `#${t}`).join(' '))
  const [savingEdit, setSavingEdit] = useState(false)

  function submitComment() {
    const text = draft.trim()
    if (!text) return
    onAddComment(post.id, text)
    setDraft('')
    setCommentsOpen(true)
  }

  function parseTags(text: string) {
    const matches = Array.from(text.matchAll(/#([A-Za-z0-9_]+)/g)).map((m) => m[1].toLowerCase())
    if (matches.length) return matches
    return text
      .split(/[,\s]+/g)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i)
  }

  async function saveEdit() {
    const title = editTitle.trim()
    if (!title) return
    const tags = parseTags(editTags)
    setSavingEdit(true)
    try {
      await onEdit(post.id, { title, tags })
      setEditing(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="card post" style={{ padding: 16 }}>
      <div className="post-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div className="story"><div /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {post.author}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {formatTimeAgo(post.createdAt)}
              </div>
            </div>
            <div className="post-title">{post.title}</div>
            <div className="post-tags" aria-label="Etiquetas">
              {post.tags.map((t) => (
                <button key={t} type="button" className="tag" onClick={() => onTagClick(t)}>
                  #{t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setEditTitle(post.title)
              setEditTags(post.tags.map((t) => `#${t}`).join(' '))
              setEditing(true)
            }}
            style={{ padding: '8px 12px', borderRadius: 999, fontSize: 12 }}
          >
            Editar
          </button>
        ) : (
          <button
            type="button"
            className={isFollowing ? 'button secondary' : 'button'}
            onClick={() => onToggleFollow(post.author)}
            style={{ padding: '8px 12px', borderRadius: 999, fontSize: 12 }}
          >
            {isFollowing ? 'Siguiendo' : 'Seguir'}
          </button>
        )}
      </div>
      <div className="post-image">
        {post.mediaType === 'video' ? (
          <AutoVideo src={post.mediaUrl} />
        ) : (
          <img src={post.mediaUrl} alt="Publicación" loading="lazy" />
        )}
      </div>
      <div className="post-actions">
        <button
          type="button"
          className={`post-action${post.likedByMe ? ' active' : ''}`}
          onClick={() => onToggleLike(post.id)}
        >
          Me gusta {formatCount(post.likesCount)}
        </button>
        <button
          type="button"
          className="post-action"
          onClick={() => setCommentsOpen((v) => !v)}
        >
          Comentarios {formatCount(post.commentsCount)}
        </button>
        <button
          type="button"
          className="post-action"
          onClick={() => onShare(post.id)}
        >
          Compartidos {formatCount(post.sharesCount)}
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <input
          className="input"
          placeholder="Escribe un comentario..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitComment()
          }}
        />
        <button className="button" type="button" onClick={submitComment} style={{ padding: '10px 14px' }}>
          Enviar
        </button>
      </div>

      {commentsOpen ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {post.previewComments.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontWeight: 700 }}>Aún no hay comentarios. Sé el primero.</div>
          ) : (
            post.previewComments.slice(0, 6).map((c) => (
              <div key={c.id} className="card" style={{ padding: 12, background: '#f7f0ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{c.author}</div>
                    <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 12 }}>{formatTimeAgo(c.createdAt)}</div>
                </div>
                <div style={{ color: 'var(--text)', marginTop: 4 }}>{c.text}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Editar publicación</div>
              <button className="button secondary" type="button" onClick={() => setEditing(false)} style={{ padding: '8px 12px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título" />
              <input className="input" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="#tags (ej: #anime #digital)" />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="button secondary" type="button" onClick={() => setEditing(false)} disabled={savingEdit}>
                  Cancelar
                </button>
                <button className="button" type="button" onClick={saveEdit} disabled={savingEdit || !editTitle.trim()}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Feed() {
  const { posts, following, toggleFollow, toggleLike, addComment, sharePost, updatePost, meUsername } = useOutletContext<AppOutletContext>()
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const filteredPosts = activeTag ? posts.filter((p) => p.tags.includes(activeTag)) : posts

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {activeTag ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pill">Filtrando por #{activeTag}</span>
          <button className="button secondary" type="button" onClick={() => setActiveTag(null)}>
            Quitar filtro
          </button>
        </div>
      ) : null}
      <div className="story-row">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="story"><div /></div>)}
      </div>
      {filteredPosts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          isFollowing={following.has(p.author)}
          canEdit={Boolean(meUsername && p.author === meUsername)}
          onToggleFollow={toggleFollow}
          onToggleLike={toggleLike}
          onAddComment={addComment}
          onShare={sharePost}
          onTagClick={(t) => setActiveTag(t)}
          onEdit={(postId, next) => updatePost(postId, next)}
        />
      ))}
    </div>
  )
}

export default Feed
