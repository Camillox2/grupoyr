import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'
import AtHomeArt from './art/AtHomeArt.jsx'

/**
 * Quadro 8: o pai na cama hospitalar, quarto claro, a filha na poltrona ao lado.
 * Com a rolagem, a luz da janela muda de tarde para noite e o abajur acende
 * espalhando um brilho quente pelo quarto.
 */
export default function AtHomeScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: ref.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.65,
        },
      })

      // 1) Fim de tarde (0 -> 0.42): pôr do sol na janela, nuvens saem, feixes de sol baixam
      tl.to('.ah-sky-dusk', { opacity: 1, duration: 0.34 }, 0.08)
        .to('.ah-clouds', { opacity: 0.15, x: 18, duration: 0.36 }, 0.08)
        .to('.ah-sunbeams', { opacity: 0.06, duration: 0.38 }, 0.1)
        // 2) Noite (0.42 -> 0.78): céu estrelado com lua crescente + véu suave noturno + abajur ACENDE!
        .to('.ah-sky-night', { opacity: 1, duration: 0.34 }, 0.4)
        .to('.ah-night-wash', { opacity: 0.36, duration: 0.34 }, 0.42)
        .to('.ah-top-scrim', { opacity: 0, duration: 0.28 }, 0.42)
        .to('.ah-night-scrim', { opacity: 1, duration: 0.32 }, 0.42)
        .to('.ah-lamp-bulb', { opacity: 1, duration: 0.18 }, 0.54)
        .to('.ah-lamp-glow', { opacity: 1, duration: 0.28 }, 0.52)
        // Texto acompanha suavemente a mudança de atmosfera
        .to('.s-home__badge-day', { autoAlpha: 0, y: -8, duration: 0.15 }, 0.44)
        .fromTo('.s-home__badge-night', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.18 }, 0.52)
        .to('.s-home__copy', { color: '#fbf4e7', duration: 0.3 }, 0.46)
        .to('.s-home__eyebrow', { color: '#ffd98a', duration: 0.3 }, 0.46)
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      ref={ref}
      className="v2-scene s-home"
      data-bg="#f6eee1"
      data-fg="#0b1e33"
      aria-labelledby="home-title"
    >
      <div className="v2-stage s-home__stage">
        <div className="s-home__art">
          <AtHomeArt />
        </div>

        <div className="s-home__copy">
          <div className="s-home__time" aria-hidden="true">
            <span className="s-home__badge s-home__badge-day">Fim de tarde em casa</span>
            <span className="s-home__badge s-home__badge-night">A noite chega tranquila</span>
          </div>
          <p className="v2-eyebrow s-home__eyebrow">Em casa</p>
          <h2 id="home-title" className="v2-story-title">
            O quarto mudou. E o cuidado voltou a caber no abraço.
          </h2>
          <p className="v2-story-sub s-home__sub">
            Quando o equipamento trabalha em silêncio por quem cuida, sobra fôlego para estar junto — da tarde até a noite.
          </p>
        </div>
      </div>
    </section>
  )
}
