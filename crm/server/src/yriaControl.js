import { randomUUID } from 'node:crypto'
import { commitCommercialRecords } from './commercialCommit.js'
import { isInFunnel } from './funnel.js'

export const aiControlRevision = lead => lead?.aiControlRevision || ''
export function yriaReplyAllowed(database, leadId, revision, handoffReason = '') {
  const lead = database.find('leads', row => row.id === leadId)
  if (!lead || database.aiControlBlocks?.has(leadId) || lead.aiManualPausedAt || lead.humanAssumedAt
    || !isInFunnel(lead) || lead.funnelArchivedAt || lead.conversationStatus === 'closed'
    || aiControlRevision(lead) !== revision) return false
  return lead.aiEnabled === true || Boolean(handoffReason && lead.aiHandoffReason === handoffReason)
}

export function createYriaControl({ database, cancel = () => {}, emit = () => {}, now = () => new Date() }) {
  const jobs = new Map(), tickets = new Map()
  database.aiControlBlocks ??= new Set()
  return function setControl(leadId, { enabled, revision, actorId }) {
    if (typeof enabled !== 'boolean') return Promise.reject(Object.assign(Error('Informe se deseja ativar ou pausar a IA.'), { status: 400 }))
    if (revision !== undefined && (typeof revision !== 'string' || revision.length > 100)) return Promise.reject(Object.assign(Error('Controle de IA inválido. Atualize a conversa.'), { status: 400 }))
    const ticket = (tickets.get(leadId) || 0) + 1
    tickets.set(leadId, ticket)
    // Block delivery synchronously, before any durable database/network wait.
    database.aiControlBlocks.add(leadId)
    cancel(leadId)
    const apply = async () => {
      await database.ready
      const lead = database.find('leads', row => row.id === leadId)
      if (!lead) throw Object.assign(Error('Lead não encontrado.'), { status: 404 })
      if (enabled && !isInFunnel(lead)) throw Object.assign(Error('Restaure o cartão pela Lixeira antes de reativar a YRIA.'), { status: 409 })
      // A pause always wins. A stale tab cannot silently resume a newer pause.
      if (enabled && revision !== undefined && revision !== aiControlRevision(lead)) throw Object.assign(Error('A IA foi alterada em outra tela. Atualize a conversa antes de reativar.'), { status: 409 })
      const at = now().toISOString()
      const updated = { ...lead, aiEnabled: enabled, aiControlRevision: randomUUID(),
        aiControlChangedAt: at, aiControlChangedBy: actorId,
        aiManualPausedAt: enabled ? null : at, aiManualPausedBy: enabled ? null : actorId,
        humanAssumedAt: enabled ? null : at, updatedAt: at,
        ...(enabled ? { aiHandoffReason: null, qualificationData: { ...(lead.qualificationData || {}), status: 'qualifying', providerFailureCount: 0 } } : {}),
      }
      await commitCommercialRecords(database, [{ collection: 'leads', expected: structuredClone(lead), data: updated }])
      if (tickets.get(leadId) === ticket) database.aiControlBlocks.delete(leadId)
      emit('lead:updated', updated)
      return updated
    }
    const previous = jobs.get(leadId) || Promise.resolve()
    const task = previous.then(apply, apply)
    jobs.set(leadId, task)
    const cleanup = () => {
      if (jobs.get(leadId) === task) { jobs.delete(leadId); tickets.delete(leadId) }
      // Failed writes leave a runtime block; an explicit successful retry clears it.
    }
    task.then(cleanup, cleanup)
    return task
  }
}

export function registerYriaControlRoute(app, { database, requireAuth, cancel, emit, now }) {
  const control = createYriaControl({ database, cancel, emit, now })
  app.put('/api/leads/:id/toggle-ai', requireAuth(), async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try {
      const lead = await control(req.params.id, { enabled: req.body?.enabled, revision: req.body?.revision, actorId: req.user.id })
      res.json(lead)
    } catch (error) {
      res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível confirmar que o controle da IA foi salvo. Os envios locais foram bloqueados por segurança; tente novamente.' })
    }
  })
}
