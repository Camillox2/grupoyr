import { useLayoutEffect, useRef, useState } from 'react'
import { ScrollTrigger, scrollToTarget } from '../motion.js'

export const ACTS = [
  { id: 'ato-1', n: 1, label: 'A notícia' },
  { id: 'ato-2', n: 2, label: 'A casa' },
  { id: 'ato-3', n: 3, label: 'Em casa' },
]

/** Trilha discreta com os 3 atos: ato atual + progresso dentro de cada um. */
export default function ProgressRail() {
  const [current, setCurrent] = useState(0)
  const segRefs = useRef([])

  useLayoutEffect(() => {
    const triggers = ACTS.map((act, i) => {
      const el = document.getElementById(act.id)
      if (!el) return null
      const seg = segRefs.current[i]
      const set = self => seg?.style.setProperty('--p', self.progress.toFixed(4))
      return ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onUpdate: set,
        onRefresh: set,
        onToggle: self => { if (self.isActive) setCurrent(i) },
      })
    })
    return () => triggers.forEach(t => t?.kill())
  }, [])

  const act = ACTS[current]
  return (
    <nav className="v2-rail" aria-label="Progresso da história">
      <p className="v2-rail__now" aria-live="polite">
        <span className="v2-rail__num">Ato {act.n}</span>
        <span className="v2-rail__sep" aria-hidden="true">·</span>
        <span className="v2-rail__name">{act.label}</span>
      </p>
      <ol className="v2-rail__list">
        {ACTS.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              className={`v2-rail__seg${i === current ? ' is-current' : ''}${i < current ? ' is-done' : ''}`}
              ref={el => { segRefs.current[i] = el }}
              aria-label={`Ir para o Ato ${a.n}: ${a.label}`}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => scrollToTarget(document.getElementById(a.id))}
            >
              <span className="v2-rail__track" aria-hidden="true"><span className="v2-rail__fill" /></span>
              <span className="v2-rail__label" aria-hidden="true">{a.n}. {a.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
