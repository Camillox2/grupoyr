import { isHumanAgentMessage } from './whatsappAutomation.js'

const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const timestamp = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(dateOnly(value) ? value + 'T12:00:00Z' : value)
  return Number.isFinite(parsed) && (!dateOnly(value) || new Date(parsed).toISOString().slice(0, 10) === value) ? parsed : null
}
export const DEFAULT_SLA_MINUTES = 15
export function normalizeConversationSla(value) {
  const goalMinutes = value?.goalMinutes ?? DEFAULT_SLA_MINUTES
  if (!Number.isInteger(goalMinutes) || goalMinutes < 1 || goalMinutes > 1440) throw Error('Informe uma meta de SLA inteira de 1 a 1440 minutos.')
  return { goalMinutes, clock: 'elapsed', response: 'human' }
}
const sentByHuman = message => isHumanAgentMessage(message) && (!message.deliveryStatus || ['sent', 'delivered', 'read'].includes(message.deliveryStatus))

/** Read-only reconstruction: AI replies and unsent drafts never satisfy human SLA. */
export function conversationMetrics(leads, messages, config, now = Date.now()) {
  const sla = normalizeConversationSla(config)
  const grouped = new Map()
  for (const message of messages) {
    const time = timestamp(message.timestamp)
    if (time === null || time > now || (message.from !== 'client' && !sentByHuman(message))) continue
    if (!grouped.has(message.leadId)) grouped.set(message.leadId, [])
    grouped.get(message.leadId).push({ message, time })
  }
  const result = {}
  for (const lead of leads) {
    const rows = (grouped.get(lead.id) || []).sort((a, b) => a.time - b.time || String(a.message.receivedAt || a.message.timestamp).localeCompare(String(b.message.receivedAt || b.message.timestamp)) || Number(a.message.from !== 'client') - Number(b.message.from !== 'client') || String(a.message.id).localeCompare(String(b.message.id)))
    const boundary = Math.max(timestamp(lead.closedAt) || 0, timestamp(lead.reopenedAt) || 0)
    let pending = null, lastResponseSeconds = null, lastHumanReplyAt = null
    for (const { message, time } of rows) {
      if (time < boundary) continue
      if (message.from === 'client') pending ??= time
      else {
        if (pending !== null) lastResponseSeconds = Math.max(0, Math.floor((time - pending) / 1000))
        lastHumanReplyAt = new Date(time).toISOString()
        pending = null
      }
    }
    const created = timestamp(lead.createdAt)
    const historical = rows.find(row => row.message.from === 'client')?.time ?? null
    result[lead.id] = {
      enteredAt: created !== null ? dateOnly(lead.createdAt) ? lead.createdAt : new Date(created).toISOString() : historical !== null ? new Date(historical).toISOString() : null,
      entrySource: created !== null ? 'created' : historical !== null ? 'history' : 'unknown',
      sla: {
        goalMinutes: sla.goalMinutes, pendingSince: lead.conversationStatus === 'closed' || pending === null ? null : new Date(pending).toISOString(),
        lastHumanReplyAt, lastResponseSeconds, closed: lead.conversationStatus === 'closed',
      },
    }
  }
  return { sla, leads: result }
}

export function registerConversationRoutes(app, { database, requireAuth, photos, now = () => Date.now() }) {
  app.get('/api/conversations/metrics', requireAuth(), (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(conversationMetrics(database.get('leads'), database.get('messages'), database.getSettings().conversationSla, now()))
  })
  app.get('/api/leads/:id/avatar', requireAuth(), async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const lead = database.find('leads', row => row.id === req.params.id)
    if (!lead) return res.status(404).json({ error: 'Contato não encontrado.' })
    try {
      const photo = await photos.get(lead)
      if (!photo) return res.status(204).end()
      res.type('image/webp').send(photo)
    } catch { res.status(204).end() }
  })
}
