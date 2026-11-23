import { useMagnetic } from './useMagnetic.js'
import { WhatsAppIcon } from './icons.jsx'
import { waLink, WA_MESSAGES } from '../whatsapp.js'

const HIDE_CLASS = 'v2-hide-fab'

/**
 * API para esconder o botão flutuante (o Ato 2 usa em tela cheia).
 * Contagem de "pedidos" para que vários atos possam pedir/soltar sem conflito.
 */
let hideRequests = 0
export function setFabHidden(hidden) {
  hideRequests = Math.max(0, hideRequests + (hidden ? 1 : -1))
  document.body.classList.toggle(HIDE_CLASS, hideRequests > 0)
}

export default function WhatsAppFab() {
  const ref = useMagnetic(0.3)
  return (
    <a
      ref={ref}
      className="v2-fab"
      href={waLink(WA_MESSAGES.fab)}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com a YR no WhatsApp (abre em nova aba)"
      data-cursor="wa"
    >
      <span className="v2-fab__pulse" aria-hidden="true" />
      <WhatsAppIcon size={28} />
      <span className="v2-fab__label">Falar no WhatsApp</span>
    </a>
  )
}
