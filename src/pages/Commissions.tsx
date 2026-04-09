function Commissions() {
  const artists = [
    {
      name: 'Xanty_Morita',
      desc: 'Comisiones abiertas',
      cover: '/busqueda/digital.jpg.avif'
    },
    {
      name: 'Hanamiru',
      desc: 'Slots limitados',
      cover: '/busqueda/tradicional.jpg'
    },
    {
      name: 'Sakimi',
      desc: 'Entrega rápida',
      cover: '/busqueda/anime.jpg'
    },
    {
      name: 'Yuki',
      desc: 'Especialidad: retratos',
      cover: '/busqueda/pixelart.jpg'
    }
  ]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="story"><div /></div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>¿Aceptas comisiones?</div>
            <div style={{ color: 'var(--muted)' }}>Configura tu disponibilidad y tabla de valores</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="button" type="button">Sí, acepto</button>
          <button className="button secondary" type="button">No, por ahora</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span className="pill">Digital</span>
        <span className="pill">Tradicional</span>
        <span className="pill">3D</span>
        <span className="pill">Tatuaje</span>
        <span className="pill">Pixel Art</span>
      </div>
      <div className="grid">
        {artists.map((a) => (
          <div key={a.name} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div className="story"><div /></div>
              <div>
                <div style={{ fontWeight: 900 }}>{a.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{a.desc}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  height: 140,
                  borderRadius: 14,
                  background: `url(${a.cover}) center/cover`,
                  boxShadow: '0 10px 22px rgba(52, 29, 99, 0.12)'
                }}
              />
              <button className="button" type="button">Solicitar comisión</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Commissions
