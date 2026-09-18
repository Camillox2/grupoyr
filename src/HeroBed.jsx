import { useEffect, useRef, useState } from 'react'

/**
 * Hero da home: a cama hospitalar em vetor, articulando de verdade.
 *
 * A ilustracao nao e enfeite: ela demonstra o produto. Os tres movimentos
 * (encosto, pernas, altura) sao os mesmos do equipamento real, e o visitante
 * mexe neles pelo controle ao lado. Ate alguem tocar, a cama roda sozinha em
 * demonstracao.
 *
 * As transformacoes vao como atributo SVG `rotate(angulo cx cy)`, calculadas
 * aqui, e nao por CSS transform-origin: em SVG o atributo se comporta igual
 * em todo navegador, e o eixo de giro (quadril, joelho) precisa ser exato.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const span = (t, from, to) => ease(clamp01((t - from) / (to - from)))

/** Roteiro da demonstracao: devolve {back, legs, lift} (0..1) para t em 0..1. */
function demoPose(t) {
  const up = (a, b) => span(t, a, b)
  const down = span(t, 0.8, 0.95)
  return {
    back: up(0.04, 0.22) * (1 - down),
    legs: up(0.3, 0.44) * (1 - down),
    lift: up(0.52, 0.68) * (1 - down),
  }
}

const DEMO_MS = 9000
// Pose inicial: e o que aparece no HTML pre-renderizado e sem JavaScript.
const REST = { back: 0.62, legs: 0.3, lift: 0.35 }

function Bed({ back, legs, lift }) {
  const backDeg = back * 62
  const legsDeg = legs * 30
  const rise = lift * 58
  const py = 300 - rise // topo do estrado

  return (
    <svg className="herobed-svg" viewBox="78 40 484 372" role="img" aria-label="Ilustração de cama hospitalar com encosto, pernas e altura ajustáveis">
      {/* sombra no piso encolhe quando a cama sobe */}
      <ellipse cx="320" cy="396" rx={236 - rise * 0.5} ry="9" fill="#102a4c" opacity={0.1 - lift * 0.03} />

      {/* base com rodizios */}
      <rect x="150" y="346" width="340" height="12" rx="6" fill="#102a4c" />
      {[176, 464].map((cx) => (
        <g key={cx}>
          <rect x={cx - 4} y="356" width="8" height="10" fill="#102a4c" />
          <circle cx={cx} cy="378" r="13" fill="#102a4c" />
          <circle cx={cx} cy="378" r="5" fill="#dce9f8" />
        </g>
      ))}

      {/* elevacao em tesoura */}
      <g stroke="#8fa6c4" strokeWidth="9" strokeLinecap="round">
        <line x1="206" y1="346" x2="434" y2={py + 16} />
        <line x1="434" y1="346" x2="206" y2={py + 16} />
      </g>
      <circle cx="320" cy={(346 + py + 16) / 2} r="7" fill="#102a4c" />

      {/* estrado */}
      <rect x="118" y={py + 8} width="404" height="10" rx="5" fill="#5d7696" />

      {/* cabeceira e peseira, presas ao estrado */}
      <rect x="100" y={py - 84} width="18" height="104" rx="9" fill="#ffffff" stroke="#c4d3e6" strokeWidth="3" />
      <rect x="522" y={py - 54} width="18" height="74" rx="9" fill="#ffffff" stroke="#c4d3e6" strokeWidth="3" />

      {/* assento (fixo) */}
      <rect x="292" y={py - 28} width="80" height="28" fill="#1d5fae" />
      <rect x="292" y={py} width="80" height="7" fill="#c4d3e6" />

      {/* pernas: coxa sobe girando no quadril, panturrilha compensa no joelho */}
      <g transform={`rotate(${-legsDeg} 373 ${py})`}>
        <rect x="374" y={py - 28} width="72" height="28" fill="#2b74c9" />
        <rect x="374" y={py} width="72" height="7" fill="#c4d3e6" />
        <g transform={`rotate(${legsDeg * 0.9} 447 ${py})`}>
          <rect x="448" y={py - 28} width="72" height="28" rx="0" fill="#1d5fae" />
          <path d={`M506 ${py - 28} h4 a10 10 0 0 1 10 10 v18 h-14 z`} fill="#1d5fae" />
          <rect x="448" y={py} width="72" height="7" fill="#c4d3e6" />
        </g>
      </g>

      {/* encosto: gira no quadril, leva travesseiro e grade junto */}
      <g transform={`rotate(${backDeg} 291 ${py})`}>
        <rect x="124" y={py} width="166" height="7" fill="#c4d3e6" />
        <path d={`M134 ${py - 28} h156 v28 h-166 v-18 a10 10 0 0 1 10 -10 z`} fill="#2b74c9" />
        <rect x="136" y={py - 46} width="78" height="22" rx="11" fill="#ffffff" stroke="#c4d3e6" strokeWidth="3" />
        <g fill="none" stroke="#8fa6c4" strokeWidth="6" strokeLinecap="round">
          <rect x="178" y={py - 78} width="100" height="40" rx="12" />
          <line x1="212" y1={py - 78} x2="212" y2={py - 38} />
          <line x1="244" y1={py - 78} x2="244" y2={py - 38} />
        </g>
      </g>
    </svg>
  )
}

function Slider({ label, hint, value, onChange, icon }) {
  return (
    <label className="herobed-slider">
      <span className="herobed-slider-icon" aria-hidden="true">{icon}</span>
      <span className="herobed-slider-copy">
        <strong>{label}</strong>
        <em>{hint}</em>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={label}
        style={{ '--fill': `${Math.round(value * 100)}%` }}
      />
    </label>
  )
}

const ICONS = {
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18M12 18 5 8" />
    </svg>
  ),
  legs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h9l4-6 5 2" />
    </svg>
  ),
  lift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h16M12 21v-8M8.5 16.5 12 13l3.5 3.5M4 5h16" />
    </svg>
  ),
}

export default function HeroBed({ onContact }) {
  const [pose, setPose] = useState(REST)
  const [auto, setAuto] = useState(true)
  const rootRef = useRef(null)

  // Demonstracao automatica: roda so com o hero na tela e so ate alguem tocar.
  useEffect(() => {
    if (!auto) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    let frame = 0
    let visible = true
    const started = performance.now()

    const tick = (now) => {
      if (visible) setPose(demoPose(((now - started) % DEMO_MS) / DEMO_MS))
      frame = requestAnimationFrame(tick)
    }

    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
          })
        : null
    if (observer && rootRef.current) observer.observe(rootRef.current)

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [auto])

  const drive = (key) => (value) => {
    setAuto(false)
    setPose((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="herobed" id="inicio" ref={rootRef}>
      <div className="herobed-inner">
        <div className="herobed-copy">
          <p className="herobed-eyebrow">
            <span className="herobed-dot" aria-hidden="true" />
            Locação e venda · Curitiba e região
          </p>

          <h1>
            Cama hospitalar em casa,{' '}
            <span className="herobed-mark">
              entregue e montada.
              <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 9 C 60 2, 120 13, 180 6 S 270 4, 297 8" />
              </svg>
            </span>
          </h1>

          <p className="herobed-lede">
            Alugue ou compre cama hospitalar, colchão pneumático e cadeira de banho. A equipe leva,
            monta no quarto e explica o uso. A cotação é feita pelo WhatsApp.
          </p>

          <div className="herobed-actions">
            <button className="yr3-button herobed-cta" onClick={() => onContact?.('Orientação')}>
              Pedir cotação <span aria-hidden="true">→</span>
            </button>
            <a className="yr3-button yr3-button--soft" href="#produtos">
              Ver equipamentos
            </a>
          </div>

          <ul className="herobed-proof">
            <li>Entrega e montagem</li>
            <li>Compra ou locação</li>
            <li>Retirada no fim do uso</li>
          </ul>
        </div>

        <div className="herobed-play">
          <div className="herobed-scene">
            <span className="herobed-plus herobed-plus--a" aria-hidden="true" />
            <span className="herobed-plus herobed-plus--b" aria-hidden="true" />
            <span className="herobed-plus herobed-plus--c" aria-hidden="true" />
            <Bed {...pose} />
          </div>

          <div className="herobed-remote">
            <div className="herobed-remote-head">
              <strong>Mexa na cama</strong>
              <button type="button" onClick={() => setAuto((value) => !value)} aria-pressed={auto}>
                {auto ? 'Pausar' : 'Demonstração'}
              </button>
            </div>
            <Slider label="Encosto" hint="para comer, ler, respirar melhor" value={pose.back} onChange={drive('back')} icon={ICONS.back} />
            <Slider label="Pernas" hint="alivia a lombar e o inchaço" value={pose.legs} onChange={drive('legs')} icon={ICONS.legs} />
            <Slider label="Altura" hint="poupa a coluna de quem cuida" value={pose.lift} onChange={drive('lift')} icon={ICONS.lift} />
            <p className="herobed-note">Ilustração. Os movimentos variam conforme o modelo cotado.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
