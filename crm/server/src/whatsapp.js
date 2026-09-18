import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import QRCode from 'qrcode'
import axios from 'axios'
import pino from 'pino'
import { db } from './db.js'
import { phoneKey } from './phone.js'
import { runGeminiWithFallback, analyzeImage, transcribeAndUnderstandAudio, generateCustomerSummary } from './gemini.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'data', 'baileys_auth')
const DATA_DIR = path.dirname(AUTH_DIR)

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
    this.lastError = null
    this.qrGeneratedAt = null
  }

  init(io) {
    this.io = io
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

  hasIncompleteSession() {
    const credentialsPath = path.join(AUTH_DIR, 'creds.json')
    if (!fs.existsSync(credentialsPath)) return false

    try {
      return JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).registered === false
    } catch {
      return true
    }
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
    if (this.reconnectTimer || this.activeProvider !== 'baileys') return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.initBaileys()
    }, delay)
  }

  async resetBaileysSession() {
    this.connectionAttempt += 1
    this.socket = null
    this.qrCode = null
    this.pairingCode = null
    this.connectedNumber = null
    this.lastError = null
    this.archiveIncompleteSession()
    await this.initBaileys()
  }

  async initBaileys() {
    try {
      if (this.socket && ['connecting', 'qr_ready', 'connected'].includes(this.status)) return

      const attempt = ++this.connectionAttempt
      this.status = 'connecting'
      this.lastError = null
      this.broadcastStatus()

      const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys')
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
      const { version } = await fetchLatestBaileysVersion()

      this.socket = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Grupo YR CRM'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        keepAliveIntervalMs: 15000,
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
          this.qrCode = null
          this.qrGeneratedAt = null
          this.pairingCode = null
          this.lastError = null
          this.connectedNumber = this.socket.user?.id ? this.socket.user.id.split(':')[0] : 'Conectado'
          console.log(`[WhatsApp/Baileys] Conectado com sucesso! Número: ${this.connectedNumber}`)
          this.broadcastStatus()
        }

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode
          console.warn(`[WhatsApp/Baileys] Conexão encerrada. Motivo: ${reason}`)
          await pendingCredsSave
          this.status = 'disconnected'
          this.socket = null
          this.connectedNumber = null
          this.broadcastStatus()

          this.lastError = reason === DisconnectReason.restartRequired
            ? 'QR aceito. Finalizando a conexão com o WhatsApp...'
            : reason === DisconnectReason.loggedOut
              ? 'A sessão do WhatsApp expirou. Uma nova leitura do QR Code é necessária.'
              : 'A conexão foi interrompida. O CRM tentará reconectar automaticamente.'

          if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
            // Credenciais desconectadas não voltam a gerar QR sozinhas. Arquivamos
            // a sessão para que o próximo socket crie uma vinculação limpa.
            this.archiveIncompleteSession()
          }
          this.broadcastStatus()
          this.scheduleReconnect(reason === DisconnectReason.restartRequired ? 500 : 5000)
        }
      })

      this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.key.remoteJid) {
            await this.handleIncomingMessage(msg, 'baileys')
          }
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

  async handleIncomingMessage(rawMsg, provider = 'baileys') {
    try {
      let fromPhone = ''
      let text = ''
      let mediaType = 'text' // text | image | audio
      let mediaBuffer = null
      let phoneJid = null
      let replyJid = null
      let remoteIdentifier = ''

      if (provider === 'baileys') {
        const remoteJid = rawMsg.key.remoteJid
        if (!remoteJid || remoteJid.includes('@g.us')) return // Ignora grupos

        // O WhatsApp atual pode entregar conversas individuais usando um LID
        // interno em remoteJid e o número real em remoteJidAlt. Para o CRM,
        // priorizamos sempre o PN JID e guardamos o destino correto da resposta.
        phoneJid = [rawMsg.key.remoteJidAlt, remoteJid]
          .find((jid) => jid?.endsWith('@s.whatsapp.net'))
        replyJid = phoneJid || remoteJid
        fromPhone = (phoneJid || remoteJid).split('@')[0].split(':')[0]
        remoteIdentifier = remoteJid.split('@')[0].split(':')[0]

        const sourceMessageId = rawMsg.key.id
        if (sourceMessageId && db.find('messages', (message) => message.sourceMessageId === sourceMessageId)) return

        const messageContent = rawMsg.message
        if (!messageContent) return

        if (messageContent.conversation) {
          text = messageContent.conversation
        } else if (messageContent.extendedTextMessage?.text) {
          text = messageContent.extendedTextMessage.text
        } else if (messageContent.imageMessage) {
          mediaType = 'image'
          text = messageContent.imageMessage.caption || ''
          const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
          mediaBuffer = await downloadMediaMessage(rawMsg, 'buffer', {})
        } else if (messageContent.audioMessage) {
          mediaType = 'audio'
          const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
          mediaBuffer = await downloadMediaMessage(rawMsg, 'buffer', {})
        }
      } else {
        // Meta Provider
        fromPhone = rawMsg.from
        if (rawMsg.type === 'text') {
          text = rawMsg.text?.body || ''
        } else if (rawMsg.type === 'image') {
          mediaType = 'image'
          text = rawMsg.image?.caption || ''
        } else if (rawMsg.type === 'audio') {
          mediaType = 'audio'
        }
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
      if (!lead) {
        lead = db.insert('leads', {
          id: `lead_${Date.now()}`,
          name: `Cliente WhatsApp (+${fromPhone})`,
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
          assignedTo: 'usr_vendedor',
          value: 480.0,
          notes: 'Lead criado automaticamente ao receber mensagem no WhatsApp.',
          whatsappJid: provider === 'baileys' ? replyJid : undefined,
          conversationStatus: 'open',
          lastInboundAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
      } else {
        const contactUpdate = {
          lastInteraction: new Date().toISOString(),
          // Abre (ou renova) a janela de 24h da Meta e reabre a conversa se
          // ela estava encerrada: cliente que volta a falar nao fica escondido.
          lastInboundAt: new Date().toISOString(),
          ...(lead.conversationStatus === 'closed'
            ? { conversationStatus: 'open', reopenedAt: new Date().toISOString() }
            : {}),
          ...(provider === 'baileys' ? { whatsappJid: replyJid } : {}),
          ...(provider === 'baileys' && phoneJid ? { phone: fromPhone } : {}),
        }
        db.update('leads', lead.id, contactUpdate)
        lead = { ...lead, ...contactUpdate }
      }

      // Save message in DB
      const savedMsg = db.insert('messages', {
        id: `msg_${Date.now()}`,
        sourceMessageId: provider === 'baileys' ? rawMsg.key.id : rawMsg.id,
        leadId: lead.id,
        from: 'client',
        type: mediaType,
        content: text || (mediaType === 'audio' ? '[Mensagem de Áudio]' : '[Imagem]'),
        timestamp: new Date().toISOString(),
      })

      if (this.io) {
        this.io.emit('message:new', savedMsg)
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
    try {
      // Avisos do sistema ("conversa encerrada") nao sao fala de ninguem.
      const history = db.filter('messages', (m) => m.leadId === lead.id && m.from !== 'system').slice(-10)

      let aiResult
      if (userMsg.type === 'image' && mediaBuffer) {
        aiResult = await analyzeImage(mediaBuffer, 'image/jpeg', userMsg.content)
      } else if (userMsg.type === 'audio' && mediaBuffer) {
        aiResult = await transcribeAndUnderstandAudio(mediaBuffer, 'audio/ogg')
      } else {
        aiResult = await runGeminiWithFallback({
          prompt: userMsg.content,
          history: history.slice(0, -1),
        })
      }

      const replyText = aiResult.text

      // Salva mensagem da IA no banco
      const aiMsg = db.insert('messages', {
        id: `msg_${Date.now()}`,
        leadId: lead.id,
        from: 'ai',
        type: 'text',
        modelUsed: aiResult.modelUsed,
        content: replyText,
        deliveryStatus: 'sending',
        timestamp: new Date().toISOString(),
      })

      if (this.io) {
        this.io.emit('message:new', aiMsg)
      }

      // Envia de volta para o cliente via WhatsApp
      const delivered = await this.sendMessage(lead.phone, replyText)
      db.update('messages', aiMsg.id, { deliveryStatus: delivered ? 'sent' : 'pending_connection' })

      // Atualiza o estágio para 'qualificacao_ia' e gera resumo atualizado
      const updatedHistory = db.filter('messages', (m) => m.leadId === lead.id)
      const summary = await generateCustomerSummary(lead, updatedHistory)

      db.update('leads', lead.id, {
        stage: lead.stage === 'novo_lead' ? 'qualificacao_ia' : lead.stage,
        aiSummary: summary,
        lastInteraction: new Date().toISOString(),
      })

      if (this.io) {
        this.io.emit('lead:updated', db.find('leads', (l) => l.id === lead.id))
      }
    } catch (err) {
      console.error('[WhatsApp/AI] Erro ao responder com IA:', err)
    }
  }

  async sendMessage(phone, messageText) {
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
      await this.socket.sendMessage(jid, { text: messageText })
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

  async sendMedia(phone, buffer, mimetype, filename, caption = '') {
    const target = String(phone || '')
    const cleanPhone = target.replace(/\D/g, '')
    if (this.activeProvider !== 'baileys') {
      throw new Error('O envio de anexos pelo painel está disponível no Baileys. Configure a mídia pela Meta Cloud API.')
    }
    if (!this.socket || this.status !== 'connected') {
      throw new Error('WhatsApp não está conectado. Conecte o Baileys antes de enviar um anexo.')
    }
    if (!buffer?.length || !mimetype) throw new Error('Arquivo inválido.')

    const savedLead = db.find('leads', (lead) => String(lead.phone || '').replace(/\D/g, '') === cleanPhone)
    const jid = target.includes('@')
      ? target
      : savedLead?.whatsappJid || `${cleanPhone}@s.whatsapp.net`

    const payload = mimetype.startsWith('image/')
      ? { image: buffer, caption }
      : mimetype.startsWith('audio/')
        ? { audio: buffer, mimetype, ptt: true }
        : { document: buffer, mimetype, fileName: filename, caption }

    await this.socket.sendMessage(jid, payload)
    return true
  }

  async requestPairingCode(phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, '')
    if (cleanPhone.length < 11) throw new Error('Informe o número com DDI e DDD.')
    try {
      if (!this.socket || this.status === 'disconnected') {
        await this.initBaileys()
      }
      if (this.status === 'qr_ready') throw new Error('O QR Code já está pronto. Use a aba Escanear QR Code.')
      if (this.socket && typeof this.socket.requestPairingCode === 'function') {
        const code = await this.socket.requestPairingCode(cleanPhone)
        if (code) {
          this.pairingCode = code
          console.log(`[WhatsApp/Baileys] Código de pareamento real gerado para ${cleanPhone}.`)
          this.broadcastStatus()
          return code
        }
      }
      throw new Error('O WhatsApp ainda está preparando a sessão. Aguarde o QR Code ou tente novamente em alguns segundos.')
    } catch (err) {
      console.error('[WhatsApp/Baileys] Erro ao gerar código de pareamento:', err)
      throw new Error('Não foi possível gerar um código real. Abra a aba QR Code e faça a leitura.')
    }
  }

  broadcastStatus() {
    if (!this.io) return
    this.io.emit('whatsapp:status', {
      provider: this.activeProvider,
      status: this.status,
      connectedNumber: this.connectedNumber,
      qrCode: this.qrCode,
      qrGeneratedAt: this.qrGeneratedAt,
      pairingCode: this.pairingCode,
      lastError: this.lastError,
    })
  }

  getStatus() {
    return {
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
