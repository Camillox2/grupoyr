import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'

const STEPS = [
  {
    n: '01',
    title: 'Pedido',
    desc: 'Você explica a rotina pelo WhatsApp — sem precisar saber nomes técnicos. A equipe ajuda a escolher entre locação ou compra.',
  },
  {
    n: '02',
    title: 'Entrega',
    desc: 'Condições, disponibilidade e entrega são combinadas antes de fechar, com atendimento em Curitiba e região.',
  },
  {
    n: '03',
    title: 'Instalação',
    desc: 'A equipe leva o equipamento até o quarto, monta tudo no lugar e explica cada ajuste com calma para quem vai cuidar.',
  },
  {
    n: '04',
    title: 'Retirada',
    desc: 'Na locação, quando não for mais necessário, a retirada em casa é combinada direto com a equipe, sem complicação.',
  },
]

/**
 * Quadro 9: linha do tempo animada do serviço
 * (Pedido > Entrega > Instalação > Retirada) desenhada como um caminho SVG
 * contínuo que se completa conforme o usuário rola.
 */
export default function TimelineScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const path = ref.current.querySelector('.tl-svg__fill')
      const cards = gsap.utils.toArray('.tl-step', ref.current)

      if (path) {
        gsap.fromTo(
          path,
          { strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: '.tl-track',
              start: 'top 76%',
              end: 'bottom 68%',
              scrub: 0.45,
            },
          },
        )
      }

      cards.forEach((card) => {
        gsap.fromTo(
          card,
          { y: 28, autoAlpha: 0.28 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.65,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 80%',
              end: 'top 56%',
              scrub: 0.35,
              onEnter: () => card.classList.add('is-lit'),
              onLeaveBack: () => card.classList.remove('is-lit'),
            },
          },
        )
      })
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      ref={ref}
      className="tl-section"
      data-bg="#f4ebdc"
      data-fg="#0b1e33"
      aria-labelledby="tl-title"
    >
      <div className="tl-inner">
        <header className="tl-head">
          <p className="v2-eyebrow tl-eyebrow">Como funciona na prática</p>
          <h2 id="tl-title" className="v2-story-title tl-title">
            Do primeiro contato até o fim do uso, sem peso extra.
          </h2>
        </header>

        <div className="tl-track">
          {/* Caminho SVG contínuo que se desenha com a rolagem */}
          <svg
            className="tl-svg"
            viewBox="0 0 80 800"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="tl-svg__ghost"
              d="M40 24 C66 130, 14 235, 40 330 C66 430, 14 540, 40 650 C52 710, 40 756, 40 784"
              pathLength="1"
            />
            <path
              className="tl-svg__fill"
              d="M40 24 C66 130, 14 235, 40 330 C66 430, 14 540, 40 650 C52 710, 40 756, 40 784"
              pathLength="1"
            />
          </svg>

          <ol className="tl-list">
            {STEPS.map((step) => (
              <li className="tl-step" key={step.n}>
                <span className="tl-step__node" aria-hidden="true">
                  <span>{step.n}</span>
                </span>
                <div className="tl-step__card">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
