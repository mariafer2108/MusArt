import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'

const categories = [
  'Ilustración Digital',
  'Ilustración Tradicional',
  'Artista 3D',
  'Tatuador',
  'Pixel Art',
  'Anime'
]

function Interests() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const backgrounds = useMemo<Record<string, string>>(
    () => ({
      'Ilustración Digital': '/digital.jpg',
      'Ilustración Tradicional': '/tradicional.jpg',
      'Artista 3D': '/animacion.jpg',
      'Tatuador': '/tattoo.jpg',
      'Pixel Art': '/pixelart.png',
      'Anime': '/anime.png'
    }),
    []
  )

  const selectedCount = selected.size

  function toggle(cat: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '6px 0 14px 0' }}>
        <div className="brand">Selecciona tus intereses</div>
        <div className="pill">{selectedCount} seleccionado(s)</div>
      </div>
      <div className="grid">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className="category-card"
            onClick={() => toggle(c)}
            style={{
              backgroundImage: `url(${backgrounds[c]})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              outline: selected.has(c) ? '4px solid rgba(107, 67, 194, 0.35)' : 'none'
            }}
          >
            <span className="category-label">{c}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
        <Link
          className="button"
          to="/app"
          aria-disabled={selectedCount === 0}
          style={{
            pointerEvents: selectedCount === 0 ? 'none' : 'auto',
            opacity: selectedCount === 0 ? 0.55 : 1
          }}
        >
          Continuar
        </Link>
        <Link className="button secondary" to="/">Volver</Link>
      </div>
    </div>
  )
}

export default Interests
