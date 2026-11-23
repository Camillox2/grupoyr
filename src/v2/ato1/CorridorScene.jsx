import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'
import CorridorArt from './art/CorridorArt.jsx'

/**
 * Quadro 2: corredor de hospital, a filha olhando o celular, preocupada.
 * Usa sticky CSS + scrub no GSAP (sem pin) para a rolagem no celular nunca travar.
 */
export default function CorridorScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 80%',
          end: 'bottom bottom',
          scrub: 0.65,
        },
      })

      tl.fromTo('.s-corr__art', { scale: 0.96, opacity: 0.35 }, { scale: 1.04, opacity: 1, duration: 0.32 }, 0)
        .to('.corridor-art__room', { scale: 1.1, transformOrigin: '50% 42%', duration: 0.8 }, 0.15)
        .fromTo('.corridor-art__daughter-wrap', { y: 34 }, { y: -8, duration: 0.72 }, 0.12)
        .fromTo('.daughter__glow', { opacity: 0.35 }, { opacity: 0.95, duration: 0.45 }, 0.25)
        .fromTo('.s-corr__copy', { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, ease: 'power2.out' }, 0.22)
        .to('.s-corr__copy', { y: -18, autoAlpha: 0, duration: 0.16 }, 0.84)
        .to('.s-corr__art', { opacity: 0.3, duration: 0.16 }, 0.84)
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      ref={ref}
      className="v2-scene s-corr"
      data-bg="#0d233a"
      data-fg="#f4efe6"
      aria-labelledby="corr-title"
    >
      <div className="v2-stage s-corr__stage">
        <div className="s-corr__art">
          <CorridorArt />
        </div>
        <div className="s-corr__scrim" aria-hidden="true" />
        <div className="s-corr__copy">
          <p className="v2-eyebrow">No corredor do hospital</p>
          <h2 id="corr-title" className="v2-story-title">
            Mas como cuidar dele em casa?
          </h2>
          <p className="v2-story-sub">
            A alta traz alívio — e um silêncio cheio de perguntas na palma da mão.
          </p>
        </div>
      </div>
    </section>
  )
}
