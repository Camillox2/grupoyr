import { areJidsSameUser, decodeMessageNode, extractAddressingContext } from '@whiskeysockets/baileys'

const direct = jid => /@(s\.whatsapp\.net|lid|hosted|hosted\.lid)$/.test(String(jid || ''))
const protocolEvents = new Map([
  ['failed to decrypt message', 'decrypt_failed'],
  ['error in handling message', 'receive_failed'],
  ['failed to decode placeholder resend response', 'recovery_failed'],
  ['failed to request placeholder resend for unavailable message', 'recovery_failed'],
  ['App state sync complete, transitioning to Online state and flushing buffer', 'buffer_released'],
  ['Timeout in AwaitingInitialSync, forcing state to Online and flushing buffer', 'buffer_released'],
  ['Reconnection with existing sync data, skipping history sync wait. Transitioning to Online.', 'buffer_released'],
])

// Somente contagens e horários. Nunca guardar conteúdo, números, IDs de
// mensagens, chaves de sessão ou objetos de erro em logs/diagnósticos.
export function createWhatsAppIngress({ now = () => new Date().toISOString() } = {}) {
  const counts = {}
  const lastAt = {}
  const recipients = new Map()
  let ownJids = []
  const record = event => { counts[event] = (counts[event] || 0) + 1; lastAt[event] = now() }
  return {
    observeNode(node, user) {
      ownJids = [user?.id, user?.lid].filter(Boolean)
      try {
        const { fullMessage } = decodeMessageNode(node, user?.id || '', user?.lid || '')
        if (!direct(fullMessage.key.remoteJid)) return
        record(fullMessage.key.fromMe ? 'transport_outgoing' : 'transport_incoming')
        if (fullMessage.key.fromMe && node.attrs.recipient) {
          const alternate = extractAddressingContext(node).recipientAlt
          if (alternate) {
            recipients.set(fullMessage.key.id, alternate)
            if (recipients.size > 500) recipients.delete(recipients.keys().next().value)
          }
        }
      } catch { record('transport_decode_failed') }
    },
    normalize(raw) {
      if (!raw?.key?.fromMe) return raw
      // O senderAlt é o próprio vendedor nos ecos enviados pelo telefone.
      // O contato de destino vem de recipientAlt; não trocar o cliente pelo
      // número da empresa quando a conversa estiver endereçada por LID.
      const captured = recipients.get(raw.key.id)
      const alternate = captured || raw.key.remoteJidAlt
      const remoteJidAlt = ownJids.some(jid => areJidsSameUser(jid, alternate)) ? undefined : alternate
      return { ...raw, key: { ...raw.key, remoteJidAlt } }
    },
    upsert(raw) {
      if (direct(raw?.key?.remoteJid)) record(raw.key.fromMe ? 'event_outgoing' : 'event_incoming')
    },
    outcome(raw, outcome) {
      if (direct(raw?.key?.remoteJid)) record(`${raw.key.fromMe ? 'outgoing' : 'incoming'}_${outcome}`)
    },
    protocolLog(args) {
      const label = args.findLast(value => typeof value === 'string')
      const event = protocolEvents.get(label)
      if (event) record(event)
    },
    snapshot() { return { startedAt: lastAt.started || null, counts: { ...counts }, lastAt: { ...lastAt } } },
    start() { record('started') },
  }
}
