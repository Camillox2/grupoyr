import { useEffect, useRef, useState } from 'react'
import { products, productPath, modalityLabel } from './catalog.js'

/**
 * Pecas de motion graphics da home, todas em SVG/CSS feitos a mao.
 *
 * Regra da casa: a animacao sempre EXPLICA alguma coisa (como o colchao
 * alterna a pressao, para que lado a decisao pende, em que etapa da entrega
 * voce esta). Nada aqui e enfeite solto.
 *
 * O que e preso ao scroll escreve variaveis CSS direto no elemento, dentro de
 * requestAnimationFrame, sem re-render do React a cada quadro.
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value))
const bySlug = (slug) => products.find((product) => product.slug === slug)

/**
 * Progresso 0..1 de uma secao atravessando a tela.
 * 0 quando o topo dela chega em `start` (fracao da altura da janela),
 * 1 quando a base dela chega em `end`.
 */
function useScrollProgress(ref, apply, { start = 0.9, end = 0.35 } = {}) {
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let frame = 0

    const update = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const height = window.innerHeight
      const from = height * start
      const to = height * end - box.height
      applyRef.current(clamp01((from - box.top) / (from - to)), element)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, start, end])
}

/* ==========================================================================
   1. Faixa cinetica
   ========================================================================== */
const BAND_A = ['Locação', 'Compra', 'Camas', 'Colchão pneumático', 'Cadeira de banho']
const BAND_B = ['Curitiba e região', 'Orientação', 'Cotação pelo WhatsApp', 'Cuidado em casa']

function BandRow({ words, outline }) {
  // Conteudo repetido para a faixa nunca mostrar a ponta ao deslizar.
  const loop = [...words, ...words, ...words, ...words]
  return (
    <div className={`kband-row ${outline ? 'kband-row--outline' : ''}`} aria-hidden="true">
      {loop.map((word, index) => (
        <span key={index}>
          {word}
          <i />
        </span>
      ))}
    </div>
  )
}

export function KineticBand() {
  const ref = useRef(null)
  useScrollProgress(ref, (t, element) => element.style.setProperty('--k', t.toFixed(4)), {
    start: 1,
    end: 0,
  })
  return (
    <div className="kband" ref={ref}>
      <BandRow words={BAND_A} />
      <BandRow words={BAND_B} outline />
    </div>
  )
}

/* ==========================================================================
   2. Como cada peca funciona (tres loops vetoriais)
   ========================================================================== */
function CrankBedArt() {
  return (
    <svg viewBox="0 40 320 170" preserveAspectRatio="xMidYMax meet" className="mg mg-crank" role="img" aria-label="Animação: a manivela gira e o encosto da cama sobe">
      <ellipse cx="160" cy="192" rx="120" ry="6" fill="#102a4c" opacity=".08" />
      {/* pes e base */}
      <g stroke="#102a4c" strokeWidth="7" strokeLinecap="round">
        <line x1="70" y1="156" x2="70" y2="184" />
        <line x1="252" y1="156" x2="252" y2="184" />
      </g>
      <circle cx="70" cy="186" r="7" fill="#102a4c" />
      <circle cx="252" cy="186" r="7" fill="#102a4c" />
      <rect x="52" y="150" width="218" height="8" rx="4" fill="#5d7696" />
      {/* cabeceira e peseira */}
      <rect x="40" y="96" width="12" height="64" rx="6" fill="#fff" stroke="#c4d3e6" strokeWidth="2.5" />
      <rect x="270" y="116" width="12" height="44" rx="6" fill="#fff" stroke="#c4d3e6" strokeWidth="2.5" />
      {/* colchao: assento e pernas parados */}
      <rect x="150" y="130" width="118" height="20" rx="3" fill="#1d5fae" />
      {/* encosto que sobe */}
      <g className="mg-crank-back">
        <path d="M66 130 h84 v20 h-92 v-12 a8 8 0 0 1 8 -8 z" fill="#2b74c9" />
        <rect x="64" y="117" width="44" height="15" rx="7.5" fill="#fff" stroke="#c4d3e6" strokeWidth="2.5" />
      </g>
      {/* manivela na peseira */}
      <line x1="262" y1="158" x2="296" y2="158" stroke="#8fa6c4" strokeWidth="5" strokeLinecap="round" />
      <g className="mg-crank-handle">
        <line x1="296" y1="158" x2="296" y2="178" stroke="#102a4c" strokeWidth="5" strokeLinecap="round" />
        <circle cx="296" cy="180" r="6" fill="#1d5fae" />
      </g>
      <circle cx="296" cy="158" r="5" fill="#102a4c" />
    </svg>
  )
}

function MattressArt() {
  return (
    <svg viewBox="0 40 320 170" preserveAspectRatio="xMidYMax meet" className="mg mg-air" role="img" aria-label="Animação: as células do colchão inflam e esvaziam em alternância">
      <ellipse cx="150" cy="192" rx="128" ry="6" fill="#102a4c" opacity=".08" />
      {/* colchao de base */}
      <rect x="26" y="136" width="248" height="30" rx="10" fill="#dce9f8" stroke="#c4d3e6" strokeWidth="2.5" />
      {/* celulas: pares e impares alternam */}
      {Array.from({ length: 9 }).map((_, index) => (
        <rect
          key={index}
          className={index % 2 ? 'mg-cell mg-cell--b' : 'mg-cell'}
          x={34 + index * 26}
          y="102"
          width="22"
          height="36"
          rx="11"
          fill={index % 2 ? '#2b74c9' : '#1d5fae'}
        />
      ))}
      {/* tubo com o ar correndo */}
      <path d="M274 152 C 296 152, 300 166, 292 176" fill="none" stroke="#c4d3e6" strokeWidth="6" strokeLinecap="round" />
      <path className="mg-air-flow" d="M274 152 C 296 152, 300 166, 292 176" fill="none" stroke="#1d5fae" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 8" />
      {/* compressor */}
      <rect x="262" y="174" width="50" height="26" rx="7" fill="#fff" stroke="#c4d3e6" strokeWidth="2.5" />
      <circle cx="278" cy="187" r="7" fill="#dce9f8" />
      <line className="mg-air-needle" x1="278" y1="187" x2="278" y2="181" stroke="#102a4c" strokeWidth="2" strokeLinecap="round" />
      <circle className="mg-air-led" cx="300" cy="187" r="3" fill="#1fa971" />
    </svg>
  )
}

function ShowerChairArt() {
  return (
    <svg viewBox="0 22 320 170" preserveAspectRatio="xMidYMax meet" className="mg mg-shower" role="img" aria-label="Animação: a cadeira de banho rola até debaixo do chuveiro">
      {/* piso e ralo */}
      <rect x="0" y="186" width="320" height="6" fill="#c4d3e6" />
      {/* box */}
      <rect x="196" y="30" width="4" height="156" fill="#c4d3e6" />
      <rect x="196" y="30" width="112" height="4" fill="#c4d3e6" />
      {/* chuveiro */}
      <path d="M296 34 v18 h-30 v8" fill="none" stroke="#8fa6c4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M250 62 h32 l-4 8 h-24 z" fill="#8fa6c4" />
      <g className="mg-drops" stroke="#2b74c9" strokeWidth="3" strokeLinecap="round">
        <line x1="256" y1="78" x2="256" y2="88" />
        <line x1="266" y1="78" x2="266" y2="88" />
        <line x1="276" y1="78" x2="276" y2="88" />
      </g>
      {/* cadeira */}
      <g className="mg-chair">
        <g fill="none" stroke="#8fa6c4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-24 -96 v86" />
          <path d="M26 -50 v40" />
          <path d="M-24 -50 h52" />
          <path d="M-24 -70 h42" />
        </g>
        <rect x="-10" y="-76" width="34" height="9" rx="4.5" fill="#102a4c" />
        <rect x="-30" y="-56" width="62" height="10" rx="5" fill="#1d5fae" />
        <g className="mg-wheel" style={{ transformOrigin: '-24px 0px' }}>
          <circle cx="-24" cy="0" r="9" fill="#102a4c" />
          <line x1="-24" y1="-6" x2="-24" y2="6" stroke="#dce9f8" strokeWidth="2" />
        </g>
        <g className="mg-wheel" style={{ transformOrigin: '26px 0px' }}>
          <circle cx="26" cy="0" r="9" fill="#102a4c" />
          <line x1="26" y1="-6" x2="26" y2="6" stroke="#dce9f8" strokeWidth="2" />
        </g>
      </g>
    </svg>
  )
}

const BENTO = [
  {
    slug: 'cama-manual-3-movimentos',
    Art: CrankBedArt,
    title: 'Gira a manivela, o encosto sobe.',
    text: 'Na cama manual cada movimento tem a sua manivela, na peseira. Sem tomada, sem bateria.',
  },
  {
    slug: 'colchao-pneumatico',
    Art: MattressArt,
    title: 'O apoio do corpo se alterna.',
    text: 'O compressor enche e esvazia as células em ciclo, variando os pontos de pressão ao longo do dia.',
  },
  {
    slug: 'cadeira-de-banho',
    Art: ShowerChairArt,
    title: 'Do quarto ao chuveiro, sentado.',
    text: 'Rodízios com trava levam a pessoa até o box. O mesmo assento encaixa sobre o vaso.',
  },
]

export function MotionBento() {
  const ref = useRef(null)
  const [live, setLive] = useState(false)

  // Os loops so rodam com a secao na tela: fora dela ficam pausados.
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) {
      setLive(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), {
      rootMargin: '80px',
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section className={`bento yr3-section ${live ? 'is-live' : ''}`} id="como-funciona-cada-peca" ref={ref}>
      <div className="yr3-width">
        <div className="bento-head">
          <p className="yr3-eyebrow">POR DENTRO DE CADA PEÇA</p>
          <h2>
            Como cada uma
            <br />
            trabalha por você.
          </h2>
        </div>
        <div className="bento-grid">
          {BENTO.map(({ slug, Art, title, text }) => {
            const product = bySlug(slug)
            if (!product) return null
            return (
              <a className="bento-card" key={slug} href={productPath(product)}>
                <div className="bento-art">
                  <Art />
                </div>
                <div className="bento-copy">
                  <span>
                    {product.short} · {modalityLabel(product)}
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <em>
                    Ver {product.short.toLowerCase()} <i aria-hidden="true">↗</i>
                  </em>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   3. Balanca do "comprar ou alugar"
   ========================================================================== */
export function DecisionScale({ lean }) {
  // lean: 'Alugar' | 'Comprar' | qualquer outra coisa (equilibrio)
  const angle = lean === 'Alugar' ? -11 : lean === 'Comprar' ? 11 : 0
  const pivot = { transformBox: 'view-box' }
  return (
    <svg viewBox="0 0 300 150" className="dscale" role="img" aria-label={`Balança: ${lean === 'Alugar' ? 'pende para a locação' : lean === 'Comprar' ? 'pende para a compra' : 'em equilíbrio'}`}>
      <rect x="146" y="40" width="8" height="84" rx="4" fill="#8fa6c4" />
      <rect x="104" y="122" width="92" height="10" rx="5" fill="#102a4c" />
      <g className="dscale-beam" style={{ ...pivot, transformOrigin: '150px 42px', transform: `rotate(${angle}deg)` }}>
        <rect x="52" y="38" width="196" height="8" rx="4" fill="#102a4c" />
        {[
          ['Alugar', 60],
          ['Comprar', 240],
        ].map(([name, x]) => (
          <g key={name} className="dscale-pan" style={{ ...pivot, transformOrigin: `${x}px 42px`, transform: `rotate(${-angle}deg)` }}>
            <path d={`M${x} 42 L${x - 26} 88 M${x} 42 L${x + 26} 88`} stroke="#8fa6c4" strokeWidth="2.5" fill="none" />
            <path d={`M${x - 32} 88 h64 a32 14 0 0 1 -64 0 z`} fill={lean === name ? '#1d5fae' : '#c4d3e6'} className="dscale-bowl" />
            <rect className="dscale-weight" x={x - 11} y="68" width="22" height="20" rx="5" fill="#102a4c" opacity={lean === name ? 1 : 0} />
            <text x={x} y="122" textAnchor="middle" className={lean === name ? 'is-on' : ''}>
              {name}
            </text>
          </g>
        ))}
      </g>
      <circle cx="150" cy="42" r="7" fill="#1d5fae" />
    </svg>
  )
}

/* ==========================================================================
   4. Como funciona: a van percorre a estrada conforme a rolagem
   ========================================================================== */
const ROAD = 'M -30 196 C 110 196, 170 96, 310 100 S 500 214, 640 190 S 850 70, 980 96 S 1130 190, 1240 160'
const STOPS = [
  { at: 0.13, n: '01', title: 'Você chama no WhatsApp', text: 'Conta quem vai usar, por quanto tempo e como é o acesso até o quarto.' },
  { at: 0.38, n: '02', title: 'Recebe a cotação', text: 'Compra e locação lado a lado, com modelo e condições confirmados.' },
  { at: 0.63, n: '03', title: 'Combinamos a entrega', text: 'Data, horário, escada ou elevador: a logística é acertada antes.' },
  { at: 0.88, n: '04', title: 'O quarto fica pronto', text: 'O equipamento chega, é instalado e a equipe explica o uso.' },
]

export function JourneyRoad() {
  const ref = useRef(null)
  const pathRef = useRef(null)
  const vanRef = useRef(null)
  const doneRef = useRef(null)

  // Pinos das paradas: posicionados a partir do proprio tracado.
  useEffect(() => {
    const path = pathRef.current
    const root = ref.current
    if (!path || !root) return
    const total = path.getTotalLength()
    root.querySelectorAll('[data-pin]').forEach((pin) => {
      const point = path.getPointAtLength(total * Number(pin.dataset.pin))
      pin.setAttribute('transform', `translate(${point.x} ${point.y})`)
    })
    root.classList.add('is-ready')
  }, [])

  useScrollProgress(
    ref,
    (t, root) => {
      root.style.setProperty('--t', t.toFixed(4))
      root.querySelectorAll('[data-stop]').forEach((node) => {
        node.classList.toggle('is-on', t >= Number(node.dataset.stop) - 0.015)
      })

      const path = pathRef.current
      const van = vanRef.current
      if (!path || !van) return
      const total = path.getTotalLength()
      const length = total * t
      const here = path.getPointAtLength(length)
      const ahead = path.getPointAtLength(Math.min(total, length + 2))
      const angle = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI
      van.setAttribute('transform', `translate(${here.x} ${here.y}) rotate(${angle}) translate(0 -19)`)
      van.style.setProperty('--spin', `${(length / (2 * Math.PI * 9)) * 360}deg`)
      if (doneRef.current) doneRef.current.style.strokeDashoffset = String(total * (1 - t))
      if (doneRef.current && !doneRef.current.style.strokeDasharray) doneRef.current.style.strokeDasharray = String(total)
    },
    { start: 0.8, end: 0.55 },
  )

  return (
    <div className="jroad" ref={ref}>
      <svg className="jroad-svg" viewBox="0 0 1200 270" aria-hidden="true">
        <path d={ROAD} className="jroad-bed" />
        <path d={ROAD} className="jroad-done" ref={doneRef} />
        <path d={ROAD} className="jroad-dash" ref={pathRef} />
        {STOPS.map((stop) => (
          <g key={stop.n} data-pin={stop.at} data-stop={stop.at} className="jroad-pin">
            <circle r="17" />
            <text y="5" textAnchor="middle">
              {stop.n}
            </text>
          </g>
        ))}
        <g ref={vanRef} className="jroad-van" transform="translate(-30 196) translate(0 -19)">
          <g transform="scale(1.25)">
            <rect x="-34" y="-34" width="46" height="30" rx="5" fill="#1d5fae" />
            <path d="M12 -26 h14 l10 12 v10 h-24 z" fill="#2b74c9" />
            <path d="M16 -22 h8 l7 9 h-15 z" fill="#dce9f8" />
            <rect x="-28" y="-27" width="14" height="4" rx="2" fill="#fff" opacity=".85" />
            <rect x="-22" y="-32" width="4" height="14" rx="2" fill="#fff" opacity=".85" />
            {[-20, 22].map((cx) => (
              <g key={cx} className="jroad-wheel" style={{ transformOrigin: `${cx}px 0px` }}>
                <circle cx={cx} cy="0" r="9" fill="#102a4c" />
                <line x1={cx} y1="-6" x2={cx} y2="6" stroke="#dce9f8" strokeWidth="2.2" />
                <line x1={cx - 6} y1="0" x2={cx + 6} y2="0" stroke="#dce9f8" strokeWidth="2.2" />
              </g>
            ))}
          </g>
        </g>
      </svg>

      <ol className="jroad-steps">
        {STOPS.map((stop) => (
          <li key={stop.n} data-stop={stop.at}>
            <span>{stop.n}</span>
            <h3>{stop.title}</h3>
            <p>{stop.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ==========================================================================
   5. Contato: a conversa que se digita sozinha
   ========================================================================== */
const CHAT = [
  { who: 'them', text: 'Oi! Meu pai recebe alta essa semana e vai precisar de cama hospitalar.' },
  { who: 'us', text: 'Oi! Vamos te ajudar. É para usar por quanto tempo, mais ou menos?' },
  { who: 'them', text: 'Uns dois ou três meses.' },
  { who: 'us', text: 'Então vale comparar a locação. Me conta o bairro e como é o acesso ao quarto que eu preparo a cotação.' },
]

export function ChatCTA({ onContact, email }) {
  const ref = useRef(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) {
      setLive(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLive(true)
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="chatcta" id="contato" ref={ref}>
      <div className="yr3-width chatcta-box">
        <div className="chatcta-copy">
          <p className="yr3-eyebrow">VAMOS ENCONTRAR SEU PRÓXIMO PASSO</p>
          <h2>
            Começa com
            <br />
            uma mensagem.
          </h2>
          <p>Conte o que você precisa. A YR ajuda a comparar compra e locação e a escolher a peça certa.</p>
          <div className="chatcta-actions">
            <button className="yr3-button yr3-button--white" onClick={() => onContact?.('Orientação')}>
              Conversar com a YR <span aria-hidden="true">↗</span>
            </button>
            {email && (
              <a className="yr3-email" href={`mailto:${email}`}>
                {email}
              </a>
            )}
          </div>
        </div>

        <div className={`chat ${live ? 'is-live' : ''}`} aria-label="Exemplo de conversa com a YR">
          <p className="chat-label">Exemplo de conversa</p>
          {/* Cada mensagem ja nasce ocupando o seu espaco (so invisivel): o card
              tem a altura final desde o primeiro quadro e nao pula. O "digitando"
              e absoluto, por cima da vaga da resposta que vai chegar. */}
          {CHAT.map((message, index) => (
            <div key={index} className={`chat-slot chat-slot--${message.who} chat-s${index}`}>
              {message.who === 'us' && (
                <span className="chat-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <p className={`chat-msg chat-msg--${message.who}`}>{message.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ==========================================================================
   6. Duvidas: balao com icone que se desenha + sanfona com altura animada
   ========================================================================== */
const FAQ_ICONS = [
  // comprar ou alugar: balanca
  ['M12 4v16', 'M7 20h10', 'M5 7h14', 'M5 7l-2.4 6.2a2.6 2.6 0 0 0 4.8 0L5 7', 'M19 7l-2.4 6.2a2.6 2.6 0 0 0 4.8 0L19 7'],
  // pessoas e empresas: casa + predio
  ['M2.5 20.5V11l5-4.2 5 4.2v9.5', 'M6 20.5v-4.5h3v4.5', 'M14.5 20.5V4.5h7v16', 'M17 8.5h2M17 12h2M17 15.5h2', 'M1.5 20.5h21'],
  // orientacao: balao de conversa
  ['M20.5 11.6a8 8 0 0 1-11.7 7L4 20l1.3-4.4A8 8 0 1 1 20.5 11.6z', 'M8.6 11.6h.01M12.5 11.6h.01M16.4 11.6h.01'],
  // entrega: van
  ['M2 6.5h11.5v10H2z', 'M13.5 9.5h4.2l3.3 3.4v3.6h-7.5', 'M6 19.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z', 'M17 19.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z'],
  // valores: etiqueta
  ['M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z', 'M7.8 8.8h.01', 'M11 15l4-4'],
]

function FaqIcon({ index, className }) {
  const paths = FAQ_ICONS[index % FAQ_ICONS.length]
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} pathLength="1" style={{ '--i': i }} />
      ))}
    </svg>
  )
}

export function FaqMotion({ faqs, onContact }) {
  const [open, setOpen] = useState(0)

  return (
    <section className="faqm yr3-section" id="faq">
      <div className="yr3-width faqm-grid">
        <div className="faqm-side">
          <p className="yr3-eyebrow">PODE PERGUNTAR</p>
          <h2>
            Mais clareza.
            <br />
            Menos dúvidas.
          </h2>
          <p className="yr3-body">O primeiro passo não precisa ser uma decisão. Pode ser uma conversa.</p>

          {/* Balao grande: mostra o icone do assunto aberto, desenhado na hora. */}
          <div className="faqm-bubble" aria-hidden="true">
            <span className="faqm-plus faqm-plus--a" />
            <span className="faqm-plus faqm-plus--b" />
            <svg className="faqm-bubble-shape" viewBox="0 0 260 220">
              <path d="M36 16h188a24 24 0 0 1 24 24v104a24 24 0 0 1-24 24H112l-44 38 8-38H36a24 24 0 0 1-24-24V40a24 24 0 0 1 24-24z" />
            </svg>
            {/* key = assunto: remonta o SVG e o traco se desenha de novo */}
            <FaqIcon key={open ?? 'none'} index={open ?? 0} className="faqm-bubble-icon" />
          </div>

          <button className="yr3-button yr3-button--soft" onClick={() => onContact?.('Orientação')}>
            Falar com a equipe <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="faqm-list">
          {faqs.map((item, index) => {
            const isOpen = open === index
            return (
              <div key={item.q} className={`faqm-item ${isOpen ? 'is-open' : ''}`}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-painel-${index}`}
                    id={`faq-botao-${index}`}
                    onClick={() => setOpen(isOpen ? null : index)}
                  >
                    <span className="faqm-chip">
                      <FaqIcon index={index} />
                    </span>
                    <span className="faqm-q">{item.q}</span>
                    <span className="faqm-toggle" aria-hidden="true" />
                  </button>
                </h3>
                {/* A resposta fica sempre no HTML (SEO e leitor de tela); so a
                    altura anima, por grid-template-rows 0fr -> 1fr. */}
                <div className="faqm-panel" id={`faq-painel-${index}`} role="region" aria-labelledby={`faq-botao-${index}`}>
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
