// Explicit, short-lived local recovery request. Default history imports still
// refuse unknown contacts. This never sends a customer-facing message.
export function activeHistoryRecovery(record, now = Date.now()) {
  if (!record || record.authorized !== true || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.id || '')
    || !['requested','requesting','waiting_phone','receiving'].includes(record.status)) return null
  const from = Date.parse(record.from), until = Date.parse(record.until), expires = Date.parse(record.expiresAt)
  if (![from,until,expires].every(Number.isFinite) || from > until || until - from > 2 * 86400000
    || until > now + 60000 || expires <= now || expires > now + 86400000) return null
  return { id: record.id, from, until, actorId: record.actorId || 'local-operator' }
}

export function recoveryAllowsMessage(raw, scope) {
  if (!scope) return false
  const normalized = value => String(value || '').replace(/:\d+(?=@)/, '')
  if ((scope.ownJids || []).some(jid => [raw?.key?.remoteJid, raw?.key?.remoteJidAlt].map(normalized).includes(normalized(jid)))) return false
  const numeric = Number(raw?.messageTimestamp?.toString?.() ?? raw?.messageTimestamp)
  const timestamp = numeric > 1e12 ? numeric : numeric * 1000
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp >= scope.from && timestamp <= scope.until
}

export function createHistoryRecovery({ read, write, now = Date.now, log = () => {} }) {
  let healthy = true
  const save = patch => { try { const record = read(); if (!record) return false; write({ ...record, ...patch, updatedAt: new Date(now()).toISOString() }); return true } catch { healthy = false; log('Não foi possível salvar a solicitação de recuperação; importação de contatos desconhecidos bloqueada.'); return false } }
  let started = false
  let requestedAt = null
  let packets = 0
  return {
    scope() { return healthy ? activeHistoryRecovery(read(), now()) : null },
    packet(count) {
      if (!this.scope()) return
      packets++
      save({ status: 'receiving', packets, receivedMessages: (read().receivedMessages || 0) + count, lastPacketAt: new Date(now()).toISOString() })
    },
    counts(contacts, messages) { if (this.scope()) save({ importedContacts: contacts, importedMessages: messages }) },
    async request(socket, notifications = []) {
      if (started || read()?.status !== 'requested' || !this.scope() || !socket?.requestPlaceholderResend) return false
      // Consume before any network wait; reconnects must never hammer the phone.
      started = true; requestedAt = now(); if (!save({ status: 'requesting', requestedAt: new Date(requestedAt).toISOString() })) return false
      const unique = new Map(notifications.filter(message => message?.key?.id).map(message => [message.key.id,message.key]))
      const keys = [...unique.values()].slice(-3)
      let requested = 0
      for (const key of keys) {
        if (!this.scope()) break
        try { if (await socket.requestPlaceholderResend(key)) requested++ } catch { /* Report counts, never claim a phone response. */ }
      }
      if (this.scope()) save({ status: packets ? 'receiving' : 'waiting_phone', requestedNotifications: requested })
      log(`Recuperação limitada: ${requested} solicitação(ões) de reenvio ao telefone; sem mensagens aos clientes.`)
      return true
    },
    finish() {
      if (!started || requestedAt === null || now() - requestedAt < 90000) return false
      const record = read()
      if (!record || !['requesting','waiting_phone','receiving'].includes(record.status)) return false
      save({ status: packets ? 'partial' : 'no_phone_response', finishedAt: new Date(now()).toISOString() })
      log(packets ? 'Recuperação recebeu pacotes; cobertura completa não é garantida.' : 'O telefone não devolveu os pacotes solicitados. Nenhum histórico completo foi confirmado.')
      return true
    },
  }
}
