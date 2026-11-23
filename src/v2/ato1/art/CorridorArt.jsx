import Daughter from './Daughter.jsx'

// Corredor em perspectiva de um ponto. Ponto de fuga (VX, VY); parede do fundo em k = KB.
const VX = 500, VY = 415, KB = 0.18
const r = n => Math.round(n * 10) / 10
const floorY = k => VY + (1000 - VY) * k
const wall = (side, k, h) => [r(VX + side * 500 * k), r(floorY(k) - h * 1000 * k)]
const ceil = (u, k) => [r(VX + u * 500 * k), r(VY - VY * k)]
const flo = (u, k) => [r(VX + u * 500 * k), r(floorY(k))]
const pts = list => list.map(p => p.join(',')).join(' ')

// Portas nas duas paredes (profundidades em z; k = 1/z).
const DOORS = [
  [1.12, 1.5], [1.95, 2.25], [2.85, 3.05], [3.7, 3.84],
]
function door(side, [z1, z2], h = 0.6) {
  const k1 = 1 / z1, k2 = 1 / z2
  return {
    frame: pts([wall(side, k1, 0), wall(side, k1, h + 0.03), wall(side, k2, h + 0.03), wall(side, k2, 0)]),
    leaf: pts([wall(side, k1 * 0.985 + k2 * 0.015, 0), wall(side, k1 * 0.985 + k2 * 0.015, h), wall(side, k2 * 1.02, h), wall(side, k2 * 1.02, 0)]),
    pane: pts([wall(side, k1 * 0.8 + k2 * 0.2, h * 0.62), wall(side, k1 * 0.8 + k2 * 0.2, h * 0.88), wall(side, k1 * 0.45 + k2 * 0.55, h * 0.88), wall(side, k1 * 0.45 + k2 * 0.55, h * 0.62)]),
    handle: wall(side, k1 * 0.3 + k2 * 0.7, h * 0.48),
    hk: (k1 + k2) / 2,
  }
}

// Luminárias no teto e seus reflexos no piso.
const LIGHTS = [[1.25, 1.6], [2.2, 2.5], [3.15, 3.4], [4.1, 4.3], [5, 5.15]]
const light = ([z1, z2], fn) => pts([fn(-0.2, 1 / z1), fn(0.2, 1 / z1), fn(0.2, 1 / z2), fn(-0.2, 1 / z2)])

export default function CorridorArt() {
  const backTL = wall(-1, KB, 1), backBR = wall(1, KB, 0)
  return (
    <svg className="corridor-art" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crFloor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#1c3650" />
          <stop offset="1" stopColor="#3b5a74" />
        </linearGradient>
        <linearGradient id="crCeil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a4560" />
          <stop offset="1" stopColor="#5b7891" />
        </linearGradient>
        <linearGradient id="crWallL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#24425e" />
          <stop offset="1" stopColor="#6d8ba3" />
        </linearGradient>
        <linearGradient id="crWallR" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#21405b" />
          <stop offset="1" stopColor="#67859d" />
        </linearGradient>
        <radialGradient id="crExit" cx="50%" cy="60%" r="60%">
          <stop offset="0" stopColor="#f4fbfc" />
          <stop offset="1" stopColor="#b9d6e0" />
        </radialGradient>
        <radialGradient id="crBloom" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#dff4fb" stopOpacity=".55" />
          <stop offset="1" stopColor="#dff4fb" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="phoneGlow" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="#9fe6ff" stopOpacity=".5" />
          <stop offset="1" stopColor="#9fe6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#071d35" stopOpacity="0" />
          <stop offset="1" stopColor="#071d35" stopOpacity=".55" />
        </linearGradient>
      </defs>

      <g className="corridor-art__room">
        {/* teto, piso, paredes */}
        <polygon points={pts([[0, 0], [1000, 0], ceil(1, KB), ceil(-1, KB)])} fill="url(#crCeil)" />
        <polygon points={pts([[0, 1000], [1000, 1000], flo(1, KB), flo(-1, KB)])} fill="url(#crFloor)" />
        <polygon points={pts([[0, 0], ceil(-1, KB), flo(-1, KB), [0, 1000]])} fill="url(#crWallL)" />
        <polygon points={pts([[1000, 0], ceil(1, KB), flo(1, KB), [1000, 1000]])} fill="url(#crWallR)" />

        {/* rodapé lavável (faixa inferior das paredes) */}
        <polygon points={pts([wall(-1, 1.4, 0), wall(-1, 1.4, 0.12), wall(-1, KB, 0.12), wall(-1, KB, 0)])} fill="#1b3854" opacity=".75" />
        <polygon points={pts([wall(1, 1.4, 0), wall(1, 1.4, 0.12), wall(1, KB, 0.12), wall(1, KB, 0)])} fill="#1b3854" opacity=".75" />

        {/* parede do fundo + porta iluminada (a saída) */}
        <rect x={backTL[0]} y={backTL[1]} width={backBR[0] - backTL[0]} height={backBR[1] - backTL[1]} fill="#86a3b7" />
        <rect x={VX - 46} y={floorY(KB) - 128} width="92" height="128" fill="url(#crExit)" />
        <line x1={VX} y1={floorY(KB) - 128} x2={VX} y2={floorY(KB)} stroke="#9bb9c6" strokeWidth="2" />
        <circle cx={VX} cy={floorY(KB) - 60} r="120" fill="url(#crBloom)" />
        {/* placa de saída (pictograma, sem texto) */}
        <rect x={VX - 20} y={floorY(KB) - 152} width="40" height="16" rx="3" fill="#2f9e6f" />
        <path d={`M${VX - 10} ${floorY(KB) - 144} h14 m-5 -4 l5 4 -5 4`} stroke="#e8fff4" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* portas laterais */}
        {DOORS.map((z, i) => [-1, 1].map(side => {
          const d = door(side, z)
          return (
            <g key={`${i}${side}`} opacity={1 - i * 0.12}>
              <polygon points={d.frame} fill="#1d3a55" />
              <polygon points={d.leaf} fill={side < 0 ? '#4a7393' : '#45708f'} />
              <polygon points={d.pane} fill="#a9c9d8" opacity=".55" />
              <circle cx={d.handle[0]} cy={d.handle[1]} r={Math.max(1.5, 7 * d.hk)} fill="#d7e4ea" />
            </g>
          )
        }))}

        {/* corrimãos */}
        <polyline points={pts([wall(-1, 1.4, 0.34), wall(-1, KB, 0.34)])} stroke="#c7d6df" strokeWidth="6" strokeLinecap="round" opacity=".7" fill="none" />
        <polyline points={pts([wall(1, 1.4, 0.34), wall(1, KB, 0.34)])} stroke="#c7d6df" strokeWidth="6" strokeLinecap="round" opacity=".7" fill="none" />

        {/* luminárias frias e reflexos no piso */}
        {LIGHTS.map((z, i) => (
          <g key={i}>
            <polygon className={`corridor-art__light${i === 1 ? ' is-flicker' : ''}`} points={light(z, ceil)} fill="#e9f8fc" />
            <polygon points={light(z, flo)} fill="#cfeaf3" opacity={0.14 - i * 0.02} />
          </g>
        ))}
        <ellipse cx={VX} cy="40" rx="260" ry="90" fill="url(#crBloom)" opacity=".7" />

        {/* banco de espera na parede direita */}
        <polygon points={pts([wall(1, 0.72, 0.22), wall(1, 0.72, 0.26), wall(1, 0.5, 0.26), wall(1, 0.5, 0.22)])} fill="#1a3550" />
        <polygon points={pts([wall(1, 0.72, 0.26), wall(1, 0.72, 0.4), wall(1, 0.5, 0.4), wall(1, 0.5, 0.26)])} fill="#28506f" opacity=".6" />
      </g>

      <rect width="1000" height="1000" fill="url(#crShade)" />
      <g className="corridor-art__daughter-wrap">
        <Daughter x={500} y={948} scale={0.96} />
      </g>
    </svg>
  )
}
