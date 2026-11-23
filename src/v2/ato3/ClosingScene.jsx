import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'
import { useExploration } from '../explorationStore.js'
import { buildClosingWaMessage } from '../whatsapp.js'
import WaButton from '../ui/WaButton.jsx'
import { siteConfig } from '../../config.js'

const ROOM_NAME = {
  quarto: 'Quarto',
  banheiro: 'Banheiro',
  sala: 'Sala',
}

/**
 * Quadro 10: fechamento em tela cheia.
 * Frase "Cuidar em casa pode ser mais leve." + botão grande de WhatsApp com
 * mensagem pronta listando os cômodos e equipamentos explorados na maquete.
 */
export default function ClosingScene() {
  const ref = useRef(null)
  const exploration = useExploration()
  const rooms = [...exploration.rooms]
  const items = [...exploration.items]
  const hasExplored = rooms.length > 0 || items.length > 0
  const message = buildClosingWaMessage(exploration)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.cl-reveal', {
        y: 32,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.1,
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 72%',
          once: true,
        },
      })
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      ref={ref}
      className="cl-section"
      data-bg="#f8f1e4"
      data-fg="#071d35"
      aria-labelledby="closing-title"
    >
      <div className="cl-glow" aria-hidden="true" />

      <div className="cl-body">
        <p className="v2-eyebrow cl-eyebrow cl-reveal">Grupo YR Hospitalar · Curitiba e região</p>
        <h2 id="closing-title" className="cl-title cl-reveal">
          Cuidar em casa pode ser mais leve.
        </h2>
        <p className="cl-sub cl-reveal">
          Conte como é o quarto e o que a família está vivendo. A equipe orienta entre locação ou compra, sem pressa e sem valores escondidos — tudo alinhado na cotação.
        </p>

        {hasExplored && (
          <div className="cl-explored cl-reveal" aria-label="Itens explorados na casa em miniatura">
            <span className="cl-explored__label">Você explorou na maquete:</span>
            <ul className="cl-explored__chips">
              {rooms.map((r) => (
                <li key={`r-${r}`}>{ROOM_NAME[r] || r}</li>
              ))}
              {items.map((item) => (
                <li key={`i-${item}`} className="is-item">{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="cl-cta cl-reveal">
          <WaButton message={message} className="cl-cta__btn">
            Montar o quarto do meu familiar pelo WhatsApp
          </WaButton>
          <p className="cl-cta__note">
            {hasExplored
              ? 'A mensagem já vai preenchida com os cômodos e equipamentos que você viu — você revisa antes de enviar.'
              : 'Abre uma conversa pronta no WhatsApp com a equipe da YR — você revisa a mensagem antes de enviar.'}
          </p>
        </div>
      </div>

      <footer className="cl-footer">
        <div className="cl-footer__brand">
          <img src="/yr-logo.webp" alt="" width="36" height="31" loading="lazy" decoding="async" />
          <span>{siteConfig.company}</span>
        </div>
        <div className="cl-footer__links">
          <a href="/">Ver site completo</a>
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
          <span>WhatsApp {siteConfig.whatsappLabel}</span>
        </div>
        <p className="cl-footer__legal">
          Compra e locação de equipamentos hospitalares · Modelos, disponibilidade e condições confirmados na cotação.
        </p>
      </footer>
    </section>
  )
}
