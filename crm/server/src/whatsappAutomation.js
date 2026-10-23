// One verified legacy fallback, not a broad greeting/AI-text heuristic.
// Keep the original message and provenance; never treat inbound customer text
// or an explicitly attributed CRM seller send as an external automation.
export const LEGACY_AUTOMATIC_REPLY = 'Olá! Sou o assistente comercial do Grupo YR Hospitalar. Entendemos a urgência do cuidado e temos camas hospitalares e equipamentos disponíveis para pronta entrega e montagem em Curitiba e Região Metropolitana. Como podemos ajudar hoje?'
const normalize = value => typeof value === 'string' ? value.normalize('NFC').replace(/\s+/gu, ' ').trim() : ''

export function externalAutomaticReplyKind(message) {
  if (message?.from !== 'agent' || message.type !== 'text' || message.sentVia !== 'whatsapp_business'
    || !message.sourceMessageId || message.sentBy || message.whatsappKey?.fromMe === false) return ''
  return normalize(message.content) === LEGACY_AUTOMATIC_REPLY ? 'legacy_fallback' : ''
}

export function isExternalAutomaticPacket(raw, parsed) {
  return Boolean(raw?.key?.fromMe && externalAutomaticReplyKind({
    ...parsed, from: 'agent', sentVia: 'whatsapp_business',
    sourceMessageId: raw.key.id, whatsappKey: raw.key,
  }))
}

export const isHumanAgentMessage = message => message?.from === 'agent'
  && message.isAutomated !== true && !externalAutomaticReplyKind(message)
