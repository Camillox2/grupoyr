import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../motion.js'

const LINE_A = ['O', 'médico', 'disse:']
const LINE_B = ['ele', 'pode', 'ir', 'pra', 'casa.']

/**
 * Batimento cardíaco que, no fim, vira o telhado de uma casa.
 * pathLength=1 permite desenhar via strokeDashoffset 1 → 0.
 */
const PULSE_TO_HOUSE =
  'M0 120 H300 L330 120 L350 70 L372 168 L396 40 L420 150 L440 120 H560 L584 120 L600 98 L616 120 H700 V60 L770 6 L840 60 V120 H1000'

export default function OpeningScene() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(ref)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const words = gsap.utils.toArray('.op-word__in')
      // Entrada imediata palavra por palavra (mantém LCP rápido no celular).
      const intro = gsap.timeline({ delay: 0.03 })
      intro
        .from('.op-eyebrow', { y: 10, duration: 0.45, ease: 'power3.out' })
        .from(words, { yPercent: 85, rotate: 2.5, duration: 0.72, ease: 'expo.out', stagger: 0.065 }, 0.02)
        .from('.op-hint', { autoAlpha: 0, y: 8, duration: 0.55, ease: 'power2.out' }, 0.35)

      // Rolagem: o pulso desenha e vira casa; a frase sobe e se dissolve.
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom bottom', scrub: 0.6 },
      })
      tl.to('.op-hint', { autoAlpha: 0, y: -10, duration: 0.08 }, 0)
        .fromTo('.op-pulse__line', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45 }, 0.02)
        .fromTo('.op-casa__underline', { scaleX: 0 }, { scaleX: 1, duration: 0.2 }, 0.22)
        .to('.op-pulse__window', { opacity: 1, duration: 0.1 }, 0.45)
        .to('.op-pulse__halo', { opacity: 1, scale: 1, duration: 0.18 }, 0.45)
        .to('.op-title', { yPercent: -18, autoAlpha: 0, filter: 'blur(8px)', duration: 0.32 }, 0.66)
        .to('.op-eyebrow', { autoAlpha: 0, duration: 0.15 }, 0.66)
        .to('.op-pulse', { y: -40, autoAlpha: 0, duration: 0.3 }, 0.7)
    })
    return () => mm.revert()
  }, [])

  return (
    <section ref={ref} className="v2-scene s-open" data-bg="#071d35" data-fg="#f4efe6" aria-labelledby="op-title">
      <div className="v2-stage s-open__stage">
        <div className="s-open__glow" aria-hidden="true" />
        <p className="v2-eyebrow op-eyebrow">Uma história sobre voltar pra casa</p>
        <h1 id="op-title" className="op-title">
          <span className="op-line">
            {LINE_A.map(w => (
              <span className="op-word" key={w}><span className="op-word__in">{w}</span></span>
            ))}
          </span>
          <span className="op-line">
            {LINE_B.map(w => (
              <span className={`op-word${w === 'casa.' ? ' op-casa' : ''}`} key={w}>
                <span className="op-word__in">
                  {w}
                  {w === 'casa.' && <span className="op-casa__underline" aria-hidden="true" />}
                </span>
              </span>
            ))}
          </span>
        </h1>

        <svg className="op-pulse" viewBox="0 0 1000 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="opHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#f3c27e" stopOpacity=".55" />
              <stop offset="1" stopColor="#f3c27e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle className="op-pulse__halo" cx="770" cy="80" r="90" fill="url(#opHalo)" />
          <path className="op-pulse__ghost" d={PULSE_TO_HOUSE} pathLength="1" />
          <path className="op-pulse__line" d={PULSE_TO_HOUSE} pathLength="1" />
          <rect className="op-pulse__window" x="756" y="72" width="28" height="28" rx="4" />
        </svg>

        <div className="op-hint" aria-hidden="true">
          <span className="op-hint__mouse"><span /></span>
          <span className="op-hint__text">Role para continuar</span>
        </div>
      </div>
    </section>
  )
}
