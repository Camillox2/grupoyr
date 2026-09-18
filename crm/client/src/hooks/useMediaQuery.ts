import { useEffect, useState } from 'react'

/**
 * Fonte de verdade do layout responsivo.
 *
 * Breakpoint do mobile alinhado com o padrao das telas do nextstep (820px):
 * abaixo disso a tela TROCA de layout (tabela vira card, coluna vira seletor),
 * em vez de apenas encolher os mesmos elementos.
 */
export const MOBILE_QUERY = '(max-width: 820px)'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

/** Usuario pediu menos movimento no sistema operacional. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
