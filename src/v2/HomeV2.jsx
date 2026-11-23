import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap, initMotion } from './motion.js'
import ProgressRail from './ui/ProgressRail.jsx'
import WhatsAppFab from './ui/WhatsAppFab.jsx'
import Cursor from './ui/Cursor.jsx'
import Ato1 from './ato1/Ato1.jsx'
import Ato2 from './ato2/Ato2.jsx'
import Ato3 from './ato3/Ato3.jsx'

/**
 * Cor de fundo global guiada pela rolagem.
 * Cada bloco com [data-bg] (e opcional [data-fg]) faz a transição da cor
 * anterior para a sua enquanto entra na tela. A variável fica no <html>.
 */
function useScrollBackground(rootRef) {
  useLayoutEffect(() => {
    const html = document.documentElement
    const blocks = [...rootRef.current.querySelectorAll('[data-bg]')]
    if (!blocks.length) return
    const first = blocks[0]
    html.style.setProperty('--v2-bg', first.dataset.bg)
    html.style.setProperty('--v2-fg', first.dataset.fg || '#f4efe6')
    const ctx = gsap.context(() => {
      blocks.slice(1).forEach((el, i) => {
        const prev = blocks[i]
        gsap.fromTo(
          html,
          { '--v2-bg': prev.dataset.bg, '--v2-fg': prev.dataset.fg || '#f4efe6' },
          {
            '--v2-bg': el.dataset.bg,
            '--v2-fg': el.dataset.fg || '#f4efe6',
            ease: 'none',
            immediateRender: false,
            scrollTrigger: { trigger: el, start: el.dataset.bgStart || 'top 85%', end: el.dataset.bgEnd || 'top 35%', scrub: true },
          },
        )
      })
    })
    return () => ctx.revert()
  }, [rootRef])
}

export default function HomeV2() {
  const rootRef = useRef(null)

  useEffect(() => initMotion(), [])
  useScrollBackground(rootRef)

  return (
    <div className="v2" ref={rootRef}>
      <a className="v2-skip" href="#ato-1-chat">Pular para o contato</a>
      <header className="v2-header">
        <a className="v2-brand" href="/" aria-label="Grupo YR Hospitalar — página inicial">
          <img src="/yr-logo.webp" alt="" width="700" height="596" decoding="async" />
          <span className="v2-brand__name">Grupo YR Hospitalar</span>
        </a>
        <ProgressRail />
      </header>

      <main>
        <Ato1 />
        <Ato2 />
        <Ato3 />
      </main>

      <WhatsAppFab />
      <Cursor />
      <div className="v2-grain" aria-hidden="true" />
    </div>
  )
}
