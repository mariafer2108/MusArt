import { useMemo, useRef, useState } from 'react'

function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 12a4.5 4.5 0 0 0-2.07-3.79l1.02-1.72A6.5 6.5 0 0 1 18.5 12c0 2.2-1.1 4.16-2.78 5.34l-1.02-1.72A4.5 4.5 0 0 0 16.5 12Zm3.5 0c0 3.1-1.55 5.83-3.93 7.47l-1.02-1.72A7.99 7.99 0 0 0 18 12a8 8 0 0 0-2.95-5.74l1.02-1.72A9.98 9.98 0 0 1 20 12ZM3 10v4h4l5 4V6L7 10H3Zm18.71-3.29-1.42-1.42L3.29 22.29l1.42 1.42 17-17Z"
      />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 12a4.5 4.5 0 0 0-2.07-3.79l1.02-1.72A6.5 6.5 0 0 1 18.5 12c0 2.2-1.1 4.16-2.78 5.34l-1.02-1.72A4.5 4.5 0 0 0 16.5 12Zm3.5 0c0 3.1-1.55 5.83-3.93 7.47l-1.02-1.72A7.99 7.99 0 0 0 18 12a8 8 0 0 0-2.95-5.74l1.02-1.72A9.98 9.98 0 0 1 20 12ZM3 10v4h4l5 4V6L7 10H3Z"
      />
    </svg>
  )
}

export default function AutoVideo({
  src,
  fit = 'cover',
  className
}: {
  src: string
  fit?: 'cover' | 'contain'
  className?: string
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)

  const style = useMemo(() => ({ objectFit: fit as 'cover' | 'contain' }), [fit])

  return (
    <div className={`video-wrap${className ? ` ${className}` : ''}`}>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        style={style}
        onClick={() => {
          const v = ref.current
          if (!v) return
          if (v.paused) v.play().catch(() => null)
          else v.pause()
        }}
      />
      <button
        type="button"
        className="video-sound"
        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
        onClick={(e) => {
          e.stopPropagation()
          setMuted((m) => {
            const next = !m
            const v = ref.current
            if (v) {
              v.muted = next
              if (v.paused) v.play().catch(() => null)
            }
            return next
          })
        }}
      >
        {muted ? <MuteIcon /> : <SoundIcon />}
      </button>
    </div>
  )
}

