import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import axios from 'axios'
import pino from 'pino'
import { db } from './db.js'
import { evaluateYria } from './yriaService.js'
import { createYriaResponder } from './yriaResponder.js'
import { automaticContracts } from './automaticRuntime.js'
import { deliverPushToUser } from './push.js'
import { phoneKey } from './phone.js'
import { createBaileysMessageIngestor, decodeWhatsAppSource, findWhatsAppLead, parseWhatsAppMessage, recordWhatsAppCall, serializeWhatsAppMessage, whatsappTimestamp } from './whatsappMessages.js'
import { notifyBaileysDisconnect } from './whatsappNotifications.js'
import { createHistorySyncTracker, serializeHistoryJob } from './whatsappHistorySync.js'
import { createWhatsAppIngress } from './whatsappIngress.js'
import { isExternalAutomaticPacket } from './whatsappAutomation.js'
import { createHistoryRecovery } from './whatsappRecovery.js'
import { AI_HANDOFF_MESSAGE, buildQualificationReply, generateStructuredQualification } from './gemini.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'data', 'baileys_auth')
const DATA_DIR = path.dirname(AUTH_DIR)
const RECOVERY_FILE = path.join(__dirname, '../../.runtime/whatsapp-history-recovery.json')
const WHATSAPP_MEDIA_DIR = path.join(DATA_DIR, 'uploads', 'whatsapp')
fs.mkdirSync(WHATSAPP_MEDIA_DIR, { recursive: true })

const mediaExtension = (mimeType, originalName = '') => {
  const known = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/webm': '.webm',
    'video/mp4': '.mp4', 'video/3gpp': '.3gp', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'application/pdf': '.pdf',
  }
  if (known[mimeType]) return known[mimeType]
  const extension = path.extname(String(originalName || '')).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin'
}

const META_SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png',
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
  'video/mp4', 'video/3gpp',
  'text/plain', 'application/pdf', 'application/msword',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export const isMetaMediaTypeSupported = (mimeType) => META_SUPPORTED_MEDIA_TYPES.has(String(mimeType || '').split(';')[0].trim().toLowerCase())

const saveWhatsAppMedia = async (buffer, leadId, mimeType, originalName) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null
  const id = `wa_${randomUUID()}`
  try {
    const stored = await db.putBinaryFile({
      id,
      ownerId: leadId,
      kind: 'whatsapp_media',
      mimeType: mimeType || 'application/octet-stream',
      fileName: String(originalName || 'mídia WhatsApp').slice(0, 180),
      data: buffer,
    })
    if (stored) return { mediaBinaryFileId: id }
  } catch (error) {
    console.warn('[Files] Não foi possível guardar a mídia do WhatsApp no Neon; mantendo cópia local:', error?.message || error)
  }
  const folder = String(leadId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const targetDirectory = path.join(WHATSAPP_MEDIA_DIR, folder)
  fs.mkdirSync(targetDirectory, { recursive: true })
  const fileName = `${randomUUID()}${mediaExtension(mimeType, originalName)}`
  fs.writeFileSync(path.join(targetDirectory, fileName), buffer)
  return { mediaStorageKey: path.relative(DATA_DIR, path.join(targetDirectory, fileName)) }
}

const toClientMessage = serializeWhatsAppMessage

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
}

class WhatsAppService {
  constructor() {
    this.io = null
    this.socket = null
    this.qrCode = null
    this.status = 'disconnected' // disconnected | connecting | connected | qr_ready
    this.connectedNumber = null
    this.pairingCode = null
    this.activeProvider = 'baileys' // 'baileys' | 'meta'
    this.connectionAttempt = 0
    this.reconnectTimer = null
    this.manualDisconnect = false
    this.disconnectNotificationSent = false
    this.lastError = null
    this.qrGeneratedAt = null
    this.pairingProtectionUntil = 0
    this.aiBusyLeads = new Set()
    this.ownMessageIds = new Set()
    this.messageQueue = Promise.resolve()
    this.mediaRecovery = new Map()
    this.historyRequested = false
    this.historyRequests = new Map()
    this.historySync = { requested: 0, received: 0, requestedAt: null, lastEventAt: null }
    this.historyRecovery = createHistoryRecovery({
      read: () => { try { return JSON.parse(fs.readFileSync(RECOVERY_FILE, 'utf8')) } catch { return null } },
      write: record => fs.writeFileSync(RECOVERY_FILE, JSON.stringify(record, null, 2), { mode: 0o600 }),
      log: text => console.log('[WhatsApp/Baileys] ' + text),
    })
    this.instanceId = randomUUID()
    this.ingress = createWhatsAppIngress()
    this.ingress.start()
    this.historyJobs = createHistorySyncTracker({
      emit: job => this.io?.emit('whatsapp:history-sync', serializeHistoryJob(job)),
      persist: async job => { await db.flush(); await db.putWhatsAppHistoryJob(job) },
      onPersistenceError: error => console.warn('[WhatsApp] Falha ao salvar sincronização:', error?.name || 'erro'),
    })
    this.ingestBaileys = createBaileysMessageIngestor({
      database: db,
      ownMessageIds: this.ownMessageIds,
      download: (message) => this.downloadBaileysMedia(message),
      storeMedia: saveWhatsAppMedia,
      emit: (event, payload) => this.io?.emit(event, payload),
      respond: (lead, message, buffer) => this.respondWithAi(lead, message, buffer),
      resolvePhone: (jid) => this.socket?.signalRepository?.lidMapping?.getPNForLID(jid),
      observe: (message, outcome) => this.ingress.outcome(message, outcome),
    })
  }

  init(io) {
    this.io = io
    this.historyJobs.restore(db.get('whatsappHistoryJobs').filter(job => db.find('leads', lead => lead.id === job.leadId)))
    this.historyTimeoutTimer = setInterval(() => this.historyJobs.expire(), 1000)
    this.historyTimeoutTimer.unref()
    const settings = db.getSettings()
    this.activeProvider = process.env.WHATSAPP_PROVIDER || settings.whatsappProvider || 'baileys'

    console.log(`[WhatsApp] Inicializando provedor ativo: ${this.activeProvider}`)
    if (this.activeProvider === 'baileys') {
      this.initBaileys()
    }
  }

  async setActiveProvider(provider) {
    if (!['baileys', 'meta'].includes(provider)) throw new Error('Provedor inválido')
    this.activeProvider = provider
    db.updateSettings({ whatsappProvider: provider })

    if (provider === 'baileys') {
      // Voltando da Meta: restaura o status real do Baileys (senao fotos ficam presas em connected_meta)
      if (this.status === 'connected_meta') this.status = this.socket && this.connectedNumber ? 'connected' : 'disconnected'
      if (!this.socket || this.status === 'disconnected') {
        await this.initBaileys()
      }
    } else {
      // Se alternou para Meta, mantém status conectado se as credenciais existirem
      this.status = 'connected_meta'
      this.broadcastStatus()
    }

    this.broadcastStatus()
    return { provider: this.activeProvider, status: this.status }
  }

  archiveIncompleteSession() {
    if (!fs.existsSync(AUTH_DIR)) return
    const archiveName = `baileys_auth_invalida_${new Date().toISOString().replace(/[:.]/g, '-')}`
    const archivePath = path.join(DATA_DIR, archiveName)
    fs.renameSync(AUTH_DIR, archivePath)
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    console.warn(`[WhatsApp/Baileys] Sessão incompleta arquivada em ${archiveName}. Uma nova sessão será criada.`)
  }

  scheduleReconnect(delay = 3000) {
    if (this.manualDisconnect || this.reconnectTimer || this.activeProvider !== 'baileys') return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.initBaileys()
    }, delay)
  }

  async resetBaileysSession() {
    if (Date.now() < this.pairingProtectionUntil) {
      const error = new Error('O pareamento está em andamento. Aguarde a conexão concluir antes de gerar outro QR Code.')
      error.code = 'PAIRING_IN_PROGRESS'
      throw error
    }
    this.manualDisconnect = false
    this.historyJobs.pauseAll('whatsapp_disconnected')
    this.connectionAttempt += 1
    this.socket = null
    this.qrCode = null
    this.pairingCode = null
    this.connectedNumber = null
    this.lastError = null
    this.archiveIncompleteSession()
    await this.initBaileys()
  }

  async disconnectBaileysSession() {
    this.manualDisconnect = true
    this.historyJobs.pauseAll('whatsapp_disconnected')
    this.connectionAttempt += 1
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const socket = this.socket
    this.socket = null
    this.qrCode = null
    this.pairingCode = null
    this.connectedNumber = null
    this.status = 'disconnected'
    this.lastError = 'Sessão do WhatsApp desconectada pelo administrador.'
    this.broadcastStatus()

    try {
      if (socket?.logout) await socket.logout()
      else socket?.end?.(new Error('Sessão encerrada pelo administrador'))
    } catch (error) {
      console.warn('[WhatsApp/Baileys] A sessão local foi encerrada; o logout remoto retornou erro:', error.message)
    } finally {
      this.archiveIncompleteSession()
      this.broadcastStatus()
    }
  }

  async initBaileys() {
    try {
      if (this.socket && ['connecting', 'qr_ready', 'connected'].includes(this.status)) return

      // Apos o aceite do QR ou codigo, o Baileys reinicia com registered=false.
      // Preserve as credenciais ate confirmar logout ou sessao invalida.
      const attempt = ++this.connectionAttempt
      this.status = 'connecting'
      if (Date.now() >= this.pairingProtectionUntil) this.lastError = null
      this.broadcastStatus()

      const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestWaWebVersion } = await import('@whiskeysockets/baileys')
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
      const { version } = await fetchLatestWaWebVersion()

      this.socket = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        logger: pino({ level: 'debug', hooks: { logMethod: args => this.ingress.protocolLog(args) } }),
        browser: Browsers.ubuntu('Grupo YR CRM'),
        markOnlineOnConnect: false,
        emitOwnEvents: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => true,
        getMessage: async (key) => {
          const saved = db.find('messages', (message) => message.sourceMessageId === key.id)
          return saved?.whatsappSource ? decodeWhatsAppSource(saved.whatsappSource)?.message : saved?.type === 'text' ? { conversation: saved.content } : undefined
        },
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        keepAliveIntervalMs: 15000,
      })
      this.socket.ws.on('CB:message', node => {
        if (attempt === this.connectionAttempt) this.ingress.observeNode(node, this.socket?.user)
      })

      // O WhatsApp envia 515 logo depois que o celular aceita o QR. Antes de
      // criar o socket seguinte, precisamos garantir que as credenciais novas
      // terminaram de ser gravadas. Caso contrário, outro QR é gerado e o
      // vínculo recém-aprovado é perdido.
      let pendingCredsSave = Promise.resolve()
      this.socket.ev.on('creds.update', () => {
        pendingCredsSave = pendingCredsSave
          .then(() => saveCreds())
          .catch((error) => console.error('[WhatsApp/Baileys] Erro ao salvar credenciais:', error))
      })

      this.socket.ev.on('connection.update', async (update) => {
        if (attempt !== this.connectionAttempt) return
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr)
            this.status = 'qr_ready'
            this.qrGeneratedAt = new Date().toISOString()
            console.log('[WhatsApp/Baileys] Novo QR Code gerado para leitura.')
            this.broadcastStatus()
          } catch (e) {
            console.error('[WhatsApp/Baileys] Erro ao converter QR Code:', e)
          }
        }

        if (connection === 'open') {
          this.status = 'connected'
          this.pairingProtectionUntil = 0
          this.disconnectNotificationSent = false
          this.qrCode = null
          this.qrGeneratedAt = null
          this.pairingCode = null
          this.lastError = null
          this.connectedNumber = this.socket.user?.id ? this.socket.user.id.split(':')[0] : 'Conectado'
          console.log(`[WhatsApp/Baileys] Conectado com sucesso! Número: ${this.connectedNumber}`)
          this.broadcastStatus()
          this.resumeInterruptedHistory(attempt).then(() => this.recoverKnownHistory()).catch(() => console.warn('[WhatsApp/Baileys] Histórico ainda indisponível no telefone.'))
          this.historyRecovery.request(this.socket, state.creds.processedHistoryMessages || []).catch(() => console.warn('[WhatsApp/Baileys] Recuperação limitada indisponível no telefone.'))
          const recoveryTimer = setTimeout(() => this.messageQueue.then(() => this.historyRecovery.finish()).catch(() => {}), 95000)
          recoveryTimer.unref()
        }

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode
          const wasConnected = this.activeProvider === 'baileys' && this.status === 'connected'
          console.warn(`[WhatsApp/Baileys] Conexão encerrada. Motivo: ${reason}`)
          await pendingCredsSave
          this.status = 'disconnected'
          this.historyJobs.pauseAll('whatsapp_disconnected')
          this.socket = null
          this.connectedNumber = null
          this.qrCode = null
          this.qrGeneratedAt = null
          this.pairingCode = null

          if (reason === DisconnectReason.restartRequired) {
            this.pairingProtectionUntil = Math.max(this.pairingProtectionUntil, Date.now() + 30000)
          }
          this.lastError = reason === DisconnectReason.restartRequired
            ? 'QR aceito. Finalizando a conexão com o WhatsApp...'
            : reason === DisconnectReason.loggedOut
              ? 'A sessão do WhatsApp expirou. Uma nova leitura do QR Code é necessária.'
              : 'A conexão foi interrompida. O CRM tentará reconectar automaticamente.'

          if (wasConnected && !this.disconnectNotificationSent && !this.manualDisconnect) {
            this.disconnectNotificationSent = true
            try {
              notifyBaileysDisconnect({ database: db, io: this.io, reasonCode: reason })
            } catch (error) {
              console.error('[WhatsApp/Baileys] Não foi possível registrar o aviso de desconexão:', error.message)
            }
          }
          this.broadcastStatus()

          if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
            // Credenciais desconectadas não voltam a gerar QR sozinhas. Arquivamos
            // a sessão para que o próximo socket crie uma vinculação limpa.
            this.archiveIncompleteSession()
          }
          this.broadcastStatus()
          this.scheduleReconnect(reason === DisconnectReason.restartRequired ? 500 : 5000)
        }
      })

      this.socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (attempt !== this.connectionAttempt) return
        const normalized = messages.map(message => this.ingress.normalize(message))
        normalized.forEach(message => this.ingress.upsert(message))
        this.queueBaileysMessages(normalized, { live: type === 'notify' })
      })
      this.socket.ev.on('messaging-history.set', async ({ messages = [], chats = [], progress, syncType, peerDataRequestSessionId }) => {
        if (attempt !== this.connectionAttempt) return
        messages = messages.map(message => this.ingress.normalize(message))
        this.historySync.received += messages?.length || 0
        this.historySync.lastEventAt = new Date().toISOString()
        this.historyRecovery.packet(messages.length)
        console.log(`[WhatsApp/Baileys] Pacote de histórico recebido: ${messages?.length || 0} mensagem(ns).`)
        const historyCounts = new Map()
        const messageLeads = new Map()
        for (const message of messages) {
          if (!parseWhatsAppMessage(message)) continue
          const jid = message.key?.remoteJid
          let phoneJid = jid
          if (jid?.endsWith('@lid')) {
            try { phoneJid = await this.socket?.signalRepository?.lidMapping?.getPNForLID(jid) }
            catch { phoneJid = null }
          }
          const lead = findWhatsAppLead(db, jid, message.key?.remoteJidAlt, phoneJid)
          if (lead) {
            messageLeads.set(message, lead.id)
            historyCounts.set(lead.id, (historyCounts.get(lead.id) || 0) + 1)
          }
        }
        for (const chat of chats) {
          const lead = findWhatsAppLead(db, chat.id, chat.pnJid, chat.lidJid)
          if (lead && !historyCounts.has(lead.id)) historyCounts.set(lead.id, 0)
        }
        // Associar respostas vazias pelo ID da solicitação, sem atribuir
        // um pacote de outra conversa ao contato que está aberto na tela.
        const request = syncType === 6 && this.historyRequests.get(peerDataRequestSessionId)
        const requestedLeadId = request?.leadId
        if (requestedLeadId && !historyCounts.has(requestedLeadId)) historyCounts.set(requestedLeadId, 0)
        if (peerDataRequestSessionId && !request) historyCounts.clear()
        const historyRunIds = new Map([...historyCounts.keys()].map(leadId => [leadId, request?.leadId === leadId ? request.runId : this.historyJobs.get(leadId)?.runId]))
        this.queueBaileysMessages(messages, { historical: true, live: false, historyCounts, historyRunIds, messageLeads, providerProgress: progress })
      })
      this.socket.ev.on('call', async (calls) => {
        if (attempt !== this.connectionAttempt) return
        for (const call of calls) {
          try {
            const callerPn = call.callerPn || (call.from?.endsWith('@lid') ? await this.socket?.signalRepository?.lidMapping?.getPNForLID(call.from) : call.from)
            recordWhatsAppCall(db, { ...call, callerPn }, (event, payload) => this.io?.emit(event, payload))
          } catch { console.warn('[WhatsApp/Baileys] Não foi possível registrar uma chamada.') }
        }
      })
    } catch (err) {
      console.error('[WhatsApp/Baileys] Erro ao iniciar socket:', err)
      this.status = 'disconnected'
      this.lastError = 'Não foi possível iniciar a conexão com o WhatsApp. Tente gerar um novo QR Code.'
      this.broadcastStatus()
      this.scheduleReconnect()
    }
  }

  rememberOwnMessage(message) {
    if (!message?.key?.id) return
    this.ownMessageIds.add(message.key.id)
    if (this.ownMessageIds.size > 1000) this.ownMessageIds.delete(this.ownMessageIds.values().next().value)
  }

  queueBaileysMessages(messages = [], options = {}) {
    const batch = (options.historical ? [...messages].reverse() : [...messages]).sort((a, b) => Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0))
    // Uma intervenção humana pausa a IA imediatamente, mesmo quando um
    // download anterior ainda está aguardando o servidor de mídia.
    if (!options.historical && options.live !== false) for (const message of batch) {
      if (!message.key?.fromMe || this.ownMessageIds.has(message.key.id)) continue
      const parsed = parseWhatsAppMessage(message)
      if (!parsed || isExternalAutomaticPacket(message, parsed)) continue
      const lead = findWhatsAppLead(db, message.key.remoteJid, message.key.remoteJidAlt)
      if (lead && !db.find('messages', item => item.leadId === lead.id && item.sourceMessageId === message.key.id)) db.update('leads', lead.id, { aiEnabled: false, humanAssumedAt: whatsappTimestamp(message.messageTimestamp) })
    }
    this.messageQueue = this.messageQueue.then(async () => {
      for (const [leadId, count] of options.historyCounts || []) this.historyJobs.beginBatch(leadId, count, options.providerProgress, options.historyRunIds?.get(leadId))
      for (const message of batch) {
        const trackedLeadId = options.messageLeads?.get(message)
        const previous = trackedLeadId && db.find('messages', item => item.leadId === trackedLeadId && item.sourceMessageId === message.key?.id)
        const recoveryScope = options.historical || options.live === false ? this.historyRecovery.scope() : null
        const historyImport = recoveryScope ? { ...recoveryScope, ownJids: [this.socket?.user?.id, this.socket?.user?.lid].filter(Boolean) } : null
        try { await this.ingestBaileys(message, { ...options, historical: options.historical || !!historyImport, historyImport, deferMedia: !!historyImport }) }
        catch (error) { this.ingress.outcome(message, 'failed'); console.warn('[WhatsApp/Baileys] Falha ao sincronizar uma mensagem:', error?.name || 'erro') }
        finally { if (trackedLeadId && options.historyCounts?.has(trackedLeadId)) this.historyJobs.processed(trackedLeadId, !previous && !!db.find('messages', item => item.leadId === trackedLeadId && item.sourceMessageId === message.key?.id), options.historyRunIds?.get(trackedLeadId)) }
      }
      const recovery = this.historyRecovery.scope()
      if (recovery) this.historyRecovery.counts(db.filter('leads', lead => lead.historyRecoveryId === recovery.id).length, db.filter('messages', message => message.historyRecoveryId === recovery.id).length)
      for (const [leadId] of options.historyCounts || []) this.historyJobs.finishBatch(leadId, options.historyRunIds?.get(leadId))
    }).catch(() => {})
    return this.messageQueue
  }

  async downloadBaileysMedia(message) {
    if (!this.socket || this.status !== 'connected') throw new Error('WhatsApp desconectado')
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
    return downloadMediaMessage(message, 'buffer', { options: { timeout: 20000 } }, {
      logger: pino({ level: 'silent' }),
      reuploadRequest: this.socket.updateMediaMessage.bind(this.socket),
    })
  }

  async ensureMessageMedia(message) {
    if (message.mediaBinaryFileId || message.mediaStorageKey || !message.whatsappSource) return message
    if (this.mediaRecovery.has(message.id)) return this.mediaRecovery.get(message.id)
    const recovering = (async () => {
      try {
        const source = decodeWhatsAppSource(message.whatsappSource)
        const buffer = await this.downloadBaileysMedia(source)
        const storage = await saveWhatsAppMedia(buffer, message.leadId, message.mediaMimeType, message.mediaFileName)
        if (!storage) return message
        const updated = db.update('messages', message.id, { ...storage, mediaSize: buffer.length, mediaStatus: 'available' })
        this.io?.emit('message:updated', toClientMessage(updated))
        return updated
      } catch {
        return message
      }
    })().finally(() => this.mediaRecovery.delete(message.id))
    this.mediaRecovery.set(message.id, recovering)
    return recovering
  }

  async requestHistorySync(leadId, { resume = false } = {}) {
    const { job, started } = resume ? this.historyJobs.resume(leadId) : this.historyJobs.start(leadId)
    await this.historyJobs.flush()
    if (started) this.recoverKnownHistory(leadId, job.runId).catch(() => this.historyJobs.fail(leadId, job.runId))
    return serializeHistoryJob(this.historyJobs.get(leadId) || job)
  }

  getHistoryJob(leadId) {
    const job = this.historyJobs.get(leadId)
    return job ? serializeHistoryJob(job) : null
  }

  async resumeInterruptedHistory(attempt) {
    await this.historyJobs.flush()
    for (const job of this.historyJobs.resumable()) {
      if (attempt !== this.connectionAttempt || this.status !== 'connected') return
      await this.requestHistorySync(job.leadId, { resume: true })
    }
  }

  async recoverKnownHistory(leadId, runId) {
    if (!this.socket || this.status !== 'connected') { this.historyJobs.pauseAll('whatsapp_disconnected'); return { requested: 0 } }
    if (!leadId && this.historyRequested) return { requested: 0 }
    const leads = db.get('leads').filter(lead => !leadId || lead.id === leadId)
      .sort((a, b) => Date.parse(b.lastInteraction || 0) - Date.parse(a.lastInteraction || 0)).slice(0, 10)
    let requested = 0
    for (const lead of leads) {
      // Não reiniciar automaticamente solicitações concluídas ou expiradas.
      if (!leadId && this.historyJobs.get(lead.id)) continue
      const messages = db.filter('messages', message => message.leadId === lead.id && message.sourceMessageId)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      const latest = messages[0]
      const savedAnchor = this.historyJobs.get(lead.id)?.anchor
      if ((!latest || !lead.whatsappJid) && !savedAnchor) {
        if (leadId) this.historyJobs.unavailable(lead.id, runId)
        continue
      }
      if (!leadId) this.historyJobs.start(lead.id)
      const jobRunId = runId || this.historyJobs.get(lead.id)?.runId
      const anchor = savedAnchor || { key: latest.whatsappKey || { remoteJid: lead.whatsappJid, id: latest.sourceMessageId, fromMe: latest.from !== 'client' }, timestamp: Date.parse(latest.timestamp) }
      try {
        this.historyJobs.setAnchor(lead.id, anchor, jobRunId)
        await this.historyJobs.flush()
        const currentJob = this.historyJobs.get(lead.id)
        if (currentJob?.runId !== jobRunId || currentJob.phase !== 'requesting' || this.status !== 'connected') continue
        const requestId = await this.socket.fetchMessageHistory(100, anchor.key, anchor.timestamp)
        if (requestId) {
          this.historyRequests.set(requestId, { leadId: lead.id, runId: jobRunId })
          if (this.historyRequests.size > 100) this.historyRequests.delete(this.historyRequests.keys().next().value)
        }
        requested += 1
        this.historyJobs.requested(lead.id, jobRunId)
        // Os registros antigos só guardavam o ID. Solicitar a mensagem
        // original permite recuperar a classificação e as chaves de mídia.
        for (const missing of messages.filter(message => message.type === 'text' && message.content === '[Arquivo]').slice(0, 10)) {
          await this.socket.requestPlaceholderResend?.(missing.whatsappKey || { remoteJid: lead.whatsappJid, id: missing.sourceMessageId, fromMe: missing.from !== 'client' })
        }
      } catch {
        if (this.status !== 'connected') this.historyJobs.pauseAll('whatsapp_disconnected')
        else this.historyJobs.fail(lead.id, jobRunId)
        console.warn('[WhatsApp/Baileys] O telefone ainda não retornou o histórico solicitado.')
      }
    }
    if (!leadId) this.historyRequested = requested > 0
    this.historySync.requested = requested
    this.historySync.requestedAt = new Date().toISOString()
    console.log(`[WhatsApp/Baileys] Recuperação solicitada para ${requested} conversa(s) conhecida(s).`)
    return { requested }
  }

  async downloadMetaMedia(mediaId) {
    const { accessToken } = db.getSettings().metaConfig || {}
    if (!accessToken || !mediaId) return { buffer: null, mimeType: '', fileName: '' }
    try {
      const metadata = await axios.get(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!metadata.data?.url) return { buffer: null, mimeType: metadata.data?.mime_type || '', fileName: '' }
      const response = await axios.get(metadata.data.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
        maxContentLength: 15 * 1024 * 1024,
        maxBodyLength: 15 * 1024 * 1024,
      })
      return {
        buffer: Buffer.from(response.data),
        mimeType: metadata.data.mime_type || response.headers['content-type'] || '',
        fileName: metadata.data.file_name || '',
      }
    } catch (error) {
      console.warn('[WhatsApp/Meta] Não foi possível baixar a mídia recebida:', error.response?.data || error.message)
      return { buffer: null, mimeType: '', fileName: '' }
    }
  }

  async handleIncomingMessage(rawMsg, provider = 'baileys') {
    if (provider === 'baileys') return this.ingestBaileys(rawMsg)
    try {
      let fromPhone = ''
      let text = ''
      let mediaType = 'text' // text | image | audio | video | file
      let mediaBuffer = null
      let mediaMimeType = ''
      let mediaFileName = ''
      let contactName = ''
      let phoneJid = null
      let replyJid = null
      let remoteIdentifier = ''

      // Meta Provider
      contactName = String(rawMsg.contactName || '').trim().slice(0, 120)
      fromPhone = rawMsg.from
      if (rawMsg.type === 'text') {
        text = rawMsg.text?.body || ''
      } else if (rawMsg.type === 'image') {
        mediaType = 'image'
        text = rawMsg.image?.caption || ''
      } else if (rawMsg.type === 'audio') {
        mediaType = 'audio'
      } else if (rawMsg.type === 'video') {
        mediaType = 'video'
        text = rawMsg.video?.caption || ''
      } else if (rawMsg.type === 'document') {
        mediaType = 'file'
        text = rawMsg.document?.caption || ''
      } else if (rawMsg.type === 'sticker') {
        mediaType = 'sticker'
      }
      if (['image', 'audio', 'video', 'file', 'sticker'].includes(mediaType)) {
        const mediaObject = rawMsg[mediaType === 'file' ? 'document' : mediaType] || {}
        const downloaded = await this.downloadMetaMedia(mediaObject.id)
        mediaBuffer = downloaded.buffer
        mediaMimeType = downloaded.mimeType || mediaObject.mime_type || ''
        mediaFileName = downloaded.fileName || mediaObject.filename || ''
      }

      if (!fromPhone) return

      // A Meta reentrega o mesmo webhook quando a resposta demora (e aqui ela
      // demora, porque a IA responde antes do 200). Sem este filtro a mesma
      // mensagem entrava duas vezes e a IA respondia em dobro.
      if (provider === 'meta' && rawMsg.id
        && db.find('messages', (message) => message.sourceMessageId === rawMsg.id)) return

      // Find or create lead
      const phoneCandidates = provider === 'baileys'
        ? [fromPhone, remoteIdentifier].filter(Boolean)
        : [fromPhone]
      // Primeiro pela chave normalizada (o mesmo celular chega com e sem o
      // nono digito); so depois pela comparacao solta que ja existia.
      const candidateKeys = phoneCandidates.map(phoneKey).filter(Boolean)
      let lead = db.find('leads', (l) => candidateKeys.includes(phoneKey(l.phone)))
      if (!lead) lead = db.find('leads', (l) => {
        const savedPhone = String(l.phone || '').replace(/\D/g, '')
        return phoneCandidates.some((candidate) => {
          const normalizedCandidate = String(candidate).replace(/\D/g, '')
          return savedPhone && normalizedCandidate
            && (savedPhone.includes(normalizedCandidate) || normalizedCandidate.includes(savedPhone))
        })
      })
      const currentSettings = db.getSettings()
      const users = db.get('users')
      const configuredAssignee = users.find((user) => user.id === currentSettings.defaultLeadAssigneeId)
        || users.find((user) => user.role === 'admin')
      const assignedTo = users.some((user) => user.id === lead?.assignedTo)
        ? lead.assignedTo
        : configuredAssignee?.id
      if (!lead) {
        lead = db.insert('leads', {
          id: `lead_${Date.now()}`,
          name: contactName || 'Contato WhatsApp',
          phone: fromPhone,
          email: '',
          stage: 'novo_lead',
          origin: 'WhatsApp Direto',
          utmSource: 'whatsapp',
          utmMedium: 'direct',
          utmCampaign: 'organic_chat',
          equipmentInterest: 'A definir',
          modality: 'locacao',
          estimatedPeriod: '30 dias',
          aiSummary: 'Contato inicial iniciado via WhatsApp. Em processo de qualificação.',
          aiEnabled: true,
          lastInteraction: new Date().toISOString(),
          assignedTo,
          value: 480.0,
          notes: 'Lead criado automaticamente ao receber mensagem no WhatsApp.',
          whatsappJid: provider === 'baileys' ? replyJid : undefined,
          conversationStatus: 'open',
          lastInboundAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
      } else {
        const existingName = String(lead.name || '').trim()
        const phoneOnlyName = /^[+\d\s().-]+$/.test(existingName) && existingName.replace(/\D/g, '').length >= 8
        const genericContactName = !existingName || phoneOnlyName || /^(?:cliente whatsapp\s*\(|contato whatsapp$)/i.test(existingName)
        const contactUpdate = {
          ...(contactName && genericContactName ? { name: contactName } : {}),
          lastInteraction: new Date().toISOString(),
          // Abre (ou renova) a janela de 24h da Meta e reabre a conversa se
          // ela estava encerrada: cliente que volta a falar nao fica escondido.
          lastInboundAt: new Date().toISOString(),
          ...(lead.conversationStatus === 'closed'
            ? { conversationStatus: 'open', reopenedAt: new Date().toISOString() }
            : {}),
          ...(provider === 'baileys' ? { whatsappJid: replyJid } : {}),
          ...(provider === 'baileys' && phoneJid ? { phone: fromPhone } : {}),
          ...(!lead.assignedTo && assignedTo ? { assignedTo } : {}),
        }
        db.update('leads', lead.id, contactUpdate)
        lead = { ...lead, ...contactUpdate }
      }

      // Save message in DB
      const mediaStorage = mediaBuffer
        ? await saveWhatsAppMedia(mediaBuffer, lead.id, mediaMimeType, mediaFileName)
        : null
      const mediaLabel = mediaType === 'image' ? '[Imagem]' : mediaType === 'audio' ? '[Áudio]' : mediaType === 'video' ? '[Vídeo]' : mediaType === 'sticker' ? '[Figurinha]' : '[Arquivo]'
      const savedMsg = db.insert('messages', {
        id: `msg_${Date.now()}`,
        sourceMessageId: provider === 'baileys' ? rawMsg.key.id : rawMsg.id,
        leadId: lead.id,
        from: 'client',
        type: mediaType,
        content: text || mediaLabel,
        ...(mediaStorage ? { ...mediaStorage, mediaMimeType, mediaFileName: String(mediaFileName || mediaLabel.slice(1, -1)).slice(0, 180), mediaSize: mediaBuffer.length } : {}),
        timestamp: new Date().toISOString(),
      })

      if (this.io) {
        this.io.emit('message:new', toClientMessage(savedMsg))
        this.io.emit('lead:updated', lead)
      }

      // Se a IA estiver ativada para este lead, gerar resposta automática
      if (lead.aiEnabled) {
        await this.respondWithAi(lead, savedMsg, mediaBuffer)
      }
    } catch (err) {
      console.error('[WhatsApp] Erro ao processar mensagem recebida:', err)
    }
  }

  /**
   * Status de entrega que a Meta manda pelo webhook (sent, delivered, read,
   * failed). Template costuma falhar DEPOIS do 200 do envio, entao e so por
   * aqui que a equipe fica sabendo que a mensagem nao chegou.
   */
  handleMetaStatus(status) {
    const metaId = String(status?.id || '')
    const state = String(status?.status || '')
    if (!metaId || !['sent', 'delivered', 'read', 'failed'].includes(state)) return

    const message = db.find('messages', (item) => item.metaMessageId === metaId)
    if (!message) return
    // Nao volta atras: um "delivered" atrasado nao desfaz um "read".
    const rank = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 }
    if ((rank[state] ?? 0) <= (rank[message.deliveryStatus] ?? 0)) return

    const failure = status.errors?.[0]
    const updated = db.update('messages', message.id, {
      deliveryStatus: state,
      ...(state === 'failed'
        ? { deliveryError: String(failure?.error_data?.details || failure?.title || 'A Meta não entregou a mensagem.').slice(0, 300) }
        : {}),
    })
    if (this.io && updated) this.io.emit('message:updated', updated)
  }

  async respondWithAi(lead, userMsg, mediaBuffer = null) {
    if (!this.yriaResponder) this.yriaResponder = createYriaResponder({
        database: db, evaluate: evaluateYria, automationService: automaticContracts,
      send: (phone, text, options) => this.sendMessage(phone, text, options),
      emit: (name, payload) => this.io?.emit(name, payload),
      push: deliverPushToUser,
    })
    try { await this.yriaResponder(lead, userMsg, mediaBuffer) }
    catch (error) { console.error('[YRIA] Atendimento interrompido com segurança:', error?.name || 'erro') }
  }

  cancelAiReply(leadId) {
    this.yriaResponder?.cancel(leadId)
  }

  async sendMessage(phone, messageText, { isAllowed } = {}) {
    if (isAllowed && !isAllowed()) return false
    const target = String(phone || '')
    const cleanPhone = target.replace(/\D/g, '')
    console.log(`[WhatsApp] Enviando mensagem para ${cleanPhone} via ${this.activeProvider}: ${messageText.slice(0, 60)}...`)

    if (this.activeProvider === 'baileys') {
      if (!this.socket || this.status !== 'connected') {
        console.warn('[WhatsApp/Baileys] Socket não está conectado. Mensagem mantida no painel CRM.')
        return false
      }
      const savedLead = db.find('leads', (lead) => String(lead.phone || '').replace(/\D/g, '') === cleanPhone)
      const jid = target.includes('@')
        ? target
        : savedLead?.whatsappJid || `${cleanPhone}@s.whatsapp.net`
      if (isAllowed && !isAllowed()) return false
      const sent = await this.socket.sendMessage(jid, { text: messageText })
      this.rememberOwnMessage(sent)
      return true
    } else {
      // Meta Cloud API
      const settings = db.getSettings()
      const { accessToken, phoneNumberId } = settings.metaConfig || {}

      if (!accessToken || !phoneNumberId) {
        console.warn('[WhatsApp/Meta] Credenciais da Meta API não configuradas.')
        return false
      }

      try {
        if (isAllowed && !isAllowed()) return false
        await axios.post(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { body: messageText },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        )
        return true
      } catch (e) {
        console.error('[WhatsApp/Meta] Erro na requisição Graph API:', e.response?.data || e.message)
        return false
      }
    }
  }

  async sendMedia(phone, buffer, mimetype, filename, caption = '', options = {}) {
    const target = String(phone || '')
    const cleanPhone = target.replace(/\D/g, '')
    if (!buffer?.length || !mimetype) throw new Error('Arquivo inválido.')

    if (this.activeProvider === 'meta') {
      const { accessToken, phoneNumberId } = db.getSettings().metaConfig || {}
      if (!accessToken || !phoneNumberId) throw new Error('Configure o token e o Phone Number ID da Meta em Ajustes.')

      const mediaType = mimetype.startsWith('image/')
        ? 'image'
        : mimetype.startsWith('video/')
          ? 'video'
          : mimetype.startsWith('audio/')
            ? 'audio'
            : 'document'
      if (mediaType === 'image' && buffer.length > 5 * 1024 * 1024) {
        throw new Error('A API oficial da Meta aceita imagens de até 5 MB.')
      }

      const form = new FormData()
      form.append('messaging_product', 'whatsapp')
      form.append('file', new Blob([buffer], { type: mimetype }), String(filename || 'anexo').slice(0, 180))
      const graphRoot = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}`
      const uploadResponse = await fetch(`${graphRoot}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
      const uploadResult = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok || !uploadResult.id) {
        const detail = uploadResult?.error?.error_user_msg || uploadResult?.error?.error_data?.details || uploadResult?.error?.message
        throw new Error(String(detail || 'A Meta não aceitou o arquivo. Confira o formato e o tamanho.').slice(0, 280))
      }

      const mediaObject = { id: uploadResult.id }
      if (caption.trim() && ['image', 'video', 'document'].includes(mediaType)) mediaObject.caption = caption.trim().slice(0, 1024)
      if (mediaType === 'document') mediaObject.filename = String(filename || 'anexo').slice(0, 180)
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: mediaType,
        [mediaType]: mediaObject,
      }
      try {
        await axios.post(`${graphRoot}/messages`, payload, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          timeout: 30_000,
        })
        if (mediaType === 'audio' && caption.trim()) {
          await axios.post(`${graphRoot}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { body: caption.trim().slice(0, 1024) },
          }, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 30_000,
          })
        }
        return true
      } catch (error) {
        const detail = error?.response?.data?.error?.error_user_msg
          || error?.response?.data?.error?.error_data?.details
          || error?.response?.data?.error?.message
        throw new Error(String(detail || 'A Meta não conseguiu entregar este anexo. Confira a conexão e tente novamente.').slice(0, 280))
      }
    }

    if (!this.socket || this.status !== 'connected') {
      throw new Error('WhatsApp não está conectado. Conecte o Baileys antes de enviar um anexo.')
    }

    const savedLead = db.find('leads', (lead) => String(lead.phone || '').replace(/\D/g, '') === cleanPhone)
    const jid = target.includes('@')
      ? target
      : savedLead?.whatsappJid || `${cleanPhone}@s.whatsapp.net`

    const payload = options.sticker
      ? { sticker: buffer }
      : mimetype.startsWith('image/')
        ? { image: buffer, caption }
      : mimetype.startsWith('audio/')
        ? { audio: buffer, mimetype: mimetype === 'audio/ogg' ? 'audio/ogg; codecs=opus' : mimetype, ptt: true }
        : mimetype.startsWith('video/')
          ? { video: buffer, mimetype, caption, ...(options.gifPlayback ? { gifPlayback: true } : {}) }
        : { document: buffer, mimetype, fileName: filename, caption }

    const sent = await this.socket.sendMessage(jid, payload)
    this.rememberOwnMessage(sent)
    return true
  }

  async requestPairingCode(phoneNumber) {
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '')
    if (cleanPhone.length < 11) throw new Error('Informe o número com DDI e DDD.')
    if (this.activeProvider !== 'baileys') throw new Error('O pareamento por código exige o provedor Baileys.')
    if (this.status === 'connected') throw new Error('O WhatsApp já está conectado ao CRM.')

    if (!this.socket || this.status === 'disconnected') {
      await this.initBaileys()
    }

    const deadline = Date.now() + 20000
    while (Date.now() < deadline && this.status !== 'qr_ready') {
      if (this.status === 'connected') throw new Error('O WhatsApp já está conectado ao CRM.')
      if (this.status === 'disconnected' && !this.reconnectTimer) {
        await this.initBaileys()
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const socket = this.socket
    if (!socket || this.status !== 'qr_ready') {
      throw new Error('O WhatsApp ainda está conectando. Aguarde alguns segundos e tente gerar o código novamente.')
    }
    if (typeof socket.requestPairingCode !== 'function') {
      throw new Error('Esta sessão não oferece pareamento por código. Use o QR Code atualizado.')
    }

    try {
      const code = await socket.requestPairingCode(cleanPhone)
      if (!code) throw new Error('O WhatsApp não retornou um código de pareamento.')
      this.pairingCode = code
      this.pairingProtectionUntil = Date.now() + 60000
      this.qrCode = null
      this.qrGeneratedAt = null
      this.lastError = null
      console.log('[WhatsApp/Baileys] Código de pareamento gerado.')
      this.broadcastStatus()
      return code
    } catch (error) {
      const statusCode = Number(error?.output?.statusCode)
      const errorCode = String(error?.code || '')
      console.warn('[WhatsApp/Baileys] Falha ao gerar código de pareamento.', {
        name: String(error?.name || 'Error').slice(0, 40),
        code: errorCode.slice(0, 32),
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
      })
      if (statusCode === 428 || /connection (closed|terminated)/i.test(String(error?.message || ''))) {
        throw new Error('A conexão com o WhatsApp foi encerrada. Aguarde a reconexão e gere o código novamente.')
      }
      throw new Error('O WhatsApp não gerou o código. Confira o número com DDI e DDD e tente novamente.')
    }
  }

  broadcastStatus() {
    if (!this.io) return
    this.io.emit('whatsapp:status', this.getStatus())
  }

  getStatus() {
    return {
      instanceId: this.instanceId,
      snapshotAt: new Date().toISOString(),
      diagnostics: this.ingress.snapshot(),
      historySync: { ...this.historySync, conversations: Object.fromEntries(Object.entries(this.historyJobs.all()).map(([leadId, job]) => [leadId, serializeHistoryJob(job)])) },
      provider: this.activeProvider,
      status: this.status,
      connectedNumber: this.connectedNumber,
      qrCode: this.qrCode,
      qrGeneratedAt: this.qrGeneratedAt,
      pairingCode: this.pairingCode,
      lastError: this.lastError,
    }
  }
}

export const whatsappService = new WhatsAppService()
