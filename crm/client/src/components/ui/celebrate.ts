import confetti from 'canvas-confetti'

/**
 * Unica comemoracao do CRM: o contrato assinado.
 *
 * Dispara uma vez, com as cores da marca, e nao repete. Respeita
 * `prefers-reduced-motion`, porque animacao de particulas e justamente o
 * tipo de movimento que incomoda quem pediu para reduzi-lo.
 */
export function celebrateSignature() {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 32,
    ticks: 140,
    origin: { y: 0.65 },
    colors: ['#12456f', '#2b7fc4', '#0e7c6b', '#8fc0e6'],
    disableForReducedMotion: true,
  })
}
