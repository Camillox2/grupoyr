import React, { createContext, useContext, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  /** `origin` faz o novo tema abrir em circulo a partir do ponto do clique. */
  toggleTheme: (origin?: { x: number; y: number }) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
})

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('yr_crm_theme')
      if (saved === 'light' || saved === 'dark') return saved
      // A identidade da marca e a base pastel: o escuro e escolha de quem usa,
      // nao o ponto de partida.
      return 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('yr_crm_theme', theme)
    } catch {
      // Navegacao privativa ou armazenamento bloqueado: o tema vale so nesta aba.
    }
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = (origin?: { x: number; y: number }) => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement

    // A classe `dark` e aplicada AQUI, de forma sincrona, e nao so no
    // useEffect la de cima: efeito passivo nao roda dentro do flushSync, entao
    // a View Transition tirava o retrato "novo" ainda com as cores antigas e
    // elas trocavam de supetao no fim. O efeito continua existindo para o
    // carregamento inicial e para gravar a preferencia.
    const commit = () => {
      root.classList.toggle('dark', next === 'dark')
      flushSync(() => setTheme(next))
    }

    // Transicoes de cor desligadas enquanto o tema troca (ver index.css).
    root.classList.add('theme-switching')
    const release = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
    }

    const doc = document as DocumentWithViewTransition
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Sem suporte a View Transitions, ou com movimento reduzido: troca seca.
    if (!doc.startViewTransition || reduced) {
      commit()
      release()
      return
    }

    root.style.setProperty('--sweep-x', `${origin?.x ?? window.innerWidth / 2}px`)
    root.style.setProperty('--sweep-y', `${origin?.y ?? 0}px`)
    // Borda em pixels: o percurso e sempre multiplo de 32px (dois pixels da
    // grade de 16px), para o pontilhado cair no mesmo alinhamento a cada degrau.
    const STRIDE = 32
    const from = -352 // fileiras pontilhadas (320px) + folga, ja multiplo de 32
    const to = Math.ceil((window.innerHeight + 16) / STRIDE) * STRIDE
    root.style.setProperty('--theme-from', `${from}px`)
    root.style.setProperty('--theme-to', `${to}px`)
    root.style.setProperty('--theme-steps', String((to - from) / STRIDE))

    root.classList.add('theme-sweep')

    const transition = doc.startViewTransition(commit)
    transition.finished.finally(() => {
      root.classList.remove('theme-sweep')
      release()
    })
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
