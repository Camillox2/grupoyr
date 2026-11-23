/**
 * Infra de movimento da home v2.
 *
 * - GSAP + ScrollTrigger registrados uma única vez.
 * - Lenis (rolagem suave) SOMENTE em desktop com ponteiro fino e sem
 *   prefers-reduced-motion. No toque a rolagem é 100% nativa (nunca trava).
 * - ScrollTrigger ignora o resize causado pela barra de endereço do celular.
 */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.config({ ignoreMobileResize: true })

export { gsap, ScrollTrigger }

const mq = query => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)

export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

export function prefersReducedMotion() { return mq(REDUCED_QUERY) }
export function hasFinePointer() { return mq(FINE_POINTER_QUERY) }

let lenis = null
let tick = null

/** Liga Lenis + ScrollTrigger. Retorna a função de limpeza (idempotente, segura no StrictMode). */
export function initMotion() {
  const html = document.documentElement
  html.classList.toggle('v2-reduced', prefersReducedMotion())
  html.classList.toggle('v2-fine', hasFinePointer())

  gsap.ticker.lagSmoothing(0)

  if (!lenis && hasFinePointer() && !prefersReducedMotion()) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false })
    lenis.on('scroll', ScrollTrigger.update)
    tick = time => lenis?.raf(time * 1000)
    gsap.ticker.add(tick)
  }

  // Fontes podem mudar alturas depois da primeira medição.
  const refresh = () => ScrollTrigger.refresh()
  document.fonts?.ready?.then(refresh)
  window.addEventListener('load', refresh, { once: true })

  return () => {
    window.removeEventListener('load', refresh)
    if (tick) gsap.ticker.remove(tick)
    tick = null
    lenis?.destroy()
    lenis = null
  }
}

/** Rolagem programática que respeita Lenis quando ativo. */
export function scrollToTarget(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4, ...opts })
  else el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

export function getLenis() { return lenis }

/** Quebra um texto em palavras para revelação (cada palavra fica num "clip"). */
export function splitWords(text) {
  return text.split(/\s+/).filter(Boolean)
}
