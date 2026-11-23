import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'
import WaButton from '../ui/WaButton.jsx'
import { WA_MESSAGES } from '../whatsapp.js'

/**
 * Quadro 4: ela abre o WhatsApp da YR.
 * A conversa se desenrola com a rolagem e o primeiro CTA real
 * ("Falar com a YR no WhatsApp") entra e permanece fixo na tela por um bom
 * trecho de rolagem antes de a história abrir para a casa em miniatura (Ato 2).
 */
export default function WhatsAppScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 75%',
          end: 'bottom bottom',
          scrub: 0.55,
        },
      })

      tl.fromTo('.s-chat__head', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.14 }, 0.02)
        .fromTo('.s-chat__phone', { y: 40, scale: 0.96, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.18 }, 0.05)
        .fromTo('.s-chat__msg--1', { y: 18, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.14 }, 0.16)
        .fromTo('.s-chat__typing', { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.08 }, 0.28)
        .to('.s-chat__typing', { autoAlpha: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.06 }, 0.37)
        .fromTo('.s-chat__msg--2', { y: 18, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.14 }, 0.38)
        .fromTo('.s-chat__msg--3', { y: 18, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.14 }, 0.5)
        .fromTo('.s-chat__glow', { opacity: 0.15, scale: 0.8 }, { opacity: 1, scale: 1.05, duration: 0.28 }, 0.38)
        // Primeiro botão real de WhatsApp entra e fica FIXO/estável no palco até o fim do quadro (~35% da rolagem).
        .fromTo('.s-chat__cta-wrap', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.14 }, 0.58)
        // Pausa intencional de leitura (0.72 -> 1.0): mantém o CTA firme na tela por vários segundos de scroll.
        .to('.s-chat__phone', { y: -6, duration: 0.28 }, 0.72)
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      id="ato-1-chat"
      ref={ref}
      className="v2-scene s-chat"
      data-bg="#122d3f"
      data-fg="#f4efe6"
      aria-labelledby="chat-title"
    >
      <div className="v2-stage s-chat__stage">
        <div className="s-chat__glow" aria-hidden="true" />

        <div className="s-chat__layout">
          <div className="s-chat__head">
            <p className="v2-eyebrow">O primeiro respiro</p>
            <h2 id="chat-title" className="v2-story-title">
              Ela pede ajuda a quem entende de cuidar em casa.
            </h2>
            <p className="v2-story-sub">
              Sem precisar saber o nome técnico de cada equipamento. Basta contar o que a família está vivendo.
            </p>
          </div>

          <div className="s-chat__column">
            <div className="s-chat__phone" role="region" aria-label="Simulação de conversa no WhatsApp com o Grupo YR Hospitalar">
              <div className="s-chat__bar">
                <span className="s-chat__avatar" aria-hidden="true">
                  <img src="/yr-logo.webp" alt="" width="36" height="31" decoding="async" />
                </span>
                <div className="s-chat__who">
                  <strong>Grupo YR Hospitalar</strong>
                  <span><i aria-hidden="true" /> Atendimento humano · Curitiba e região</span>
                </div>
              </div>

              <div className="s-chat__thread">
                <div className="s-chat__msg s-chat__msg--out s-chat__msg--1">
                  <p>Oi! Meu pai vai receber alta e precisa ficar em casa. Nunca montei um quarto assim, podem me orientar?</p>
                  <span className="s-chat__ticks" aria-hidden="true">✓✓</span>
                </div>

                <div className="s-chat__typing" aria-hidden="true">
                  <span /><span /><span />
                </div>

                <div className="s-chat__msg s-chat__msg--in s-chat__msg--2">
                  <p>Oi, fica tranquila. A gente ajuda você a escolher o que faz sentido pro quarto dele — seja locação ou compra.</p>
                </div>

                <div className="s-chat__msg s-chat__msg--in s-chat__msg--3">
                  <p>Nossa equipe leva, monta no quarto e explica cada ajuste com calma.</p>
                </div>
              </div>
            </div>

            <div className="s-chat__cta-wrap">
              <WaButton message={WA_MESSAGES.ato1}>
                Falar com a YR no WhatsApp
              </WaButton>
              <p className="s-chat__cta-note">
                Atendimento real · Compra ou locação sob cotação
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
