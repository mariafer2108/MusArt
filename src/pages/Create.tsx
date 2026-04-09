import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../ui/AppLayout'

function extractTags(text: string) {
  return Array.from(text.matchAll(/#([A-Za-z0-9_]+)/g))
    .map((m) => m[1].toLowerCase())
    .filter((t, i, arr) => arr.indexOf(t) === i)
}

function extractTitle(text: string) {
  const line = text.split('\n')[0]?.trim() ?? ''
  const cleaned = line.replace(/#[A-Za-z0-9_]+/g, '').trim()
  return (cleaned || 'Nueva publicación').slice(0, 60)
}

function Create() {
  const { addPost, token } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPickFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    const url = await new Promise<string>((resolve, reject) => {
      reader.onerror = () => reject(new Error('read_error'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
    setImageUrl(url)
  }

  async function publish() {
    if (!token) {
      navigate('/')
      return
    }
    if (!imageUrl) return
    setSaving(true)
    setError(null)
    try {
      const title = extractTitle(text)
      const tags = extractTags(text)
      await addPost({ title, tags, imageUrl })
      navigate('/app')
    } catch {
      setError('No se pudo publicar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="split">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 18 }}>Crear publicación</div>
        <textarea
          className="input textarea"
          placeholder="Comparte tu arte... (usa #tags para que te encuentren)"
          style={{ height: 140 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pill">Título: {extractTitle(text)}</span>
          <span className="pill">Tags: {extractTags(text).length ? `#${extractTags(text).join(' #')}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={publish} disabled={!imageUrl || saving}>
            Publicar
          </button>
          <button className="button secondary" type="button">Guardar borrador</button>
        </div>
        {error ? <div className="pill">{error}</div> : null}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Archivo</div>
        <div style={{ height: 320, borderRadius: 16, overflow: 'hidden', background: '#e9d6ff', display: 'grid', placeItems: 'center', color: 'var(--primary-strong)', fontWeight: 800 }}>
          {imageUrl ? (
            <img src={imageUrl} alt="Vista previa" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            'Vista previa'
          )}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <div style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>
            Sube una imagen para tu publicación (JPG/PNG/WebP).
          </div>
        </div>
      </div>
    </div>
  )
}

export default Create
