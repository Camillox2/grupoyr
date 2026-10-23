import { randomUUID } from 'node:crypto'
import { chronological } from './yriaCore.js'
import { qualificationLeadPatch } from './yriaLeadFacts.js'
import { aiControlRevision, yriaReplyAllowed } from './yriaControl.js'

export function createYriaResponder({ database, evaluate, send, emit = () => {}, push = async () => {}, automationService }) {
  const queues = new Map()
  const handled = (leadId, id) => database.find('messages', m => m.leadId === leadId && m.from === 'ai' && (m.inReplyToMessageId === id || m.inReplyToMessageIds?.includes(id)))
  const respond = async function respond(lead, message, mediaBuffer = null) {
    if (handled(lead.id, message.id)) return
    const existing = queues.get(lead.id)
    if (existing && !existing.cancelled) {
      if (!existing.some(item => item.message.id === message.id)) existing.push({ message, mediaBuffer })
      return
    }
    const queue = [{ message, mediaBuffer }]
    queues.set(lead.id, queue)
    try {
      while (queue.length && !queue.cancelled) {
        await new Promise(resolve => setTimeout(resolve, 250))
        let latest = database.find('leads', l => l.id === lead.id)
        const revision = aiControlRevision(latest)
        const allowed = handoffReason => !queue.cancelled && yriaReplyAllowed(database, lead.id, revision, handoffReason)
        if (!allowed()) break
        const seen = new Set()
        const batch = queue.splice(0).filter(item => {
          if (seen.has(item.message.id) || handled(lead.id, item.message.id)) return false
          seen.add(item.message.id)
          return true
        })
        if (!batch.length) continue
        const last = batch.at(-1)
        const mediaItem = [...batch].reverse().find(item => item.mediaBuffer && ['audio','image'].includes(item.message.type))
        const input = { ...last.message, content: batch.map(item => item.message.content || '').join('\n'), ...(mediaItem ? { media: { base64: mediaItem.mediaBuffer.toString('base64'), mimeType: mediaItem.message.mediaMimeType } } : {}) }
        const ids = batch.map(item => item.message.id)
        let result = await evaluate({ previous: latest.qualificationData || {}, messages: chronological(database.filter('messages', m => m.leadId === lead.id)), message: input })
        latest = database.find('leads', l => l.id === lead.id)
        // A person can assume while the provider is still running. Never compete.
        if (!allowed()) break
        // New messages invalidate this result, including any unconfirmed commercial draft.
        if (queue.length) { queue.unshift(...batch); continue }
        let automatic=null
        if(result.automation){
          try{
            if(!automationService)throw Error('Automation unavailable')
            automatic=await automationService.fulfill({leadId:lead.id,automation:result.automation,state:result.state,inReplyToMessageId:last.message.id,inReplyToMessageIds:ids})
            result={...result,state:automatic.state,reply:automatic.reply,handoff:true,reason:'awaiting_signature'}
          }catch{
            if (!allowed()) break
            result={...result,state:{...result.state,status:'needs_review'},handoff:true,reason:'needs_review',reply:'Não foi possível concluir a geração com segurança. Vou passar para um consultor conferir estoque, dados e valores. Nenhum pagamento ou entrega foi confirmado.'}
          }
        }
        // Contract/freight persistence may have yielded to a manual pause.
        if (!allowed(automatic ? 'awaiting_signature' : '')) {
          if (automatic?.message && ['prepared', 'sending'].includes(automatic.message.deliveryStatus)) await automationService.delivery({messageId:automatic.message.id,contractId:automatic.contract.id,status:'cancelled'})
          break
        }
        if(!automatic)database.update('leads', lead.id, { qualificationData: result.state, aiSummary: result.summary, aiLastProvider: result.provider })
        if (!result.reply) continue
        const settings = database.getSettings(), users = database.get('users')
        const assignee = users.find(u => u.id === latest.assignedTo) || users.find(u => u.id === settings.defaultLeadAssigneeId) || users.find(u => u.role === 'admin')
        const aiMessage = automatic?.message || database.insert('messages', { id: `msg_${randomUUID()}`, leadId: lead.id, from: 'ai', type: 'text', content: result.reply, modelUsed: result.provider.ok === true ? (result.provider.model || 'roteiro-seguro') : 'roteiro-seguro', providerAttemptedModel: result.provider.model || '', providerCode: result.provider.code || '', inReplyToMessageId: last.message.id, inReplyToMessageIds: ids, deliveryStatus: 'sending', timestamp: new Date().toISOString() })
        // Persist handoff before emitting a reply; concurrent inbound events cannot restart the AI.
        const fields = result.state.fields
        const updated = automatic ? database.update('leads',lead.id,{...(assignee?{assignedTo:assignee.id}:{}),aiSummary:result.summary,aiLastProvider:result.provider}) : database.update('leads', lead.id, {
          ...qualificationLeadPatch(latest, result.state),
          stage: latest.stage === 'novo_lead' ? 'qualificacao_ia' : latest.stage,
          ...(fields.name?.status === 'confirmed' ? { name: fields.name.value } : {}),
          ...(fields.equipmentInterest?.status === 'confirmed' ? { equipmentInterest: fields.equipmentInterest.value } : {}),
          ...(fields.modality?.status === 'confirmed' ? { modality: fields.modality.value } : {}),
          ...(fields.estimatedPeriod?.status === 'confirmed' ? { estimatedPeriod: fields.estimatedPeriod.value } : {}),
          ...(assignee ? { assignedTo: assignee.id } : {}),
          ...(result.reason === 'order_prepared' ? { yriaOrderDraft: result.state.sales.draft } : {}),
          ...(result.state.qualified ? { qualificationCompletedAt: latest.qualificationCompletedAt || new Date().toISOString() } : {}),
          ...(result.handoff ? { aiEnabled: false, aiHandoffReason: result.reason } : {}),
        })
        emit('message:new', aiMessage)
        emit('lead:updated', updated)
        const sendAllowed = () => allowed(result.handoff ? result.reason : '') && !queue.length
        const cancelPending = async () => {
          if (automatic) await automationService.delivery({ messageId: aiMessage.id, contractId: automatic.contract.id, status: 'cancelled' })
          else database.update('messages', aiMessage.id, { deliveryStatus: 'cancelled', cancellationReason: 'ai_paused_or_changed' })
          emit('message:updated', database.find('messages', row => row.id === aiMessage.id))
        }
        if (!sendAllowed()) { await cancelPending(); break }
        let delivered = false
        if(automatic){
          const current=database.find('leads',l=>l.id===lead.id)
          if(aiMessage.deliveryStatus==='prepared'&&sendAllowed()&&!current.humanAssumedAt&&database.getSettings().yria?.published?.config?.automaticContractsEnabled===true){
            await automationService.delivery({messageId:aiMessage.id,contractId:automatic.contract.id,status:'sending'})
            if (!sendAllowed()) { await cancelPending(); break }
            let status='pending_connection'
            try{delivered=await send(latest.phone,result.reply,{isAllowed:sendAllowed});status=delivered?'sent':sendAllowed()?'pending_connection':'cancelled'}catch{status='delivery_unknown'}
            await automationService.delivery({messageId:aiMessage.id,contractId:automatic.contract.id,status})
          }
        }else{
          try { delivered = await send(latest.phone, result.reply, { isAllowed: sendAllowed }) } catch { /* Keep visible pending state, never claim delivered. */ }
          database.update('messages',aiMessage.id,{deliveryStatus:delivered?'sent':sendAllowed()?'pending_connection':'cancelled'})
        }
        const deliveredMessage = database.find('messages',m=>m.id===aiMessage.id)
        emit('message:updated', deliveredMessage)
        if (!sendAllowed()) break
        if ((result.handoff || (!result.provider.ok && result.state.providerFailureCount === 1)) && assignee) {
          const notification = database.insert('notifications', {
            id: `ntf_${randomUUID()}`, recipientId: assignee.id, leadId: lead.id,
            kind: result.reason === 'qualified' ? 'lead_qualified' : 'ai_handoff',
            title: automatic ? 'Contrato gerado pela YRIA' : result.reason === 'order_prepared' ? 'Pedido preparado pela YRIA' : result.reason === 'qualified' ? 'Lead qualificado pela YRIA' : result.handoff ? 'Conversa precisa de atendimento' : 'YRIA em roteiro de contingência',
            message: automatic ? updated.name+': contrato '+automatic.contract.number+'. '+(delivered?'Link enviado ao WhatsApp.':'Confira/reenvie o link: entrega não confirmada.')+' Assinatura, pagamento e logística pendentes.' : result.reason === 'order_prepared' ? `${updated.name}: confira o pedido na ficha; assinatura e pagamento pendentes.` : result.reason === 'qualified' ? `${updated.name}: dados comerciais registrados.` : result.handoff ? `${updated.name}: ${result.reason === 'human_requested' ? 'cliente pediu uma pessoa' : 'confira as pendências do atendimento'}.` : `${updated.name}: falha do provedor; triagem segura continua sem inventar dados.`,
            createdAt: new Date().toISOString(), readAt: null,
          })
          emit('notification:new', { id: notification.id, recipientId: assignee.id })
          if (result.handoff) void push(assignee.id, { title: notification.title, body: notification.message, url: `/?leadId=${encodeURIComponent(lead.id)}`, tag: `lead-${lead.id}` }).catch(() => {})
        }
      }
    } finally { if (queues.get(lead.id) === queue) queues.delete(lead.id) }
  }
  respond.cancel = leadId => {
    const queue = queues.get(leadId)
    if (queue) { queue.cancelled = true; queue.length = 0 }
  }
  return respond
}
