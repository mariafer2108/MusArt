import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import { upload } from '@vercel/blob/client'

type Artist = {
  username: string
  avatarUrl: string | null
  bio: string
  categories: string[]
  priceInfo: string
  terms?: string
}

const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: 'digital', label: 'Digital' },
  { id: 'tradicional', label: 'Tradicional' },
  { id: '3d', label: '3D' },
  { id: 'tatuaje', label: 'Tatuaje' },
  { id: 'pixelart', label: 'Pixel Art' }
]

function Commissions() {
  const navigate = useNavigate()
  const { token, meUsername, meAcceptsCommissions, meCommissionCategories, meCommissionPriceInfo, meCommissionTerms, saveMyCommissions } =
    useOutletContext<AppOutletContext>()

  const [category, setCategory] = useState<string>('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [acceptsDraft, setAcceptsDraft] = useState(meAcceptsCommissions)
  const [categoriesDraft, setCategoriesDraft] = useState<string[]>(meCommissionCategories)
  const [priceInfoDraft, setPriceInfoDraft] = useState(meCommissionPriceInfo)
  const [termsDraft, setTermsDraft] = useState(meCommissionTerms)
  const [savingSettings, setSavingSettings] = useState(false)

  const [requestOpen, setRequestOpen] = useState(false)
  const [requestArtist, setRequestArtist] = useState<Artist | null>(null)
  const [requestTitle, setRequestTitle] = useState('')
  const [requestDetails, setRequestDetails] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)
  const [requestImageUrls, setRequestImageUrls] = useState<string[]>([])

  useEffect(() => {
    setAcceptsDraft(meAcceptsCommissions)
    setCategoriesDraft(meCommissionCategories)
    setPriceInfoDraft(meCommissionPriceInfo)
    setTermsDraft(meCommissionTerms)
  }, [meAcceptsCommissions, meCommissionCategories, meCommissionPriceInfo, meCommissionTerms])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const url = category ? `/api/commissions/artists?category=${encodeURIComponent(category)}` : '/api/commissions/artists'
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error ?? 'request_failed')
        setArtists(Array.isArray(d?.artists) ? d.artists : [])
      })
      .catch(() => {
        setError('No se pudo cargar comisiones.')
        setArtists([])
      })
      .finally(() => setLoading(false))
  }, [category, token])

  const categoryChips = useMemo(
    () => [{ id: '', label: 'Todas' }, ...CATEGORY_OPTIONS],
    []
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="story"><div /></div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Comisiones</div>
              <div style={{ color: 'var(--muted)' }}>Publica tu disponibilidad o solicita una comisión</div>
            </div>
          </div>
          <button className="button secondary" type="button" onClick={() => setSettingsOpen(true)} disabled={!token}>
            Configurar
          </button>
        </div>
        <div style={{ marginTop: 10, color: 'var(--muted)', fontWeight: 700 }}>
          Estado: {meAcceptsCommissions ? 'Aceptando comisiones' : 'No disponible'} {meUsername ? `· @${meUsername}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {categoryChips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={category === c.id ? 'pill' : 'button secondary'}
            onClick={() => setCategory(c.id)}
            style={{ padding: '8px 12px', borderRadius: 999 }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error ? <div className="pill">{error}</div> : null}
      {loading ? <div style={{ color: 'var(--muted)', fontWeight: 800 }}>Cargando...</div> : null}

      <div className="grid">
        {artists.map((a) => (
          <div key={a.username} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {a.avatarUrl ? (
                <div className="story" style={{ overflow: 'hidden' }}>
                  <img src={a.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 999 }} />
                </div>
              ) : (
                <div className="story"><div /></div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.username}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.bio || 'Artista en MusArt'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {a.categories.slice(0, 4).map((c) => (
                <span key={c} className="pill">
                  {CATEGORY_OPTIONS.find((x) => x.id === c)?.label ?? c}
                </span>
              ))}
            </div>
            {a.priceInfo ? (
              <div style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 12, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                {a.priceInfo}
              </div>
            ) : null}
            <button
              className="button"
              type="button"
              disabled={!token}
              onClick={() => {
                setRequestArtist(a)
                setRequestTitle('')
                setRequestDetails('')
                setRequestOpen(true)
              }}
            >
              Solicitar comisión
            </button>
          </div>
        ))}
      </div>

      {settingsOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setSettingsOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Configurar comisiones</div>
              <button className="button secondary" type="button" onClick={() => setSettingsOpen(false)} style={{ padding: '8px 12px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className={acceptsDraft ? 'button' : 'button secondary'} type="button" onClick={() => setAcceptsDraft(true)}>
                  Sí, acepto
                </button>
                <button className={!acceptsDraft ? 'button' : 'button secondary'} type="button" onClick={() => setAcceptsDraft(false)}>
                  No, por ahora
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {CATEGORY_OPTIONS.map((c) => {
                  const active = categoriesDraft.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={active ? 'pill' : 'button secondary'}
                      style={{ padding: '8px 12px', borderRadius: 999 }}
                      onClick={() =>
                        setCategoriesDraft((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                      }
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
              <textarea
                className="input textarea"
                placeholder="Tabla de precios, condiciones, tiempos de entrega..."
                style={{ height: 140 }}
                value={priceInfoDraft}
                onChange={(e) => setPriceInfoDraft(e.target.value.slice(0, 800))}
              />
              <textarea
                className="input textarea"
                placeholder="Términos y condiciones (pagos, revisiones, tiempos, uso comercial...)"
                style={{ height: 160 }}
                value={termsDraft}
                onChange={(e) => setTermsDraft(e.target.value.slice(0, 2000))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="button secondary" type="button" onClick={() => setSettingsOpen(false)} disabled={savingSettings}>
                  Cancelar
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true)
                    try {
                      await saveMyCommissions({ acceptsCommissions: acceptsDraft, categories: categoriesDraft, priceInfo: priceInfoDraft, terms: termsDraft })
                      setSettingsOpen(false)
                    } finally {
                      setSavingSettings(false)
                    }
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {requestOpen && requestArtist ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setRequestOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Solicitar comisión a {requestArtist.username}</div>
              <button className="button secondary" type="button" onClick={() => setRequestOpen(false)} style={{ padding: '8px 12px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              <input className="input" placeholder="Título (ej: retrato busto)" value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} />
              <textarea
                className="input textarea"
                placeholder="Describe lo que necesitas, referencias, deadline, etc."
                style={{ height: 160 }}
                value={requestDetails}
                onChange={(e) => setRequestDetails(e.target.value)}
              />
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 900, color: 'var(--primary-strong)' }}>Imágenes (opcional)</div>
                  <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 12 }}>{requestImageUrls.length}/3</div>
                </div>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={!token || sendingRequest || requestImageUrls.length >= 3}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || [])
                    if (!files.length || !token) return
                    const remaining = Math.max(0, 3 - requestImageUrls.length)
                    const toUpload = files.slice(0, remaining)
                    try {
                      const urls: string[] = []
                      for (const f of toUpload) {
                        const ext = (f.name.split('.').pop() || '').toLowerCase()
                        const safeExt = ext && ext.length <= 8 ? ext : 'jpg'
                        const blob = await upload(`commission-requests/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`, f, {
                          access: 'public',
                          handleUploadUrl: '/api/blob/upload',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                        urls.push(blob.url)
                      }
                      setRequestImageUrls((prev) => [...prev, ...urls].slice(0, 3))
                    } catch {
                      setError('No se pudieron subir las imágenes.')
                    } finally {
                      e.target.value = ''
                    }
                  }}
                />
                {requestImageUrls.length ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {requestImageUrls.map((u) => (
                      <div key={u} style={{ position: 'relative' }}>
                        <img src={u} alt="Adjunto" style={{ width: 92, height: 92, borderRadius: 12, objectFit: 'cover', display: 'block' }} />
                        <button
                          type="button"
                          className="button secondary"
                          style={{ position: 'absolute', top: 6, right: 6, padding: '6px 10px', borderRadius: 999, fontSize: 12 }}
                          onClick={() => setRequestImageUrls((prev) => prev.filter((x) => x !== u))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="button secondary" type="button" onClick={() => setRequestOpen(false)} disabled={sendingRequest}>
                  Cancelar
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={sendingRequest || !requestTitle.trim() || !requestDetails.trim()}
                  onClick={async () => {
                    if (!token) return
                    setSendingRequest(true)
                    try {
                      const r = await fetch('/api/commissions/requests', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          artistUsername: requestArtist.username,
                          title: requestTitle.trim(),
                          details: requestDetails.trim(),
                          imageUrls: requestImageUrls
                        })
                      })
                      const d = await r.json().catch(() => null)
                      if (!r.ok) throw new Error(d?.error ?? 'request_failed')
                      setRequestOpen(false)
                      setRequestImageUrls([])
                      navigate(`/app/mensajes?c=${encodeURIComponent(String(d.conversationId))}`)
                    } catch {
                      setError('No se pudo enviar la solicitud.')
                    } finally {
                      setSendingRequest(false)
                    }
                  }}
                >
                  Enviar solicitud
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Commissions
