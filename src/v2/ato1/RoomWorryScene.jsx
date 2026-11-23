import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'
import CrampedRoomArt from './art/CrampedRoomArt.jsx'

/**
 * Quadro 3: quarto de casa improvisado, apertado, cama comum baixa.
 * O cenário treme levemente e desfoca conforme o scroll para passar a preocupação
 * (em prefers-reduced-motion fica completamente estático e nítido).
 */
export default function RoomWorryScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 75%',
          end: 'bottom bottom',
          scrub: 0.55,
        },
      })

      // O cenário se aperta + micro-tremor e desfoque de ansiedade no pico do quadro.
      tl.fromTo('.s-worry__frame', { scale: 1, opacity: 0.4 }, { scale: 1.04, opacity: 1, duration: 0.25 }, 0)
        .to('.s-worry__frame', {
          keyframes: [
            { x: -4, y: 2, rotate: -0.35, filter: 'blur(1.4px)', scale: 1.06, duration: 0.1 },
            { x: 5, y: -3, rotate: 0.4, filter: 'blur(3.2px)', scale: 1.08, duration: 0.1 },
            { x: -5, y: 3, rotate: -0.45, filter: 'blur(3.6px)', scale: 1.09, duration: 0.1 },
            { x: 4, y: -2, rotate: 0.3, filter: 'blur(2.4px)', scale: 1.07, duration: 0.1 },
            { x: -2, y: 1, rotate: -0.15, filter: 'blur(0.8px)', scale: 1.05, duration: 0.1 },
            { x: 0, y: 0, rotate: 0, filter: 'blur(0px)', scale: 1.03, duration: 0.1 },
          ],
        }, 0.24)
        .fromTo('.worry-art__marks', { opacity: 0 }, { opacity: 0.9, duration: 0.2 }, 0.24)
        .fromTo('.s-worry__copy', { y: 32, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.22, ease: 'power2.out' }, 0.18)
        .to('.s-worry__copy', { y: -16, autoAlpha: 0, duration: 0.14 }, 0.86)
        .to('.s-worry__frame', { opacity: 0.35, duration: 0.14 }, 0.86)
    })
    return () => mm.revert()
  }, [])

  return (
    <section
      ref={ref}
      className="v2-scene s-worry"
      data-bg="#192431"
      data-fg="#f4efe6"
      aria-labelledby="worry-title"
    >
      <div className="v2-stage s-worry__stage">
        <div className="s-worry__frame">
          <CrampedRoomArt />
        </div>
        <div className="s-worry__copy">
          <p className="v2-eyebrow s-worry__eyebrow">O quarto no improviso</p>
          <h2 id="worry-title" className="v2-story-title">
            A cama é baixa. O espaço aperta.
          </h2>
          <p className="v2-story-sub">
            Improvisar travesseiros cansa quem cuida e insegura quem descansa. É preciso um apoio pensado para esse momento.
          </p>
        </div>
      </div>
    </section>
  )
}
