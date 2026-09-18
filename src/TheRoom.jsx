import { useEffect, useRef, useState } from 'react'
import { products, modalityLabel, productPath } from './catalog.js'
import { useSelection } from './SelectionContext.jsx'

/**
 * "O quarto se monta"
 *
 * A abertura da home e uma grande moldura com a foto do quarto. A primeira
 * imagem nasce fora de foco e ganha nitidez conforme o visitante rola; cada
 * peca seguinte SOBE como uma cortina por cima da anterior, presa ao scroll:
 * parou de rolar, a cortina para no meio. No fim, a moldura vira um mosaico
 * com o conjunto inteiro.
 *
 * O progresso vem da posicao real dos blocos de texto na tela (e nao de um
 * gatilho), porque o mesmo calculo serve para o desktop, onde o texto rola ao
 * lado da moldura, e para o celular, onde ele rola por baixo dela.
 */

const bySlug = (slug) => products.find((product) => product.slug === slug)
const bedElectric = bySlug('cama-eletrica-luxo')
const bedManual = bySlug('cama-manual-3-movimentos')
const mattress = bySlug('colchao-pneumatico')
const chair = bySlug('cadeira-de-banho')
const everything = [bedElectric, bedManual, mattress, chair].filter(Boolean)

const STEPS = [
  {
    key: 'inicio',
    number: '',
    eyebrow: 'Do hospital para casa',
    title: 'O quarto pronto\nantes da alta.',
    text: 'São quatro peças que deixam a casa preparada para receber quem você cuida. Role a página e veja uma por vez.',
    featured: null,
    items: [],
  },
  {
    key: 'cama',
    number: '01',
    eyebrow: 'A cama chega',
    title: 'Primeiro,\na cama certa.',
    text: 'É a peça que muda a rotina de quem cuida. Elétrica, para reposicionar sem esforço; ou manual, que não depende de tomada.',
    featured: bedElectric,
    items: [bedElectric, bedManual].filter(Boolean),
  },
  {
    key: 'colchao',
    number: '02',
    eyebrow: 'O colchão entra',
    title: 'Depois,\no apoio do corpo.',
    text: 'Vai por cima do colchão que já existe. O compressor fica na cabeceira e alterna a pressão entre as células ao longo do dia.',
    featured: mattress,
    items: [mattress].filter(Boolean),
  },
  {
    key: 'banho',
    number: '03',
    eyebrow: 'O banho fica seguro',
    title: 'E o banho deixa\nde ser um risco.',
    text: 'Encaixa sobre o vaso ou entra direto no box. Altura regulável, rodízios com trava e alumínio que não enferruja.',
    featured: chair,
    items: [chair].filter(Boolean),
  },
  {
    key: 'pronto',
    number: '',
    eyebrow: 'Quarto pronto',
    title: 'Seu quarto\nestá pronto.',
    text: 'A equipe leva, monta e explica o funcionamento. Na retirada, desmonta e leva embora. Conte como é o acesso até o quarto que a gente resolve o resto.',
    featured: null,
    items: [],
  },
]

const LAST = STEPS.length - 1
const clamp01 = (value) => Math.min(1, Math.max(0, value))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Progresso 0..1 de uma cortina que sobe entre o passo `from` e o seguinte. */
const curtain = (pos, from) => easeInOut(clamp01((pos - from - 0.18) / 0.64))

export default function TheRoom({ onContact }) {
  const [step, setStep] = useState(0)
  const sectionRef = useRef(null)
  const beatRefs = useRef([])
  const { choose } = useSelection()

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let lastStep = -1

    const update = () => {
      frame = 0
      const stage = section.querySelector('.room-stage')
      const beats = beatRefs.current.filter(Boolean)
      if (!stage || beats.length === 0) return

      // Linha de foco: no desktop o texto rola AO LADO da moldura, entao o
      // foco e o meio dela. No celular o texto rola POR BAIXO, entao o foco
      // e o meio da area que sobra entre a moldura e o fim da tela.
      const stageBox = stage.getBoundingClientRect()
      const sideBySide = window.matchMedia('(min-width: 901px)').matches
      const focusY = sideBySide
        ? stageBox.top + stageBox.height / 2
        : stageBox.bottom + (window.innerHeight - stageBox.bottom) / 2

      const centers = beats.map((beat) => {
        const box = beat.getBoundingClientRect()
        return box.top + box.height / 2
      })

      let pos = 0
      if (focusY <= centers[0]) pos = 0
      else if (focusY >= centers[centers.length - 1]) pos = LAST
      else {
        for (let i = 0; i < centers.length - 1; i += 1) {
          if (focusY >= centers[i] && focusY <= centers[i + 1]) {
            pos = i + (focusY - centers[i]) / (centers[i + 1] - centers[i])
            break
          }
        }
      }

      // Movimento reduzido: sem progresso continuo, so troca seca por passo.
      const p = reduced ? Math.round(pos) : pos

      section.style.setProperty('--focus', reduced ? '1' : easeInOut(clamp01(p / 0.8)).toFixed(4))
      section.style.setProperty('--r1', curtain(p, 1).toFixed(4))
      section.style.setProperty('--r2', curtain(p, 2).toFixed(4))
      section.style.setProperty('--r3', curtain(p, 3).toFixed(4))
      section.style.setProperty('--progress', (p / LAST).toFixed(4))

      const nearest = Math.round(pos)
      if (nearest !== lastStep) {
        lastStep = nearest
        setStep(nearest)
      }
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
  }, [])

  const pick = (product) => {
    choose(product, product.rent ? undefined : 'Comprar')
    onContact?.('Orientação')
  }

  const current = STEPS[step]

  return (
    <section className="room" id="quarto" ref={sectionRef} aria-label="Como o quarto fica pronto">
      {/* ------------------------------------------------ moldura fixa */}
      <div className="room-stage">
        <div className="room-frame">
          {/* Camada 0: a cama, que nasce fora de foco. */}
          <div className="room-layer room-layer--base">
            <img
              src={bedElectric.scene}
              alt={bedElectric.name}
              width="1264"
              height="842"
              fetchPriority="high"
              style={{ objectPosition: bedElectric.focus }}
            />
          </div>

          {/* Camadas seguintes sobem como cortina, presas ao scroll. */}
          <div className="room-layer room-layer--rise" style={{ '--r': 'var(--r1)' }}>
            <img
              src={mattress.scene}
              alt={mattress.name}
              width="842"
              height="1264"
              loading="lazy"
              style={{ objectPosition: mattress.focus }}
            />
          </div>
          <div className="room-layer room-layer--rise" style={{ '--r': 'var(--r2)' }}>
            <img
              src={chair.scene}
              alt={chair.name}
              width="1600"
              height="1600"
              loading="lazy"
              style={{ objectPosition: chair.focus }}
            />
          </div>

          {/* Ultima cortina: o conjunto inteiro, em mosaico. O rotulo vai POR
              CIMA da foto, entao as quatro celulas tem sempre o mesmo tamanho. */}
          <div className="room-layer room-layer--rise room-mosaic" style={{ '--r': 'var(--r3)' }}>
            {everything.map((product) => (
              <a key={product.slug} href={productPath(product)} tabIndex={step === LAST ? 0 : -1}>
                <img
                  src={product.image}
                  alt={product.name}
                  width="1200"
                  height="1200"
                  loading="lazy"
                />
                <span>
                  <strong>{product.short}</strong>
                  <em>{modalityLabel(product)}</em>
                </span>
              </a>
            ))}
          </div>

          {/* Numeral do passo, editorial, por cima da moldura. */}
          <div className="room-number" aria-hidden="true">
            {STEPS.map((item, index) =>
              item.number ? (
                <span key={item.key} className={index === step ? 'is-current' : ''}>
                  {item.number}
                </span>
              ) : null,
            )}
          </div>

          {/* Etiqueta da peca em foco. */}
          <div className={`room-tag ${current.featured ? 'is-on' : ''}`}>
            {STEPS.map((item, index) =>
              item.featured ? (
                <div key={item.key} className={index === step ? 'is-current' : ''} aria-hidden={index !== step}>
                  <p>
                    <strong>{item.featured.short}</strong>
                    <em>{modalityLabel(item.featured)}</em>
                  </p>
                  <button type="button" tabIndex={index === step ? 0 : -1} onClick={() => pick(item.featured)}>
                    Quero este <span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : null,
            )}
          </div>

          {/* A outra opcao de cama, como cartao sobreposto ao canto. */}
          <a
            className={`room-alt ${step === 1 ? 'is-on' : ''}`}
            href={productPath(bedManual)}
            tabIndex={step === 1 ? 0 : -1}
            aria-hidden={step !== 1}
          >
            <img src={bedManual.image} alt="" width="300" height="300" loading="lazy" />
            <span>
              <small>ou, sem tomada</small>
              <strong>{bedManual.short}</strong>
            </span>
            <i aria-hidden="true">↗</i>
          </a>

          <div className="room-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ texto que rola */}
      <div className="room-script">
        {STEPS.map((item, index) => (
          <article
            key={item.key}
            id={`passo-${index}`}
            ref={(node) => {
              beatRefs.current[index] = node
            }}
            className={`room-beat ${index === step ? 'is-current' : ''}`}
          >
            <p className="room-eyebrow">
              {item.number && <b>{item.number}</b>}
              {item.eyebrow}
            </p>

            {/* A ultima linha de cada titulo ganha o mesmo traco azul desenhado
                do titulo do hero; ele se traca quando o passo vira o atual. */}
            <h2>
              {item.title.split('\n').map((line, i, lines) =>
                i === lines.length - 1 ? (
                  <span key={i}>
                    <span className="room-mark">
                      {line}
                      <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                        <path d="M3 9 C 60 2, 120 13, 180 6 S 270 4, 297 8" />
                      </svg>
                    </span>
                  </span>
                ) : (
                  <span key={i}>{line}</span>
                ),
              )}
            </h2>

            <p className="room-text">{item.text}</p>

            {item.items.length > 0 && (
              <ul className="room-options">
                {item.items.map((product) => (
                  <li key={product.slug}>
                    <a href={productPath(product)}>
                      <img src={product.image} alt="" width="200" height="200" loading="lazy" />
                      <div>
                        <strong>{product.short}</strong>
                        <span>{modalityLabel(product)}</span>
                      </div>
                      <i aria-hidden="true">↗</i>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {item.key === 'pronto' && (
              <div className="room-cta">
                <button className="yr3-button" onClick={() => onContact?.('Orientação')}>
                  Combinar a entrega <span aria-hidden="true">→</span>
                </button>
                <a className="yr3-button yr3-button--soft" href="#produtos">
                  Ver os equipamentos <span aria-hidden="true">↓</span>
                </a>
              </div>
            )}

            {index === 0 && (
              <p className="room-hint" aria-hidden="true">
                role a página <span>↓</span>
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
