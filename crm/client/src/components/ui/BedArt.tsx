import React, { useEffect, useState } from 'react'

/**
 * A cama hospitalar em vetor, a mesma do hero do site, articulando sozinha.
 *
 * Os giros vao como atributo SVG `rotate(angulo cx cy)`: o eixo (quadril,
 * joelho) precisa ser exato e o atributo se comporta igual em todo navegador.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const span = (t: number, from: number, to: number) => ease(clamp01((t - from) / (to - from)))

function demoPose(t: number) {
  const down = span(t, 0.8, 0.95)
  return {
    back: span(t, 0.04, 0.22) * (1 - down),
    legs: span(t, 0.3, 0.44) * (1 - down),
    lift: span(t, 0.52, 0.68) * (1 - down),
  }
}

const DEMO_MS = 9000
const REST = { back: 0.6, legs: 0.3, lift: 0.3 }

export const BedArt: React.FC<{ className?: string }> = ({ className }) => {
  const [pose, setPose] = useState(REST)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      setPose(demoPose(((now - started) % DEMO_MS) / DEMO_MS))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const backDeg = pose.back * 62
  const legsDeg = pose.legs * 30
  const rise = pose.lift * 58
  const py = 300 - rise

  // Tons claros: a arte vive sobre o painel azul-marinho do login.
  const frame = '#c4d3e6'
  const metal = '#8fb8e8'
  const base = '#dce9f8'

  return (
    <svg className={className} viewBox="78 40 484 372" role="img" aria-label="Ilustração de cama hospitalar articulando encosto, pernas e altura">
      <ellipse cx="320" cy="396" rx={236 - rise * 0.5} ry="9" fill="#000" opacity={0.22 - pose.lift * 0.06} />

      <rect x="150" y="346" width="340" height="12" rx="6" fill={base} />
      {[176, 464].map((cx) => (
        <g key={cx}>
          <rect x={cx - 4} y="356" width="8" height="10" fill={base} />
          <circle cx={cx} cy="378" r="13" fill={base} />
          <circle cx={cx} cy="378" r="5" fill="#102a4c" />
        </g>
      ))}

      <g stroke={metal} strokeWidth="9" strokeLinecap="round">
        <line x1="206" y1="346" x2="434" y2={py + 16} />
        <line x1="434" y1="346" x2="206" y2={py + 16} />
      </g>
      <circle cx="320" cy={(346 + py + 16) / 2} r="7" fill={base} />

      <rect x="118" y={py + 8} width="404" height="10" rx="5" fill={metal} />
      <rect x="100" y={py - 84} width="18" height="104" rx="9" fill="#fffdf9" />
      <rect x="522" y={py - 54} width="18" height="74" rx="9" fill="#fffdf9" />

      <rect x="292" y={py - 28} width="80" height="28" fill="#2b74c9" />
      <rect x="292" y={py} width="80" height="7" fill={frame} />

      <g transform={`rotate(${-legsDeg} 373 ${py})`}>
        <rect x="374" y={py - 28} width="72" height="28" fill="#4f93e0" />
        <rect x="374" y={py} width="72" height="7" fill={frame} />
        <g transform={`rotate(${legsDeg * 0.9} 447 ${py})`}>
          <rect x="448" y={py - 28} width="72" height="28" fill="#2b74c9" />
          <path d={`M506 ${py - 28} h4 a10 10 0 0 1 10 10 v18 h-14 z`} fill="#2b74c9" />
          <rect x="448" y={py} width="72" height="7" fill={frame} />
        </g>
      </g>

      <g transform={`rotate(${backDeg} 291 ${py})`}>
        <rect x="124" y={py} width="166" height="7" fill={frame} />
        <path d={`M134 ${py - 28} h156 v28 h-166 v-18 a10 10 0 0 1 10 -10 z`} fill="#4f93e0" />
        <rect x="136" y={py - 46} width="78" height="22" rx="11" fill="#fffdf9" />
        <g fill="none" stroke={metal} strokeWidth="6" strokeLinecap="round">
          <rect x="178" y={py - 78} width="100" height="40" rx="12" />
          <line x1="212" y1={py - 78} x2="212" y2={py - 38} />
          <line x1="244" y1={py - 78} x2="244" y2={py - 38} />
        </g>
      </g>
    </svg>
  )
}
