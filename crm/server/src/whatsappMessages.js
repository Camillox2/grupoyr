import { randomUUID } from 'node:crypto'
import { BufferJSON, normalizeMessageContent } from '@whiskeysockets/baileys'
import { phoneKey } from './phone.js'
import { externalAutomaticReplyKind, isExternalAutomaticPacket } from './whatsappAutomation.js'
import { recoveryAllowsMessage } from './whatsappRecovery.js'

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'file', 'sticker'])
const labels = { image: '[Imagem]', audio: '[Áudio]', video: '[Vídeo]', file: '[Arquivo]', sticker: '[Figurinha]' }
const normalizedJid = (jid) => String(jid || '').replace(/:\d+(?=@)/, '')
const isDirectJid = (jid) => /@(s\.whatsapp\.net|lid)$/.test(normalizedJid(jid))

export function whatsappTimestamp(value, now = Date.now()) {
  const numeric = Number(value?.toString?.() ?? value)
  const milliseconds = numeric > 1e12 ? numeric : numeric * 1000
  return new Date(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds < now + 86400000 ? milliseconds : now).toISOString()
}

export function parseWhatsAppMessage(raw) {
  let content = normalizeMessageContent(raw?.message)
  // Histórico e respostas recuperadas do telefone podem manter o envelope
  // de outro dispositivo, mesmo quando o evento ao vivo já vem desembrulhado.
  for (let i = 0; i < 5 && content?.deviceSentMessage?.message; i++) content = normalizeMessageContent(content.deviceSentMessage.message)
  if (!content) return null
  const text = content.conversation ?? content.extendedTextMessage?.text
  if (typeof text === 'string' && text.trim()) return { type: 'text', content: text, message: content }
  const candidates = [
    ['imageMessage', 'image', 'image/jpeg'], ['audioMessage', 'audio', 'audio/ogg'],
    ['videoMessage', 'video', 'video/mp4'], ['ptvMessage', 'video', 'video/mp4'],
    ['documentMessage', 'file', 'application/octet-stream'], ['stickerMessage', 'sticker', 'image/webp'],
  ]
  for (const [field, type, fallbackMime] of candidates) {
    const media = content[field]
    if (!media) continue
    return {
      type, content: media.caption || labels[type],
      mimeType: media.mimetype || fallbackMime,
      fileName: String(media.fileName || media.title || `${type}-${raw.key?.id || 'whatsapp'}${({ image: '.jpg', audio: '.ogg', video: '.mp4', sticker: '.webp' })[type] || ''}`).slice(0, 180),
      mediaIsGif: type === 'video' && media.gifPlayback === true,
      mediaIsAnimated: type === 'sticker' && media.isAnimated === true,
      message: field === 'ptvMessage' ? { videoMessage: media } : content,
    }
  }
  // Recibos, protocolos, chaves e reações não são documentos.
  return null
}

export const encodeWhatsAppSource = (message) => JSON.stringify(message, BufferJSON.replacer)
export const decodeWhatsAppSource = (value) => value ? JSON.parse(value, BufferJSON.reviver) : null

export function serializeWhatsAppMessage(message) {
  if (!message) return message
  const { mediaStorageKey, mediaBinaryFileId, whatsappSource, whatsappKey, ...safe } = message
  const hasMedia = mediaStorageKey || mediaBinaryFileId || (whatsappSource && MEDIA_TYPES.has(message.type))
  return hasMedia
    ? { ...safe, mediaUrl: `/api/leads/${encodeURIComponent(message.leadId)}/messages/${encodeURIComponent(message.id)}/media` }
    : safe
}

export function findWhatsAppLead(database, ...jids) {
  const normalized = jids.filter(Boolean).map(normalizedJid)
  const phoneKeys = normalized.filter(jid => jid.endsWith('@s.whatsapp.net')).map(jid => phoneKey(jid.split('@')[0]))
  return database.find('leads', lead => normalized.includes(normalizedJid(lead.whatsappJid))
    || normalized.includes(normalizedJid(lead.whatsappLid))
    || phoneKeys.filter(Boolean).includes(phoneKey(lead.phone)))
}

export function createBaileysMessageIngestor({ database, download, storeMedia, emit = () => {}, respond = async () => {}, resolvePhone = async () => null, ownMessageIds = new Set(), observe = () => {} }) {
  let lastReceivedAt = 0
  return async function ingest(raw, { historical = false, live = true, historyImport = null, deferMedia = false } = {}) {
    const skip = reason => { observe(raw, reason); return null }
    if (!isDirectJid(raw?.key?.remoteJid)) return skip('ignored_chat')
    const parsed = parseWhatsAppMessage(raw)
    if (!parsed) return skip(raw.messageStubType ? 'unreadable' : 'control')
    const sourceId = raw.key.id
    if (raw.key.fromMe && ownMessageIds.has(sourceId)) return skip('crm_echo')
    const remoteJid = normalizedJid(raw.key.remoteJid)
    let phoneJid = [raw.key.remoteJidAlt, remoteJid].map(normalizedJid).find(jid => jid.endsWith('@s.whatsapp.net'))
    let lead = findWhatsAppLead(database, remoteJid, raw.key.remoteJidAlt, phoneJid)
    if (!phoneJid && remoteJid.endsWith('@lid')) {
      // Um mapa ainda não disponível não pode impedir o atendimento de um
      // contato já conhecido por LID. O número confirmado dele serve de base.
      if (lead?.phone) phoneJid = `${String(lead.phone).replace(/\D/g, '')}@s.whatsapp.net`
      else {
        try { phoneJid = await resolvePhone(remoteJid) }
        catch { phoneJid = null }
        lead = findWhatsAppLead(database, remoteJid, raw.key.remoteJidAlt, phoneJid)
      }
    }
    const recovering = historical && recoveryAllowsMessage(raw, historyImport)
    if (historical && !lead && !recovering) return skip('unknown_history') // Unknown history requires a bounded operator request.
    if (!lead && !phoneJid) return skip('unmapped_contact') // Um LID não é um número de telefone.
    const outgoing = raw.key.fromMe === true
    const automaticPacket = isExternalAutomaticPacket(raw, parsed)
    const timestamp = whatsappTimestamp(raw.messageTimestamp)
    const phone = phoneJid?.split('@')[0]
    const newLead = !lead
    if (!lead) {
      const settings = database.getSettings()
      const users = database.get('users')
      const assignee = users.find(user => user.id === settings.defaultLeadAssigneeId) || users.find(user => user.role === 'admin')
      lead = database.insert('leads', {
        id: `lead_${randomUUID()}`, name: !outgoing && raw.pushName ? String(raw.pushName).slice(0, 120) : 'Contato WhatsApp',
        phone, email: '', stage: 'novo_lead', origin: 'WhatsApp Direto', utmSource: 'whatsapp', utmMedium: 'direct', utmCampaign: 'organic_chat',
        equipmentInterest: 'A definir', modality: 'locacao', estimatedPeriod: '', aiSummary: '', aiEnabled: historical ? false : !outgoing || automaticPacket,
        ...(recovering ? { historyRecoveryId: historyImport.id, historyImportedAt: new Date().toISOString(), aiManualPausedAt: new Date().toISOString(), aiManualPausedBy: historyImport.actorId } : {}),
        lastInteraction: timestamp, ...(!outgoing ? { lastInboundAt: timestamp } : {}),
        assignedTo: assignee?.id, value: 0, notes: 'Contato sincronizado do WhatsApp.', conversationStatus: 'open', createdAt: timestamp,
      })
    }
    let existing = sourceId && database.find('messages', item => item.leadId === lead.id && item.sourceMessageId === sourceId)
    // Envios antigos do CRM não tinham o ID WhatsApp. Vincular o eco exato
    // mantém a autoria da IA/vendedor sem duplicar mensagens já registradas.
    if (!existing && outgoing) existing = database.find('messages', item => item.leadId === lead.id
      && ['agent', 'ai'].includes(item.from) && !item.sourceMessageId && item.type === parsed.type
      && item.content === parsed.content && Math.abs(Date.parse(item.timestamp) - Date.parse(timestamp)) <= 5000)
    if (existing?.sourceMessageId && existing.whatsappSource && (parsed.type === 'text' || existing.mediaBinaryFileId || existing.mediaStorageKey)) { observe(raw, 'duplicate'); return existing }

    const media = MEDIA_TYPES.has(parsed.type)
    const source = { ...raw, message: parsed.message }
    let buffer = null
    let storage = null
    if (media && !deferMedia && !existing?.mediaBinaryFileId && !existing?.mediaStorageKey) {
      try {
        buffer = await download(source)
        storage = await storeMedia(buffer, lead.id, parsed.mimeType, parsed.fileName)
      } catch { /* Guardar a origem privada permite tentar novamente pelo endpoint de mídia. */ }
    }
    const messageData = {
      sourceMessageId: sourceId, leadId: lead.id, from: outgoing ? (['agent', 'ai'].includes(existing?.from) ? existing.from : 'agent') : 'client',
      type: parsed.type, content: parsed.content, timestamp,
      receivedAt: existing?.receivedAt || new Date(lastReceivedAt = Math.max(Date.now(), lastReceivedAt + 1)).toISOString(),
      ...(recovering && !existing ? { historyRecoveryId: historyImport.id } : {}),
      whatsappKey: raw.key, whatsappSource: encodeWhatsAppSource(source),
      ...(outgoing ? { deliveryStatus: existing?.deliveryStatus || 'sent', sentVia: existing?.sentVia || 'whatsapp_business' } : {}),
      ...(media ? { mediaMimeType: parsed.mimeType, mediaFileName: parsed.fileName, mediaIsGif: parsed.mediaIsGif, mediaIsAnimated: parsed.mediaIsAnimated,
        mediaStatus: storage ? 'available' : 'pending', ...(storage || {}), ...(buffer ? { mediaSize: buffer.length } : {}) } : {}),
    }
    const automaticReplyKind = externalAutomaticReplyKind({ ...existing, ...messageData })
    if (automaticReplyKind) Object.assign(messageData, { isAutomated: true, automaticReplyKind })
    const saved = existing ? database.update('messages', existing.id, messageData) : database.insert('messages', { id: `msg_${randomUUID()}`, ...messageData })
    const updates = {
      whatsappJid: phoneJid || remoteJid,
      ...(remoteJid.endsWith('@lid') ? { whatsappLid: remoteJid } : {}),
      ...(phone ? { phone } : {}),
      ...(Date.parse(timestamp) > Date.parse(lead.lastInteraction || '1970-01-01') ? { lastInteraction: timestamp } : {}),
      ...(!outgoing && Date.parse(timestamp) > Date.parse(lead.lastInboundAt || '1970-01-01') ? { lastInboundAt: timestamp } : {}),
    }
    if (recovering && !outgoing && raw.pushName && /^(?:Contato WhatsApp|Cliente WhatsApp\s*\(|[+\d\s().-]+$)/i.test(lead.name || '')) updates.name = String(raw.pushName).slice(0, 120)
    if (!historical && !existing) {
      if (!outgoing && raw.pushName && /^(?:Contato WhatsApp|Cliente WhatsApp\s*\(|[+\d\s().-]+$)/i.test(lead.name || '')) updates.name = String(raw.pushName).slice(0, 120)
      if (outgoing && !automaticReplyKind && (live || Date.parse(timestamp) > Date.parse(lead.lastInteraction || '1970-01-01'))) Object.assign(updates, { aiEnabled: false, humanAssumedAt: timestamp })
      if (!automaticReplyKind && lead.conversationStatus === 'closed' && Date.parse(timestamp) >= Date.parse(lead.closedAt || '1970-01-01')) Object.assign(updates, { conversationStatus: 'open', reopenedAt: timestamp })
    }
    lead = database.update('leads', lead.id, updates)
    emit(existing ? 'message:updated' : 'message:new', serializeWhatsAppMessage(saved))
    emit(newLead ? 'lead:new' : 'lead:updated', lead)
    // A IA tem sua própria fila. Não bloquear a sincronização do vendedor
    // enquanto o provedor está gerando uma resposta.
    if (!outgoing && !historical && live && !existing && lead.aiEnabled && parsed.type !== 'sticker' && !parsed.mediaIsGif) Promise.resolve(respond(lead, saved, buffer)).catch(() => {})
    observe(raw, 'stored')
    return saved
  }
}

export function recordWhatsAppCall(database, call, emit = () => {}) {
  if (!call?.id || call.isGroup || !['offer', 'ringing', 'accept', 'reject', 'timeout', 'terminate'].includes(call.status)) return null
  const lead = findWhatsAppLead(database, call.callerPn, call.from)
  if (!lead) return null
  const id = `call_${call.id}`
  const existing = database.find('messages', item => item.id === id && item.leadId === lead.id)
  // Eventos de sinalização atrasados não podem reabrir uma chamada encerrada.
  const rank = { offer: 0, ringing: 0, accept: 1, reject: 2, timeout: 2, terminate: 2 }
  if (existing && (['reject', 'timeout', 'terminate'].includes(existing.callStatus) || rank[call.status] < rank[existing.callStatus])) return existing
  const isVideo = call.isVideo ?? existing?.callIsVideo ?? false
  const kind = isVideo ? 'vídeo' : 'voz'
  const states = { offer: 'recebida. Atenda no WhatsApp.', ringing: 'recebida. Atenda no WhatsApp.', accept: 'atendida no WhatsApp.', reject: 'recusada no WhatsApp.', timeout: 'não atendida.', terminate: 'encerrada no WhatsApp.' }
  const data = { leadId: lead.id, from: 'system', type: 'call', content: `Chamada de ${kind} ${states[call.status]}`, callStatus: call.status, callIsVideo: !!isVideo,
    timestamp: existing?.timestamp || new Date(call.date || Date.now()).toISOString() }
  const saved = existing ? database.update('messages', id, data) : database.insert('messages', { id, ...data })
  emit(existing ? 'message:updated' : 'message:new', serializeWhatsAppMessage(saved))
  return saved
}
