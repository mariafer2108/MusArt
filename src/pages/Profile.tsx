import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import AutoVideo from '../ui/AutoVideo'
import { upload } from '@vercel/blob/client'

type Tab = 'portafolio' | 'comisiones'

function formatPrice(priceCents: number, currency: string) {
  const value = (priceCents || 0) / 100
  return `${value.toFixed(value % 1 ? 2 : 0)} ${currency}`
}

function Profile() {
  const navigate = useNavigate()
  const {
    posts,
    following,
    toggleFollow,
    toggleLike,
    addComment,
    sharePost,
    meUsername,
    meBio,
    meAvatarUrl,
    token,
    saveMyProfile,
    meAcceptsCommissions,
    meCommissionCategories,
    meCommissionPriceInfo,
    meCommissionTerms,
    saveMyCommissions,
    meCommissionProducts,
    createCommissionProduct,
    updateCommissionProduct,
    deleteCommissionProduct,
    refreshMyCommissionProducts
  } = useOutletContext<AppOutletContext>()
  const [tab, setTab] = useState<Tab>('portafolio')
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [usernameDraft, setUsernameDraft] = useState(meUsername ?? '')
  const [bioDraft, setBioDraft] = useState(meBio)
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(meAvatarUrl)
  const [savingProfile, setSavingProfile] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productTitle, setProductTitle] = useState('')
  const [productCurrency, setProductCurrency] = useState<'USD' | 'MXN'>('USD')
  const [productPrice, setProductPrice] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productImageUrl, setProductImageUrl] = useState<string>('')
  const [savingProduct, setSavingProduct] = useState(false)
  const [termsDraft, setTermsDraft] = useState(meCommissionTerms)
  const [savingTerms, setSavingTerms] = useState(false)

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
    setUsernameDraft(meUsername ?? '')
    setBioDraft(meBio)
    setAvatarDraftUrl(meAvatarUrl)
  }, [meBio, meAvatarUrl, meUsername])

  useEffect(() => {
    setTermsDraft(meCommissionTerms)
  }, [meCommissionTerms])

  function openNewProduct() {
    setEditingProductId(null)
    setProductTitle('')
    setProductCurrency('USD')
    setProductPrice('')
    setProductDescription('')
    setProductImageUrl('')
    setProductModalOpen(true)
  }

  function openEditProduct(id: string) {
    const p = meCommissionProducts.find((x) => x.id === id)
    if (!p) return
    setEditingProductId(id)
    setProductTitle(p.title)
    setProductCurrency((p.currency === 'MXN' ? 'MXN' : 'USD') as 'USD' | 'MXN')
    setProductPrice(String((p.priceCents / 100).toFixed(p.priceCents % 100 ? 2 : 0)))
    setProductDescription(p.description || '')
    setProductImageUrl(p.imageUrl)
    setProductModalOpen(true)
  }

  async function uploadProductImage(file: File) {
    if (!token) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const safeExt = ext && ext.length <= 8 ? ext : 'jpg'
    const blob = await upload(`commission-products/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      headers: { Authorization: `Bearer ${token}` }
    })
    setProductImageUrl(blob.url)
  }

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
            <button className="button secondary" type="button" onClick={() => setEditProfileOpen(true)}>
              Editar perfil
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
          <button className="button ghost" type="button" onClick={() => navigate('/app/comisiones')}>Comisiones</button>
        </div>
      </div>

      {editProfileOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setEditProfileOpen(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Editar perfil</div>
              <button className="button secondary" type="button" onClick={() => setEditProfileOpen(false)} style={{ padding: '8px 12px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="story" style={{ overflow: 'hidden' }}>
                  {avatarDraftUrl ? (
                    <img src={avatarDraftUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 999 }} />
                  ) : (
                    <div />
                  )}
                </div>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
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
              </div>
              <input
                className="input"
                placeholder="Tu usuario (3–20, letras/números/_)"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
              />
              <textarea
                className="input textarea"
                placeholder="Describe tu perfil..."
                style={{ height: 120 }}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value.slice(0, 220))}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="button secondary" type="button" onClick={() => setEditProfileOpen(false)} disabled={savingProfile}>
                  Cancelar
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true)
                    try {
                      const nextUsername = usernameDraft.trim()
                      await saveMyProfile({ username: nextUsername || undefined, bio: bioDraft.trim(), avatarUrl: avatarDraftUrl })
                      setEditProfileOpen(false)
                    } finally {
                      setSavingProfile(false)
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
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Términos y condiciones</div>
            <div style={{ color: 'var(--muted)', fontWeight: 650, marginBottom: 10 }}>
              Escribe tus reglas: pagos, revisiones, tiempos de entrega, uso comercial, reembolsos, etc.
            </div>
            <textarea
              className="input textarea"
              placeholder="Ej: 50% por adelantado. 2 revisiones incluidas. Entrega 7-14 días..."
              style={{ height: 170 }}
              value={termsDraft}
              onChange={(e) => setTermsDraft(e.target.value.slice(0, 2000))}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                className="button"
                type="button"
                disabled={!token || savingTerms}
                onClick={async () => {
                  if (!token) return
                  setSavingTerms(true)
                  try {
                    await saveMyCommissions({
                      acceptsCommissions: meAcceptsCommissions,
                      categories: meCommissionCategories,
                      priceInfo: meCommissionPriceInfo,
                      terms: termsDraft.trim()
                    })
                  } finally {
                    setSavingTerms(false)
                  }
                }}
              >
                Guardar términos
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Productos y precios</div>
                <div style={{ color: 'var(--muted)', fontWeight: 650 }}>Sube una imagen y define el precio de cada comisión</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="button secondary" type="button" onClick={() => refreshMyCommissionProducts()} disabled={!token}>
                  Actualizar
                </button>
                <button className="button" type="button" onClick={openNewProduct} disabled={!token}>
                  Agregar producto
                </button>
              </div>
            </div>
          </div>

          <div className="grid">
            {meCommissionProducts.map((p) => (
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
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button className="button secondary" type="button" onClick={() => openEditProduct(p.id)}>
                      Editar
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={async () => {
                        if (!confirm('¿Borrar este producto?')) return
                        await deleteCommissionProduct(p.id)
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {meCommissionProducts.length === 0 ? (
              <div className="card" style={{ padding: 16, color: 'var(--muted)', fontWeight: 700 }}>
                Aún no tienes productos de comisiones. Agrega uno para mostrar tus precios.
              </div>
            ) : null}
          </div>

          {productModalOpen ? (
            <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setProductModalOpen(false)}>
              <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div style={{ fontWeight: 900 }}>{editingProductId ? 'Editar producto' : 'Nuevo producto'}</div>
                  <button className="button secondary" type="button" onClick={() => setProductModalOpen(false)} style={{ padding: '8px 12px' }}>
                    Cerrar
                  </button>
                </div>
                <div style={{ padding: 14, display: 'grid', gap: 10 }}>
                  <div style={{ height: 180, borderRadius: 16, overflow: 'hidden', background: '#ddd' }}>
                    {productImageUrl ? (
                      <img src={productImageUrl} alt="Producto" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : null}
                  </div>
                  <input className="input" type="file" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    uploadProductImage(f)
                  }} />
                  <input className="input" placeholder="Nombre del producto (ej: Chibi)" value={productTitle} onChange={(e) => setProductTitle(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <select
                      className="input"
                      value={productCurrency}
                      onChange={(e) => setProductCurrency(e.target.value === 'MXN' ? 'MXN' : 'USD')}
                      style={{ maxWidth: 120 }}
                    >
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                    <input
                      className="input"
                      placeholder="Precio (ej: 15)"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <textarea
                    className="input textarea"
                    placeholder="Descripción (opcional)"
                    style={{ height: 120 }}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value.slice(0, 220))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="button secondary" type="button" onClick={() => setProductModalOpen(false)} disabled={savingProduct}>
                      Cancelar
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={savingProduct || !productTitle.trim() || !productImageUrl || !productPrice.trim()}
                      onClick={async () => {
                        if (!token) return
                        const price = Number(String(productPrice).replace(',', '.'))
                        if (!Number.isFinite(price) || price < 0) return
                        const priceCents = Math.round(price * 100)
                        setSavingProduct(true)
                        try {
                          const input = {
                            title: productTitle.trim().slice(0, 80),
                            imageUrl: productImageUrl,
                            priceCents,
                            currency: productCurrency,
                            description: productDescription.trim()
                          }
                          if (editingProductId) await updateCommissionProduct(editingProductId, input)
                          else await createCommissionProduct(input)
                          setProductModalOpen(false)
                        } finally {
                          setSavingProduct(false)
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
