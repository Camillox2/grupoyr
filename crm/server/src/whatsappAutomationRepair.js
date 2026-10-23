import { createHash } from 'node:crypto'
import { commitCommercialRecords } from './commercialCommit.js'
import { externalAutomaticReplyKind, isHumanAgentMessage } from './whatsappAutomation.js'
import { getYriaConfiguration, qualificationSummary, recoverQualification } from './yriaCore.js'
import { qualificationLeadPatch } from './yriaLeadFacts.js'

// No provider, transport, notifications or replay of old customer messages.
// Recover only a pause whose exact last action is a verified automatic send.
export function planExternalAutomationRepairs(database, now = new Date()) {
  const messagesByLead = new Map()
  for (const message of database.get('messages')) {
    if (!messagesByLead.has(message.leadId)) messagesByLead.set(message.leadId, [])
    messagesByLead.get(message.leadId).push(message)
  }
  const config = getYriaConfiguration(database.getSettings()).published.config
  const at = now.toISOString(), plans = []
  for (const lead of database.get('leads')) {
    const messages = messagesByLead.get(lead.id) || []
    const automatic = messages.filter(message => externalAutomaticReplyKind(message))
    if (!automatic.length) continue
    const terminal = ['qualified', 'human_requested', 'needs_review', 'technical_handoff', 'awaiting_signature']
    const resumable = lead.aiEnabled === false && Boolean(lead.humanAssumedAt)
      && automatic.some(message => message.timestamp === lead.humanAssumedAt)
      && !messages.some(isHumanAgentMessage)
      && !lead.humanAssumedBy && !lead.aiManualPausedAt && !lead.aiHandoffReason && !lead.archivedAt
      && lead.conversationStatus !== 'closed'
      && ['novo_lead', 'qualificacao_ia'].includes(lead.stage)
      && !terminal.includes(lead.qualificationData?.status)
      && !database.get('contracts').some(contract => contract.leadId === lead.id)
    const changedMessages = automatic.filter(message => message.isAutomated !== true || message.automaticReplyKind !== 'legacy_fallback')
    if (!resumable && !changedMessages.length) continue
    const changes = changedMessages.map(message => ({
      collection: 'messages', expected: message,
      data: { ...message, isAutomated: true, automaticReplyKind: 'legacy_fallback', updatedAt: at },
    }))
    if (resumable) {
      const qualificationData = recoverQualification(lead.qualificationData || {}, messages, config)
      changes.push({ collection: 'leads', expected: lead, data: {
        ...lead, ...qualificationLeadPatch(lead, qualificationData),
        qualificationData, aiSummary: qualificationSummary(qualificationData),
        aiEnabled: true, humanAssumedAt: null, externalAutomationRecoveredAt: at, updatedAt: at,
      } })
    }
    const digest = createHash('sha256').update(JSON.stringify([
      changedMessages.map(message => message.id).sort(), resumable ? lead.humanAssumedAt : null,
    ])).digest('hex').slice(0, 16)
    const id = `external-auto-v1-${lead.id}-${digest}`
    const existing = database.find('integrationCorrections', row => row.id === id)
    // An already-applied audit must never silently re-enable a later manual pause.
    if (existing) continue
    changes.push({ collection: 'integrationCorrections', expected: null, data: {
      id, kind: 'external_automatic_reply', version: 1, leadId: lead.id, appliedAt: at,
      resumed: resumable, leadBefore: resumable ? structuredClone(lead) : null,
      messageMetadataBefore: changedMessages.map(message => ({
        id: message.id, isAutomated: message.isAutomated ?? null,
        automaticReplyKind: message.automaticReplyKind ?? null, updatedAt: message.updatedAt ?? null,
      })),
    } })
    plans.push({ leadId: lead.id, resumed: resumable, reclassified: changedMessages.length, changes })
  }
  return plans
}

export async function repairExternalAutomationReplies(database, { now = new Date() } = {}) {
  await database.ready
  const plans = planExternalAutomationRepairs(database, now)
  let resumed = 0, reclassified = 0
  for (const plan of plans) {
    await commitCommercialRecords(database, plan.changes)
    resumed += Number(plan.resumed)
    reclassified += plan.reclassified
  }
  return { resumed, reclassified }
}
