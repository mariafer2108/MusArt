function Messages() {
  const chats = [
    { name: 'Sakimi', last: '¿Tienes cupos para este mes?', time: '4d' },
    { name: 'Hanamiru', last: 'Te mando referencias y detalles', time: '2d' },
    { name: 'Zeldacw', last: 'Gracias por la comisión', time: '1d' },
    { name: 'Yuki', last: '¿Cuánto por full body?', time: '6h' }
  ]

  return (
    <div className="split">
      <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <input className="input" placeholder="Buscar..." />
        <div style={{ display: 'grid', gap: 8 }}>
          {chats.map((c) => (
            <button
              key={c.name}
              type="button"
              className="card"
              style={{
                padding: 12,
                textAlign: 'left',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="story" style={{ width: 42, height: 42 }}><div /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{c.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last}</div>
                  </div>
                </div>
                <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 12 }}>{c.time}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)', minHeight: 520 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: 'var(--primary-strong)' }}>Tus mensajes</div>
          <div>Envía mensajes a tus amigos y responde a tus comisionistas.</div>
        </div>
      </div>
    </div>
  )
}

export default Messages
