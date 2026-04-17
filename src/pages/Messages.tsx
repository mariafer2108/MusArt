import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'

type Conversation = {
  id: string
  otherUsername: string
  otherAvatarUrl: string | null
  lastText: string
  lastAt: string
}

type Message = {
  id: string
  sender: string
  senderAvatarUrl: string | null
  text: string
  createdAt: string
}

function formatTimeShort(iso: string) {
  const t = new Date(iso).getTime()
  const now = Date.now()
  const minutes = Math.max(0, Math.floor((now - t) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function Messages() {
  const { token, meUsername } = useOutletContext<AppOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('c'))

  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId])

  async function fetchConversations() {
    if (!token) return
    setLoadingList(true)
    try {
      const r = await fetch('/api/conversations', { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error ?? 'request_failed')
      setConversations(Array.isArray(d?.conversations) ? d.conversations : [])
    } finally {
      setLoadingList(false)
    }
  }

  async function fetchMessages(conversationId: string) {
    if (!token) return
    setLoadingMessages(true)
    try {
      const r = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error ?? 'request_failed')
      setMessages(Array.isArray(d?.messages) ? d.messages : [])
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ block: 'end' }))
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    const c = searchParams.get('c')
    if (c) setSelectedId(c)
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    fetchConversations()
    const id = window.setInterval(() => fetchConversations(), 8000)
    return () => window.clearInterval(id)
  }, [token])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    fetchMessages(selectedId)
    if (!token) return
    const id = window.setInterval(() => fetchMessages(selectedId), 4000)
    return () => window.clearInterval(id)
  }, [selectedId, token])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.otherUsername.toLowerCase().includes(q) || c.lastText.toLowerCase().includes(q))
  }, [conversations, search])

  return (
    <div className="split">
      <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <input className="input" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {loadingList ? <div style={{ color: 'var(--muted)', fontWeight: 800 }}>Cargando...</div> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="card"
              onClick={() => {
                setSelectedId(c.id)
                setSearchParams((p) => {
                  p.set('c', c.id)
                  return p
                })
              }}
              style={{
                padding: 12,
                textAlign: 'left',
                cursor: 'pointer',
                border: 'none',
                outline: selectedId === c.id ? '2px solid rgba(107, 67, 194, 0.35)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {c.otherAvatarUrl ? (
                    <div className="story" style={{ width: 42, height: 42, overflow: 'hidden' }}>
                      <img src={c.otherAvatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 999 }} />
                    </div>
                  ) : (
                    <div className="story" style={{ width: 42, height: 42 }}><div /></div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{c.otherUsername}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.lastText || '—'}
                    </div>
                  </div>
                </div>
                <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 12 }}>{formatTimeShort(c.lastAt)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 520 }}>
        {selected ? (
          <>
            <div style={{ padding: 14, borderBottom: '1px solid rgba(52, 29, 99, 0.08)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>{selected.otherUsername}</div>
              <div style={{ color: 'var(--muted)', fontWeight: 700 }}>Chat</div>
            </div>

            <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 10 }}>
              {loadingMessages ? <div style={{ color: 'var(--muted)', fontWeight: 800 }}>Cargando mensajes...</div> : null}
              {messages.length === 0 && !loadingMessages ? (
                <div style={{ color: 'var(--muted)', fontWeight: 700 }}>Aún no hay mensajes.</div>
              ) : null}
              {messages.map((m) => {
                const mine = m.sender === meUsername
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    <div
                      className="card"
                      style={{
                        padding: 12,
                        maxWidth: 520,
                        background: mine ? 'rgba(107, 67, 194, 0.14)' : '#f7f0ff',
                        border: mine ? '1px solid rgba(107, 67, 194, 0.22)' : '1px solid rgba(52, 29, 99, 0.08)',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                        {mine ? 'Tú' : m.sender} · {formatTimeShort(m.createdAt)}
                      </div>
                      <div style={{ color: 'var(--text)', fontWeight: 650 }}>{m.text}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: 14, borderTop: '1px solid rgba(52, 29, 99, 0.08)', display: 'flex', gap: 10 }}>
              <input
                className="input"
                placeholder="Escribe un mensaje..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!draft.trim()) return
                    if (!selectedId || !token) return
                    setSending(true)
                    fetch(`/api/conversations/${encodeURIComponent(selectedId)}/messages`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ text: draft.trim() })
                    })
                      .then(async (r) => {
                        const d = await r.json().catch(() => null)
                        if (!r.ok) throw new Error(d?.error ?? 'request_failed')
                        setDraft('')
                        await fetchMessages(selectedId)
                        await fetchConversations()
                      })
                      .finally(() => setSending(false))
                  }
                }}
              />
              <button
                className="button"
                type="button"
                disabled={sending || !draft.trim()}
                onClick={async () => {
                  if (!selectedId || !token) return
                  setSending(true)
                  try {
                    const r = await fetch(`/api/conversations/${encodeURIComponent(selectedId)}/messages`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ text: draft.trim() })
                    })
                    const d = await r.json().catch(() => null)
                    if (!r.ok) throw new Error(d?.error ?? 'request_failed')
                    setDraft('')
                    await fetchMessages(selectedId)
                    await fetchConversations()
                  } finally {
                    setSending(false)
                  }
                }}
              >
                Enviar
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)', minHeight: 520 }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: 'var(--primary-strong)' }}>Tus mensajes</div>
              <div>Selecciona una conversación o solicita una comisión para crear un chat.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Messages
