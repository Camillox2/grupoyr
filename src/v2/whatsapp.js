import { siteConfig } from '../config.js'

/** Link wa.me com mensagem pronta. Número sempre vem de siteConfig. */
export function waLink(text) {
  const base = siteConfig.whatsappLink || `https://wa.me/${siteConfig.whatsapp}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

export const WA_MESSAGES = {
  fab: 'Olá! Vim pelo site da YR e gostaria de ajuda com equipamentos para cuidar em casa.',
  ato1: 'Olá! Meu familiar vai pra casa e quero ajuda para preparar o quarto. Pode me orientar?',
}

const ROOM_LABELS = {
  quarto: 'Quarto',
  banheiro: 'Banheiro',
  sala: 'Sala',
}

/**
 * Monta a mensagem final do WhatsApp (Ato 3) listando os cômodos e
 * equipamentos que o visitante explorou na maquete 3D do Ato 2.
 */
export function buildClosingWaMessage(exploration) {
  const rooms = [...(exploration?.rooms || [])].map((r) => ROOM_LABELS[r] || r)
  const items = [...(exploration?.items || [])]

  if (!rooms.length && !items.length) {
    return 'Olá! Vim pela página "Voltando pra casa" da YR e quero ajuda para montar o quarto do meu familiar em casa.'
  }

  const parts = []
  if (rooms.length) parts.push(`cômodos: ${rooms.join(', ')}`)
  if (items.length) parts.push(`equipamentos: ${items.join(', ')}`)

  return `Olá! Explorei a casa em miniatura no site da YR (${parts.join(' · ')}) e quero ajuda para montar o quarto do meu familiar.`
}
