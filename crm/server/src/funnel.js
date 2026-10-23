import { randomUUID } from 'node:crypto'

export const isInFunnel = lead => !lead.funnelArchive?.at
export const canManageFunnel = (user, lead) => user?.role === 'admin' || !lead.assignedTo || lead.assignedTo === user?.id
export const FUNNEL_STAGES = ['novo_lead','qualificacao_ia','proposta_enviada','contrato_gerado','assinado_entrega','locacao_ativa','finalizado']

export function funnelImpact(database, lead) {
  const contracts = database.filter('contracts', c => c.leadId === lead.id)
  const numbers = new Set(contracts.map(c => c.number || c.contractNumber).filter(Boolean))
  const contractIds = new Set(contracts.map(c => c.id))
  const invoices = database.filter('invoices', i => i.leadId === lead.id || (i.contractNumber && numbers.has(i.contractNumber)))
  const equipmentCount = database.filter('equipments', e => e.currentLeadId === lead.id).length
  const eventCount = database.filter('calendarEvents', e => e.leadId === lead.id || contractIds.has(e.contractId)).length
  const expenseCount = database.filter('contractExpenses', e => e.leadId === lead.id || contractIds.has(e.contractId)).length
  return {
    revision: lead.funnelRevision || '',
    contracts: contracts.map(c => ({id:c.id,number:c.number || c.contractNumber || c.id,status:c.status})),
    invoices: invoices.map(i => ({id:i.id,status:i.status})),
    equipmentCount, eventCount, expenseCount,
    hasLinkedRecords: Boolean(contracts.length || invoices.length || equipmentCount || eventCount || expenseCount),
  }
}

// Removing a card is reversible. Never deletes the client, messages, contracts,
// payment records, attachments, equipment bookings or signing evidence.
export function registerFunnelRoutes(app, { database, requireAuth, emit = () => {} }) {
  const wrap = fn => async (req,res) => {
    try { await database.ready; res.setHeader('Cache-Control','no-store'); await fn(req,res) }
    catch { if (!res.headersSent) res.status(503).json({error:'Não foi possível salvar a alteração no banco. Atualize o funil e tente novamente.'}) }
  }
  const find = (req,res) => {
    const lead = database.find('leads', l => l.id === req.params.id)
    if (!lead) { res.status(404).json({error:'Oportunidade não encontrada.'}); return null }
    if (!canManageFunnel(req.user,lead)) { res.status(403).json({error:'Somente o responsável pela oportunidade ou um administrador pode excluir ou restaurar este cartão.'}); return null }
    return lead
  }
  const persist = async (lead, updates) => {
    const updated = database.update('leads',lead.id,updates)
    try {
      if (database.flush) await database.flush()
      else if (database.writeQueue) await database.writeQueue
      if (database.pool) {
        const result = await database.pool.query("SELECT data->>'funnelRevision' AS revision FROM crm_records WHERE collection = 'leads' AND id = $1",[lead.id])
        if (result.rows[0]?.revision !== updated.funnelRevision) throw new Error('funnel_not_persisted')
      }
    } catch(error) {
      // Keep the failed removal out of the in-memory board as well. Never
      // re-enable AI when recovering a failed write or overwrite a newer action.
      const current=database.find('leads',l=>l.id===lead.id)
      if (current?.funnelRevision===updated.funnelRevision) database.update('leads',lead.id,{
        funnelArchive:lead.funnelArchive || null, funnelRevision:lead.funnelRevision || '',
        funnelRestoredAt:lead.funnelRestoredAt || null, funnelRestoredBy:lead.funnelRestoredBy || null,
      })
      throw error
    }
    emit('lead:updated',updated)
    return updated
  }
  const stale = (req,res,lead) => {
    if (req.body.revision !== (lead.funnelRevision || '')) {
      res.status(409).json({error:'Este cartão foi alterado em outra tela. Atualize o funil antes de continuar.'})
      return true
    }
    return false
  }
  app.get('/api/leads/:id/funnel-impact',requireAuth(),wrap(async(req,res)=>{
    const lead=find(req,res); if (lead) res.json(funnelImpact(database,lead))
  }))
  app.post('/api/leads/:id/funnel-archive',requireAuth(),wrap(async(req,res)=>{
    const lead=find(req,res); if (!lead) return
    if (!isInFunnel(lead)) return res.json({lead})
    if (stale(req,res,lead)) return
    const reason=typeof req.body.reason === 'string' ? req.body.reason.trim().replace(/\s+/g,' ').slice(0,250) : ''
    if (reason.length<3) return res.status(400).json({error:'Informe o motivo da exclusão do funil.'})
    const impact=funnelImpact(database,lead)
    if (impact.hasLinkedRecords && req.body.acknowledgeLinked !== true) return res.status(409).json({error:'Este cartão possui vínculos. Confirme que contratos, cobranças e equipamentos não serão cancelados.',impact})
    const now=new Date().toISOString()
    const updated=await persist(lead,{
      funnelArchive:{at:now,by:req.user.id,byName:req.user.name || 'Equipe',reason},
      funnelRevision:randomUUID(), aiEnabled:false, humanAssumedAt:now,
    })
    res.json({lead:updated})
  }))
  app.post('/api/leads/:id/funnel-restore',requireAuth(),wrap(async(req,res)=>{
    const lead=find(req,res); if (!lead) return
    if (isInFunnel(lead)) return res.json({lead})
    if (stale(req,res,lead)) return
    const updated=await persist(lead,{
      funnelArchive:null, funnelRevision:randomUUID(),
      funnelRestoredAt:new Date().toISOString(), funnelRestoredBy:req.user.id,
      aiEnabled:false, // Restoring a card must not restart customer messaging.
    })
    res.json({lead:updated})
  }))
}
