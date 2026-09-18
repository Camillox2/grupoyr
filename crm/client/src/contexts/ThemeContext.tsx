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
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
    const apply = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))

    const doc = document as DocumentWithViewTransition
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Sem suporte a View Transitions, ou com movimento reduzido: troca seca.
    if (!doc.startViewTransition || reduced) {
      apply()
      return
    }

    const root = document.documentElement
    root.style.setProperty('--sweep-x', `${origin?.x ?? window.innerWidth / 2}px`)
    root.style.setProperty('--sweep-y', `${origin?.y ?? 0}px`)
    root.classList.add('theme-sweep')

    // flushSync e obrigatorio aqui: startViewTransition tira o retrato "novo"
    // assim que o callback retorna, e o setState do React so seria aplicado no
    // proximo tick. Sem isso o circulo revela o tema ANTIGO e a troca pisca.
    const transition = doc.startViewTransition(() => {
      flushSync(apply)
    })
    transition.finished.finally(() => root.classList.remove('theme-sweep'))
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
