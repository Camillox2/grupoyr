import { useEffect, useRef, useState } from 'react'
import { gsap, FINE_POINTER_QUERY } from '../motion.js'

const QUERY = `${FINE_POINTER_QUERY} and (prefers-reduced-motion: no-preference)`
const HOVER_SELECTOR = 'a, button, [role="button"], [data-cursor]'

/** Cursor personalizado: só em ponteiro fino e sem reduced-motion. */
export default function Cursor() {
  const [enabled, setEnabled] = useState(false)
  const rootRef = useRef(null)
  const dotRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const sync = () => setEnabled(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const html = document.documentElement
    const root = rootRef.current
    html.classList.add('v2-cursor-on')
    gsap.set([dotRef.current, ringRef.current], { xPercent: -50, yPercent: -50 })
    const dotX = gsap.quickTo(dotRef.current, 'x', { duration: 0.12, ease: 'power3.out' })
    const dotY = gsap.quickTo(dotRef.current, 'y', { duration: 0.12, ease: 'power3.out' })
    const ringX = gsap.quickTo(ringRef.current, 'x', { duration: 0.5, ease: 'power3.out' })
    const ringY = gsap.quickTo(ringRef.current, 'y', { duration: 0.5, ease: 'power3.out' })

    const move = e => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      root.classList.add('is-visible')
      dotX(e.clientX); dotY(e.clientY); ringX(e.clientX); ringY(e.clientY)
    }
    const over = e => {
      const target = e.target.closest?.(HOVER_SELECTOR)
      root.classList.toggle('is-hover', !!target)
      root.classList.toggle('is-wa', target?.dataset?.cursor === 'wa')
    }
    const down = () => root.classList.add('is-down')
    const up = () => root.classList.remove('is-down')
    const leave = () => root.classList.remove('is-visible')

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerover', over, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      html.classList.remove('v2-cursor-on')
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div className="v2-cursor" ref={rootRef} aria-hidden="true">
      <div className="v2-cursor__ring" ref={ringRef} />
      <div className="v2-cursor__dot" ref={dotRef} />
    </div>
  )
}
