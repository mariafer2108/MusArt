import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'
import { upload } from '@vercel/blob/client'

function normalizeTag(input: string) {
  const trimmed = input.trim().replace(/^#/, '')
  const cleaned = trimmed.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()
  return cleaned.slice(0, 24)
}

function Create() {
  const { addPost, token } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPickFile(file: File | null) {
    if (!file) return
    setFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  async function publish() {
    if (!token) {
      navigate('/')
      return
    }
    if (!file) {
      setError('Selecciona un archivo antes de publicar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const cleanTitle = title.trim()
      if (!cleanTitle) throw new Error('Escribe un título.')
      if (cleanTitle.length > 80) throw new Error('El título es demasiado largo.')
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const safeExt = ext && ext.length <= 8 ? ext : 'bin'
      const blob = await upload(`posts/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        headers: { Authorization: `Bearer ${token}` },
        multipart: file.size > 100 * 1024 * 1024
      })
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
      await addPost({ title: cleanTitle, description: text.trim().slice(0, 500), tags, mediaUrl: blob.url, mediaType })
      navigate('/app')
    } catch (e: any) {
      if (String(e?.message || '') === 'unauthorized') {
        setError('Tu sesión expiró. Inicia sesión otra vez.')
        navigate('/', { replace: true })
      } else {
        setError(e?.message ?? 'No se pudo publicar. Intenta de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="split">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 18 }}>Crear publicación</div>
        <input
          className="input"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 80))}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Agregar tag (ej: anime)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const next = normalizeTag(tagInput)
              if (!next) return
              setTags((prev) => (prev.includes(next) ? prev : [...prev, next].slice(0, 12)))
              setTagInput('')
            }}
            style={{ maxWidth: 260 }}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              const next = normalizeTag(tagInput)
              if (!next) return
              setTags((prev) => (prev.includes(next) ? prev : [...prev, next].slice(0, 12)))
              setTagInput('')
            }}
            style={{ padding: '10px 14px' }}
          >
            Añadir tag
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tags.length ? (
              tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="pill"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  style={{ border: 'none', cursor: 'pointer' }}
                  aria-label={`Quitar #${t}`}
                >
                  #{t} ×
                </button>
              ))
            ) : (
              <span className="pill">Tags: —</span>
            )}
          </div>
        </div>
        <textarea
          className="input textarea"
          placeholder="Escribe una descripción (opcional)"
          style={{ height: 140 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={publish} disabled={!file || saving}>
            Publicar
          </button>
          <button className="button secondary" type="button">Guardar borrador</button>
        </div>
        {error ? <div className="pill">{error}</div> : null}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Archivo</div>
        <div style={{ height: 320, borderRadius: 16, overflow: 'hidden', background: '#e9d6ff', display: 'grid', placeItems: 'center', color: 'var(--primary-strong)', fontWeight: 800 }}>
          {previewUrl && file ? (
            file.type.startsWith('video/') ? (
              <video src={previewUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            ) : (
              <img src={previewUrl} alt="Vista previa" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )
          ) : (
            'Vista previa'
          )}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input
            className="input"
            type="file"
            accept="image/*,video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <div style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>
            Sube una imagen o video para tu publicación.
          </div>
        </div>
      </div>
    </div>
  )
}

export default Create
