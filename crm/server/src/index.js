import express from 'express'
import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { normalizeCalendarEvent, normalizeContractExpense } from './operations.js'
import { registerOperationsRoutes } from './operationsRoutes.js'
import { generateGeminiRetentionInsights, registerRetentionInsightRoute } from './retentionInsights.js'
import { Server } from 'socket.io'
import cors from 'cors'
import multer from 'multer'
import { db } from './db.js'
import { evaluateYria } from './yriaService.js'
import { qualificationSummary, initialState, getYriaConfiguration } from './yriaCore.js'
import { rebuildLeadQualification } from './yriaLeadFacts.js'
import { registerYriaRoutes } from './yriaRoutes.js'
import { registerGoogleModelRoutes } from './googleModels.js'
import { registerInsightsRoutes } from './insights.js'
import { registerCustomerRoutes } from './customerRoutes.js'
import { registerWebsiteChat } from './websiteChat.js'
import { registerCommercialRoutes } from './commercial.js'
import { registerFreightApiRoutes } from './freightRoutes.js'
import { automaticContracts,configureAutomaticContracts } from './automaticRuntime.js'
import { registerFunnelRoutes, isInFunnel, FUNNEL_STAGES } from './funnel.js'
import { createContractPdf, createDeliveryChecklistPdf } from './documents.js'
import { createEmailStore, createContractEmail, registerContractEmailRoutes } from './contractEmail.js'
import { deliverPushToUser, getPushPublicKey, pushIsConfigured, subscriptionId } from './push.js'
import { loginUser, requireAuth, verifyToken } from './auth.js'
import { createScreenGuard, registerUserAdminRoutes, publicUser } from './screenAccess.js'
import { isMetaMediaTypeSupported, whatsappService } from './whatsapp.js'
import { serializeWhatsAppMessage } from './whatsappMessages.js'
import { createContactPhotoService } from './contactPhotos.js'
import { registerConversationRoutes, normalizeConversationSla } from './conversationMetrics.js'
import { repairExternalAutomationReplies } from './whatsappAutomationRepair.js'
import { registerYriaControlRoute } from './yriaControl.js'
import { prepareWhatsAppUpload } from './whatsappMedia.js'
import { runGeminiWithFallback, generateStructuredQualification, FALLBACK_MODELS } from './gemini.js'
import {
  createContract,
  signContract,
  renderContractHtml,
  ensureSigningToken,
  findContractBySigningToken,
  changeContractStatus,
  allowedContractStatuses,
} from './contracts.js'
import { contractItemCatalog, addContractItem, removeContractItem, setContractArchived } from './contractAmendments.js'
import { sanitizeLeadDetails } from './leadDetails.js'
import { listTemplates, sendTemplate, windowState, backfillLastInbound, MetaError } from './metaTemplates.js'
import { normalizePhone, phoneKey } from './phone.js'
import * as siteBlog from './blog.js'

process.on('uncaughtException', (err) => {
  console.error('[Process] Exceção não capturada (evitando crash):', err?.stack || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Rejeição de Promise não tratada (evitando crash):', reason?.stack || reason)
})

const app = express()
// Links pessoais não podem entrar no cache, nos buscadores ou no referer.
app.use(['/cliente', '/vistoria'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  next()
})
const server = http.createServer(app)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CRM_DATA_DIR = path.join(__dirname, '..', 'data')
const contractEmail = createContractEmail({
  store: createEmailStore(path.join(CRM_DATA_DIR, 'email')),
  db, createPdf: createContractPdf, ensureToken: ensureSigningToken,
  publicUrl: () => resolvePublicUrl(),
})
const BLOG_UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads', 'blog')
const LEAD_UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads', 'leads')
const WHATSAPP_UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads', 'whatsapp')
fs.mkdirSync(BLOG_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(LEAD_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(WHATSAPP_UPLOAD_DIR, { recursive: true })

const safeFileExtension = (mimetype, originalName = '') => {
  const byMime = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/webm': '.webm',
    'video/mp4': '.mp4', 'video/3gpp': '.3gp', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'application/pdf': '.pdf', 'text/plain': '.txt',
  }
  if (byMime[mimetype]) return byMime[mimetype]
  const extension = path.extname(String(originalName || '')).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin'
}

const storedFilePath = (storageKey) => {
  const absolute = path.resolve(CRM_DATA_DIR, String(storageKey || ''))
  const relative = path.relative(CRM_DATA_DIR, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return absolute
}

const sendFileBuffer = (res, { data, mimeType, fileName }, download = false) => {
  const asciiName = String(fileName || 'anexo').replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7E]/g, '_')
  res.setHeader('Content-Type', mimeType || 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${asciiName}"`)
  res.send(data)
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, BLOG_UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extension = file.mimetype === 'image/png' ? '.png'
        : file.mimetype === 'image/webp' ? '.webp'
          : '.jpg'
      callback(null, `${randomUUID()}${extension}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
  },
})

// Capa do blog do site: fica em memoria porque e recodificada antes de gravar.
const blogCoverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
  },
})

const whatsappMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/3gpp', 'video/quicktime', 'video/webm'].includes(file.mimetype)
      || [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ].includes(file.mimetype)
    callback(null, accepted)
  },
})

const leadAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    callback(null, allowed.includes(file.mimetype))
  },
})
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001,http://127.0.0.1:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const isAllowedOrigin = (origin) => (
  !origin
  || allowedOrigins.includes(origin)
  || /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)
)
const corsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}

const io = new Server(server, {
  cors: corsOptions,
})

app.use(cors(corsOptions))
app.use(express.json({
  limit: '25mb',
  // A assinatura do webhook da Meta e calculada sobre os bytes crus do corpo.
  // Guarda-se o buffer so nessa rota, para nao dobrar a memoria das demais.
  verify: (req, _res, buffer) => {
    if (req.originalUrl?.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer
  },
}))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))
// Bloqueia, no servidor, as rotas das telas que o usuário não pode ver.
app.use(createScreenGuard({ db, verifyToken }))
registerContractEmailRoutes(app, { service: contractEmail, db, requireAuth })
app.use('/uploads/blog', express.static(BLOG_UPLOAD_DIR, { maxAge: '7d', index: false }))

io.on('connection', (socket) => {
  console.log(`[Socket.io] Cliente conectado: ${socket.id}`)
  socket.emit('whatsapp:status', whatsappService.getStatus())

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id}`)
  })
})

const serializeMessage = serializeWhatsAppMessage

app.get('/api/health', async (_req, res) => {
  try {
    await db.ready
    res.json({ ok: true, database: db.storageMode, uptimeSeconds: Math.floor(process.uptime()) })
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' })
  }
})

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const result = await loginUser(email, password)
    if (!result) return res.status(401).json({ error: 'E-mail ou senha incorretos' })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/auth/me', requireAuth(), (req, res) => {
  const stored = db.find('users', (u) => u.id === req.user.id)
  res.json({ user: stored ? publicUser(stored) : req.user })
})
registerUserAdminRoutes(app, { db, requireAuth })

registerRetentionInsightRoute(app, {
  db,
  requireAuth,
  generateInsights: (snapshot) => generateGeminiRetentionInsights(snapshot, runGeminiWithFallback),
})

/* ==========================================================================
   WHATSAPP & AI CONTROLLER ROUTES
   ========================================================================== */
app.get('/api/whatsapp/status', requireAuth(), (req, res) => {
  res.json(whatsappService.getStatus())
})

app.post('/api/whatsapp/switch-provider', requireAuth(['admin']), async (req, res) => {
  try {
    const { provider } = req.body
    const result = await whatsappService.setActiveProvider(provider)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/whatsapp/pairing-code', requireAuth(), async (req, res) => {
  try {
    const phone = req.body.phone || req.body.phoneNumber
    if (!phone) return res.status(400).json({ error: 'Número de telefone é obrigatório' })
    const code = await whatsappService.requestPairingCode(phone)
    res.json({ ok: true, code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/whatsapp/reset-session', requireAuth(['admin']), async (_req, res) => {
  try {
    await whatsappService.resetBaileysSession()
    res.json({ ok: true, message: 'Nova sessão iniciada. Aguarde o QR Code aparecer.' })
  } catch (err) {
    if (err?.code === 'PAIRING_IN_PROGRESS') return res.status(409).json({ error: err.message })
    console.error('[WhatsApp/Baileys] Erro ao reiniciar sessão:', err)
    res.status(500).json({ error: 'Não foi possível reiniciar a sessão do WhatsApp.' })
  }
})

app.post('/api/whatsapp/disconnect', requireAuth(['admin']), async (_req, res) => {
  try {
    await whatsappService.disconnectBaileysSession()
    res.json({ ok: true, message: 'Telefone desconectado do CRM.' })
  } catch (err) {
    console.error('[WhatsApp/Baileys] Erro ao desconectar sessão:', err)
    res.status(500).json({ error: 'Não foi possível desconectar o telefone do WhatsApp.' })
  }
})

app.post('/api/whatsapp/send', requireAuth(), async (req, res) => {
  try {
    const { leadId } = req.body
    const text = String(req.body.text ?? '').trim()
    const lead = db.find('leads', (l) => l.id === leadId)
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
    if (!text) return res.status(400).json({ error: 'Escreva a mensagem antes de enviar.' })

    // Na API oficial, texto livre so passa dentro da janela de 24h. Recusar
    // aqui evita gravar como "enviada" uma mensagem que a Meta vai rejeitar.
    if (whatsappService.activeProvider === 'meta' && !windowState(lead).open) {
      return res.status(409).json({
        code: 'window_closed',
        error: 'A janela de 24h fechou. Envie um template aprovado para retomar a conversa.',
      })
    }

    db.update('leads', lead.id, { aiEnabled: false, humanAssumedAt: new Date().toISOString() })
    const success = await whatsappService.sendMessage(lead.phone, text)

    const savedMsg = db.insert('messages', {
      id: `msg_${Date.now()}`,
      leadId: lead.id,
      from: 'agent',
      type: 'text',
      content: text,
      deliveryStatus: success ? 'sent' : 'pending_connection',
      timestamp: new Date().toISOString(),
    })

    // Responder uma conversa encerrada a reabre.
    db.update('leads', lead.id, {
      lastInteraction: new Date().toISOString(),
      ...(lead.conversationStatus === 'closed' ? { conversationStatus: 'open', reopenedAt: new Date().toISOString() } : {}),
    })

    io.emit('message:new', savedMsg)
    io.emit('lead:updated', db.find('leads', (l) => l.id === lead.id))

    res.json({ ok: true, message: savedMsg, delivered: success })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/whatsapp/send-media', requireAuth(), whatsappMediaUpload.single('file'), async (req, res) => {
  try {
    const { leadId, caption = '' } = req.body
    const lead = db.find('leads', (l) => l.id === leadId)
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem, áudio, vídeo ou documento válido de até 10 MB.' })
    req.file = await prepareWhatsAppUpload(req.file, { provider: whatsappService.activeProvider, asSticker: req.body.asSticker === 'true' })

    if (whatsappService.activeProvider === 'meta' && !windowState(lead).open) {
      return res.status(409).json({ code: 'window_closed', error: 'A janela de 24h fechou. Envie um template aprovado para retomar a conversa antes de mandar anexos.' })
    }
    if (whatsappService.activeProvider === 'meta' && !isMetaMediaTypeSupported(req.file.mimetype)) {
      return res.status(400).json({ error: 'A API oficial não aceita esse formato. Use JPG/PNG, MP4/3GPP, áudio AAC/M4A/MP3/AMR/OGG-Opus ou um documento compatível.' })
    }
    if (whatsappService.activeProvider === 'meta' && req.file.mimetype.startsWith('image/') && req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'A API oficial da Meta aceita imagens de até 5 MB.' })
    }

    const mediaType = req.file.mediaType || (req.file.mimetype.startsWith('image/')
      ? 'image'
      : req.file.mimetype.startsWith('audio/')
        ? 'audio'
        : req.file.mimetype.startsWith('video/')
          ? 'video'
          : 'file')
    const mediaBinaryFileId = `wa_${randomUUID()}`
    let storedInNeon = false
    try {
      storedInNeon = await db.putBinaryFile({
        id: mediaBinaryFileId,
        ownerId: lead.id,
        kind: 'whatsapp_media',
        mimeType: req.file.mimetype,
        fileName: String(req.file.originalname || 'anexo').slice(0, 180),
        data: req.file.buffer,
      })
    } catch (error) {
      console.warn('[Files] Não foi possível guardar a mídia no Neon; mantendo cópia local:', error?.message || error)
    }
    let mediaStorageKey
    if (!storedInNeon) {
      const leadFolder = String(lead.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
      const mediaFolder = path.join(WHATSAPP_UPLOAD_DIR, leadFolder)
      fs.mkdirSync(mediaFolder, { recursive: true })
      const mediaName = `${randomUUID()}${safeFileExtension(req.file.mimetype, req.file.originalname)}`
      const mediaPath = path.join(mediaFolder, mediaName)
      fs.writeFileSync(mediaPath, req.file.buffer)
      mediaStorageKey = path.relative(CRM_DATA_DIR, mediaPath)
    }

    db.update('leads', lead.id, { aiEnabled: false, humanAssumedAt: new Date().toISOString() })
    const delivered = await whatsappService.sendMedia(
      lead.phone,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      mediaType === 'sticker' ? '' : caption,
      { sticker: mediaType === 'sticker', gifPlayback: req.file.mediaIsGif },
    )
    const savedMsg = db.insert('messages', {
      id: `msg_${Date.now()}`,
      leadId: lead.id,
      from: 'agent',
      type: mediaType,
      content: mediaType === 'sticker' ? '[Figurinha]' : caption || (mediaType === 'image' ? '[Imagem]' : mediaType === 'video' ? '[Vídeo]' : mediaType === 'audio' ? '[Áudio]' : `[Arquivo: ${req.file.originalname}]`),
      mediaIsGif: req.file.mediaIsGif,
      mediaIsAnimated: req.file.mediaIsAnimated,
      ...(storedInNeon ? { mediaBinaryFileId } : { mediaStorageKey }),
      mediaMimeType: req.file.mimetype,
      mediaFileName: String(req.file.originalname || 'anexo').slice(0, 180),
      mediaSize: req.file.size,
      deliveryStatus: delivered ? 'sent' : 'pending_connection',
      timestamp: new Date().toISOString(),
    })

    db.update('leads', lead.id, { lastInteraction: new Date().toISOString() })
    io.emit('message:new', serializeMessage(savedMsg))
    if (mediaType === 'sticker' && caption.trim()) {
      const textDelivered = await whatsappService.sendMessage(lead.phone, caption.trim())
      const captionMessage = db.insert('messages', { id: `msg_${randomUUID()}`, leadId: lead.id, from: 'agent', type: 'text', content: caption.trim(), deliveryStatus: textDelivered ? 'sent' : 'pending_connection', timestamp: new Date().toISOString() })
      io.emit('message:new', serializeMessage(captionMessage))
    }
    io.emit('lead:updated', db.find('leads', (l) => l.id === lead.id))
    res.json({ ok: true, message: serializeMessage(savedMsg), delivered })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Não foi possível enviar o anexo.' })
  }
})

/* --------------------------------------------------------------------------
   Templates da Meta, novo contato e encerramento de conversa
   -------------------------------------------------------------------------- */
const sendMetaError = (res, err, fallback) => {
  if (err instanceof MetaError) return res.status(err.status).json({ error: err.message, code: err.code })
  console.error('[WhatsApp]', fallback, '-', err?.message || err)
  return res.status(500).json({ error: fallback })
}

const newMessageId = () => `msg_${Date.now()}_${randomUUID().slice(0, 6)}`

// Endereco publico do CRM (tunnel ou dominio). Vazio quando so existe localhost.
const resolvePublicUrl = () => {
  let publicUrl = String(process.env.PUBLIC_CRM_URL || '').trim()
  const runtimeFile = path.join(__dirname, '../../.runtime/public_url.txt')
  if (!publicUrl && fs.existsSync(runtimeFile)) publicUrl = fs.readFileSync(runtimeFile, 'utf-8').trim()
  return /^https:\/\/[^\s]+$/i.test(publicUrl) ? publicUrl.replace(/\/+$/, '') : ''
}

class SendBlocked extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

/**
 * Manda um texto para o lead e REGISTRA na conversa dele, dizendo a verdade
 * sobre a entrega. Usado pelo link do contrato e pela cobranca: antes a
 * cobranca respondia "enviado com sucesso" mesmo com o WhatsApp desligado e
 * a mensagem nem aparecia no atendimento.
 */
const sendTextToLead = async (lead, text, { sentBy, kind }) => {
  if (whatsappService.activeProvider === 'meta' && !windowState(lead).open) {
    throw new SendBlocked('A janela de 24h deste cliente fechou. Pela regra da Meta, retome a conversa com um template antes de mandar texto livre.', 'window_closed')
  }
  const delivered = await whatsappService.sendMessage(lead.phone, text)
  const message = db.insert('messages', {
    id: newMessageId(),
    leadId: lead.id,
    from: 'agent',
    type: 'text',
    kind,
    content: text,
    deliveryStatus: delivered ? 'sent' : 'pending_connection',
    sentBy,
    timestamp: new Date().toISOString(),
  })
  const updatedLead = db.update('leads', lead.id, {
    lastInteraction: new Date().toISOString(),
    ...(lead.conversationStatus === 'closed' ? { conversationStatus: 'open', reopenedAt: new Date().toISOString() } : {}),
  })
  io.emit('message:new', message)
  io.emit('lead:updated', updatedLead)
  return { delivered, message }
}

const sendBlockedOr500 = (res, err, fallback) => {
  if (err instanceof SendBlocked) return res.status(409).json({ error: err.message, code: err.code })
  console.error('[WhatsApp]', fallback, '-', err?.message || err)
  return res.status(500).json({ error: fallback })
}

// Linha de sistema no historico ("conversa encerrada por Fulano").
const insertSystemNote = (leadId, content) => {
  const note = db.insert('messages', {
    id: newMessageId(),
    leadId,
    from: 'system',
    type: 'text',
    content,
    timestamp: new Date().toISOString(),
  })
  io.emit('message:new', note)
  return note
}

app.get('/api/whatsapp/templates', requireAuth(), async (req, res) => {
  try {
    if (whatsappService.activeProvider !== 'meta') {
      return res.status(409).json({ code: 'provider_not_meta', error: 'Templates são um recurso da API oficial da Meta. No Baileys não há template.' })
    }
    res.json({ templates: await listTemplates({ refresh: req.query.refresh === '1' }) })
  } catch (err) {
    sendMetaError(res, err, 'Não foi possível listar os templates.')
  }
})

app.post('/api/whatsapp/send-template', requireAuth(), async (req, res) => {
  try {
    if (whatsappService.activeProvider !== 'meta') {
      return res.status(409).json({ code: 'provider_not_meta', error: 'O envio de template só existe na API oficial da Meta.' })
    }
    const lead = db.find('leads', (l) => l.id === req.body.leadId)
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })

    const result = await sendTemplate({
      phone: lead.phone,
      templateId: String(req.body.templateId || ''),
      bodyValues: req.body.bodyValues,
      headerValues: req.body.headerValues,
      headerMediaUrl: req.body.headerMediaUrl,
    })

    const savedMsg = db.insert('messages', {
      id: newMessageId(),
      leadId: lead.id,
      from: 'agent',
      type: 'template',
      templateName: result.template.name,
      content: result.rendered,
      metaMessageId: result.metaMessageId,
      deliveryStatus: 'sent',
      sentBy: req.user.id,
      timestamp: new Date().toISOString(),
    })
    const updatedLead = db.update('leads', lead.id, {
      lastInteraction: new Date().toISOString(),
      ...(lead.conversationStatus === 'closed' ? { conversationStatus: 'open', reopenedAt: new Date().toISOString() } : {}),
    })

    io.emit('message:new', savedMsg)
    io.emit('lead:updated', updatedLead)
    res.json({ ok: true, message: savedMsg, lead: updatedLead })
  } catch (err) {
    sendMetaError(res, err, 'Não foi possível enviar o template.')
  }
})

// Novo contato pelo atendimento. Nos dois provedores ele so CRIA o contato; o
// disparo do template e uma segunda chamada, que so existe na Meta.
app.post('/api/whatsapp/contacts', requireAuth(), (req, res) => {
  const name = String(req.body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const phone = normalizePhone(req.body.phone)
  if (name.length < 2) return res.status(400).json({ error: 'Informe o nome do contato.' })
  if (!phone) return res.status(400).json({ error: 'Telefone inválido. Use DDD + número, por exemplo (41) 99999-0000.' })

  // Mesmo numero nao vira dois contatos: devolve o que ja existe.
  const key = phoneKey(phone)
  const existing = db.find('leads', (lead) => phoneKey(lead.phone) === key)
  if (existing) return res.json({ lead: existing, existing: true })

  const now = new Date().toISOString()
  const lead = db.insert('leads', {
    id: `lead_${Date.now()}_${randomUUID().slice(0, 6)}`,
    name,
    phone,
    email: '',
    stage: 'novo_lead',
    origin: 'Contato adicionado',
    utmSource: 'crm',
    utmMedium: 'manual',
    utmCampaign: 'contato_ativo',
    equipmentInterest: 'A definir',
    modality: 'locacao',
    estimatedPeriod: '30 dias',
    aiSummary: 'Contato adicionado pela equipe. Ainda sem conversa.',
    aiEnabled: true,
    lastInteraction: now,
    assignedTo: req.user.id,
    value: 0,
    notes: '',
    conversationStatus: 'open',
    createdAt: now,
  })
  io.emit('lead:new', lead)
  io.emit('lead:updated', lead)
  res.status(201).json({ lead, existing: false })
})

app.put('/api/leads/:id/conversation', requireAuth(), (req, res) => {
  const status = req.body.status
  if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'Status inválido.' })
  const lead = db.find('leads', (l) => l.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
  if ((lead.conversationStatus || 'open') === status) return res.json(lead)

  const now = new Date().toISOString()
  const updated = db.update('leads', lead.id, status === 'closed'
    ? { conversationStatus: 'closed', closedAt: now, closedBy: req.user.id }
    : { conversationStatus: 'open', reopenedAt: now })

  const who = req.user.name || req.user.email || 'equipe'
  insertSystemNote(lead.id, status === 'closed' ? `Conversa encerrada por ${who}.` : `Conversa reaberta por ${who}.`)
  io.emit('lead:updated', updated)
  res.json(updated)
})

// Meta Cloud API Webhook Verification
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const settings = db.getSettings()
  if (mode === 'subscribe' && token === settings.metaConfig.verifyToken) {
    console.log('[Meta Webhook] Verificado com sucesso!')
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Meta Cloud API Webhook Receiver
// Esta rota e publica por natureza (a Meta chama sem login). Sem conferir a
// assinatura, qualquer um que descubra a URL injeta mensagens falsas: cria
// lead, gasta cota do Gemini e faz o numero da empresa responder a terceiros.
// A Meta assina o corpo com o App Secret em X-Hub-Signature-256.
let warnedUnsignedWebhook = false
const isSignedByMeta = (req) => {
  const appSecret = db.getSettings().metaConfig?.appSecret || process.env.META_APP_SECRET || ''
  if (!appSecret) {
    if (!warnedUnsignedWebhook) {
      console.warn('[Meta Webhook] App Secret não configurado: o webhook está aceitando chamadas SEM conferir a assinatura. Configure em Ajustes.')
      warnedUnsignedWebhook = true
    }
    return true
  }
  const received = String(req.headers['x-hub-signature-256'] || '')
  if (!received.startsWith('sha256=') || !req.rawBody) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    if (!isSignedByMeta(req)) return res.sendStatus(401)
    const body = req.body
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value || {}
          for (const status of value.statuses || []) {
            whatsappService.handleMetaStatus(status)
          }
          if (value.messages) {
            for (const message of value.messages) {
              const sender = String(message.from || '').replace(/\D/g, '')
              const contactName = (value.contacts || []).find((contact) => String(contact.wa_id || '').replace(/\D/g, '') === sender)?.profile?.name
              await whatsappService.handleIncomingMessage({ ...message, contactName }, 'meta')
            }
          }
        }
      }
      return res.sendStatus(200)
    }
    res.sendStatus(404)
  } catch (err) {
    console.error('[Meta Webhook] Erro ao receber mensagem:', err)
    res.sendStatus(500)
  }
})

/* ==========================================================================
   LEADS & KANBAN ROUTES
   ========================================================================== */
registerCommercialRoutes(app, { database: db, requireAuth, emit: (event, value) => io.emit(event, value) })
registerFreightApiRoutes(app,{database:db,requireAuth,emit:(event,value)=>io.emit(event,value)})
configureAutomaticContracts((event,value)=>io.emit(event,value))
registerFunnelRoutes(app, { database: db, requireAuth, emit: (event, value) => io.emit(event, value) })
app.get('/api/leads', requireAuth(), (req, res) => {
  const leads = db.get('leads')
  res.json(leads)
})
registerConversationRoutes(app, { database: db, requireAuth, photos: createContactPhotoService({
  getConnection: () => ({ provider: whatsappService.activeProvider, status: whatsappService.status, socket: whatsappService.socket, sessionId: whatsappService.instanceId + ':' + (whatsappService.socket?.user?.id || '') }),
}) })

app.get('/api/users', requireAuth(['admin']), (_req, res) => {
  res.json(db.get('users').map(({ id, name, email, role }) => ({ id, name, email, role })))
})

app.get('/api/notifications', requireAuth(), (req, res) => {
  const notifications = db.filter('notifications', (item) => item.recipientId === req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50)
  res.json(notifications)
})

app.get('/api/notifications/:id', requireAuth(), (req, res) => {
  const notification = db.find('notifications', (item) => item.id === req.params.id && item.recipientId === req.user.id)
  if (!notification) return res.status(404).json({ error: 'Notificação não encontrada' })
  res.json(notification)
})

app.put('/api/notifications/:id/read', requireAuth(), (req, res) => {
  const notification = db.find('notifications', (item) => item.id === req.params.id && item.recipientId === req.user.id)
  if (!notification) return res.status(404).json({ error: 'Notificação não encontrada' })
  const updated = db.update('notifications', notification.id, { readAt: notification.readAt || new Date().toISOString() })
  res.json(updated)
})

app.put('/api/notifications/read-all', requireAuth(), (req, res) => {
  const readAt = new Date().toISOString()
  const updated = db.filter('notifications', (item) => item.recipientId === req.user.id && !item.readAt)
    .map((item) => db.update('notifications', item.id, { readAt }))
  res.json({ ok: true, updated: updated.length })
})

app.get('/api/push/public-key', requireAuth(), (_req, res) => {
  if (!pushIsConfigured()) return res.status(503).json({ error: 'Notificações push indisponíveis neste servidor.' })
  res.json({ publicKey: getPushPublicKey() })
})

app.post('/api/push/subscribe', requireAuth(), async (req, res) => {
  const subscription = req.body?.subscription
  const endpoint = String(subscription?.endpoint || '')
  try {
    const parsedEndpoint = new URL(endpoint)
    if (parsedEndpoint.protocol !== 'https:' || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Assinatura de notificações inválida.' })
    }
    if (!pushIsConfigured()) return res.status(503).json({ error: 'Notificações push indisponíveis neste servidor.' })

    await db.ready
    const id = subscriptionId(endpoint)
    const existing = db.find('pushSubscriptions', (item) => item.id === id)
    const record = {
      id,
      recipientId: req.user.id,
      subscription,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
      updatedAt: new Date().toISOString(),
    }
    if (existing) db.update('pushSubscriptions', id, record)
    else db.insert('pushSubscriptions', { ...record, createdAt: record.updatedAt })
    await db.flush()
    res.json({ ok: true })
  } catch (error) {
    res.status(400).json({ error: error instanceof TypeError ? 'Endereço de assinatura inválido.' : 'Não foi possível salvar a assinatura de notificações.' })
  }
})

app.delete('/api/push/subscribe', requireAuth(), async (req, res) => {
  const endpoint = String(req.body?.endpoint || '')
  if (!endpoint) return res.status(400).json({ error: 'Assinatura não informada.' })
  await db.ready
  const id = subscriptionId(endpoint)
  const existing = db.find('pushSubscriptions', (item) => item.id === id && item.recipientId === req.user.id)
  if (existing) {
    db.delete('pushSubscriptions', id)
    await db.flush()
  }
  res.json({ ok: true })
})

app.post('/api/push/test', requireAuth(), async (req, res) => {
  await db.ready
  const hasSubscription = db.filter('pushSubscriptions', (item) => item.recipientId === req.user.id).length > 0
  if (!hasSubscription) return res.status(409).json({ error: 'Ative as notificações neste dispositivo antes de enviar um teste.' })
  const result = await deliverPushToUser(req.user.id, {
    title: 'Notificação ativada',
    body: 'O CRM Grupo YR pode avisar você quando uma qualificação precisar de atendimento.',
    url: '/',
    tag: 'yr-crm-push-test',
  })
  if (!result.delivered) return res.status(502).json({ error: 'O navegador não confirmou a entrega do teste. Confira as permissões de notificação.' })
  res.json({ ok: true, delivered: result.delivered })
})

app.post('/api/leads', requireAuth(), (req, res) => {
  try {
    const newLead = {
      id: `lead_${Date.now()}`,
      name: req.body.name || 'Novo Lead',
      phone: req.body.phone,
      email: req.body.email || '',
      stage: req.body.stage || 'novo_lead',
      origin: req.body.origin || 'Google Orgânico',
      utmSource: req.body.utmSource || 'direct',
      utmMedium: req.body.utmMedium || 'none',
      utmCampaign: req.body.utmCampaign || 'organic',
      equipmentInterest: req.body.equipmentInterest || 'Cama hospitalar articulada',
      modality: req.body.modality || 'locacao',
      estimatedPeriod: req.body.estimatedPeriod || '30 dias',
      aiSummary: 'Lead adicionado manualmente pela equipe.',
      aiEnabled: req.body.aiEnabled ?? true,
      lastInteraction: new Date().toISOString(),
      assignedTo: req.body.assignedTo || req.user.id,
      value: Number(req.body.value) || 480.0,
      notes: req.body.notes || '',
      createdAt: new Date().toISOString(),
    }

    db.insert('leads', newLead)
    io.emit('lead:new', newLead)
    res.status(201).json(newLead)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.put('/api/leads/:id/stage', requireAuth(), (req, res) => {
  const { stage } = req.body
  if (!FUNNEL_STAGES.includes(stage)) return res.status(400).json({ error: 'Etapa do funil inválida.' })
  const current = db.find('leads', lead => lead.id === req.params.id)
  if (current && !isInFunnel(current)) return res.status(409).json({ error: 'Restaure este cartão pela Lixeira antes de mudar a etapa.' })
  const updated = db.update('leads', req.params.id, { stage })
  if (!updated) return res.status(404).json({ error: 'Lead não encontrado' })

  io.emit('lead:stage_changed', updated)
  res.json(updated)
})

// Ficha de fechamento: dados do cliente, endereco, itens, entrega e checklist.
// O corpo passa por sanitizeLeadDetails: so campos conhecidos, com tipo e
// tamanho limitados, chegam ao banco.
app.put('/api/leads/:id/details', requireAuth(), (req, res) => {
  const existing = db.find('leads', (lead) => lead.id === req.params.id)
  if (!existing) return res.status(404).json({ error: 'Lead não encontrado' })

  if (Object.hasOwn(req.body || {}, 'name') && (typeof req.body.name !== 'string' || req.body.name.trim().length < 2)) return res.status(400).json({ error: 'Informe o nome completo do cliente.' })
  if (Object.hasOwn(req.body || {}, 'phone')) {
    const requestedPhone = normalizePhone(req.body.phone)
    if (!requestedPhone) return res.status(400).json({ error: 'Informe um telefone válido com DDD.' })
    if (db.find('leads', other => other.id !== existing.id && phoneKey(other.phone) === phoneKey(requestedPhone))) return res.status(409).json({ error: 'Este telefone já pertence a outro contato. Confira o cadastro antes de alterar.' })
  }
  const updated = db.update('leads', req.params.id, sanitizeLeadDetails({ ...existing, ...req.body, addressData: { ...(existing.addressData || {}), ...(req.body?.addressData || {}) } }, db.get('equipments')))
  io.emit('lead:updated', updated)
  res.json(updated)
})

registerYriaControlRoute(app, {
  database: db, requireAuth,
  cancel: leadId => whatsappService.cancelAiReply(leadId),
  emit: (event, value) => io.emit(event, value),
})

app.post('/api/leads/:id/ai-summary', requireAuth(), (req, res) => {
  const lead = db.find('leads', l => l.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
  const recovered = rebuildLeadQualification(lead, db.filter('messages', m => m.leadId === lead.id), getYriaConfiguration(db.getSettings()).published.config)
  const summary = recovered.aiSummary
  const updated = db.update('leads', lead.id, recovered)
  io.emit('lead:updated', updated)
  res.json({ summary, qualification: updated.qualificationData, lead: updated })
})

app.get('/api/leads/:id/messages', requireAuth(), (req, res) => {
  const messages = db.filter('messages', (m) => m.leadId === req.params.id)
  res.json(messages.filter(message => !message.hidden).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || Date.parse(a.receivedAt || a.timestamp) - Date.parse(b.receivedAt || b.timestamp)).map(serializeMessage))
})

app.get('/api/leads/:id/messages/sync', requireAuth(), (req, res) => {
  if (!db.find('leads', item => item.id === req.params.id)) return res.status(404).json({ error: 'Contato não encontrado.' })
  res.json({ sync: whatsappService.getHistoryJob(req.params.id) })
})

app.post('/api/leads/:id/messages/sync', requireAuth(), async (req, res) => {
  const lead = db.find('leads', item => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Contato não encontrado.' })
  if (whatsappService.activeProvider !== 'baileys' || whatsappService.status !== 'connected') return res.status(409).json({ error: 'Conecte o WhatsApp para sincronizar o histórico.' })
  try {
    const sync = await whatsappService.requestHistorySync(lead.id)
    res.status(202).json({ ok: true, sync })
  } catch { res.status(502).json({ error: 'Não foi possível solicitar o histórico ao WhatsApp.' }) }
})

app.get('/api/leads/:id/messages/:messageId/media', requireAuth(), async (req, res) => {
  let message = db.find('messages', (item) => item.id === req.params.messageId && item.leadId === req.params.id)
  if (message?.whatsappSource && !message.mediaStorageKey && !message.mediaBinaryFileId) message = await whatsappService.ensureMessageMedia(message)
  if (!message?.mediaStorageKey && !message?.mediaBinaryFileId) return res.status(404).json({ error: 'Mídia não encontrada' })
  if (message.mediaBinaryFileId) {
    const file = await db.getBinaryFile(message.mediaBinaryFileId, { ownerId: message.leadId, kind: 'whatsapp_media' })
    if (file) return sendFileBuffer(res, file, req.query.download === '1')
  }
  const filePath = storedFilePath(message.mediaStorageKey)
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' })
  const data = fs.readFileSync(filePath)
  try {
    const binaryId = message.mediaBinaryFileId || `wa_migrated_${message.id}`
    const stored = await db.putBinaryFile({
      id: binaryId,
      ownerId: message.leadId,
      kind: 'whatsapp_media',
      mimeType: message.mediaMimeType || 'application/octet-stream',
      fileName: message.mediaFileName || 'anexo',
      data,
    })
    if (stored && !message.mediaBinaryFileId) db.update('messages', message.id, { mediaBinaryFileId: binaryId })
  } catch (error) {
    console.warn('[Files] Mídia legada mantida no disco local:', error?.message || error)
  }
  sendFileBuffer(res, { data, mimeType: message.mediaMimeType, fileName: message.mediaFileName }, req.query.download === '1')
})

app.get('/api/leads/:id/attachments', requireAuth(), (req, res) => {
  const lead = db.find('leads', (item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
  const attachments = db.filter('leadAttachments', (item) => item.leadId === lead.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(({ storageKey, binaryFileId, ...item }) => item)
  res.json(attachments)
})

app.post('/api/leads/:id/attachments', requireAuth(), leadAttachmentUpload.single('file'), async (req, res) => {
  const lead = db.find('leads', (item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' })
  if (!req.file) return res.status(400).json({ error: 'Selecione um anexo permitido de até 15 MB.' })

  const id = `att_${randomUUID()}`
  let storedInNeon = false
  try {
    storedInNeon = await db.putBinaryFile({
      id,
      ownerId: lead.id,
      kind: 'lead_attachment',
      mimeType: req.file.mimetype,
      fileName: String(req.file.originalname || 'anexo').slice(0, 180),
      data: req.file.buffer,
    })
  } catch (error) {
    console.warn('[Files] Não foi possível guardar o anexo no Neon; mantendo cópia local:', error?.message || error)
  }
  let storageKey
  if (!storedInNeon) {
    const leadFolder = String(lead.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
    const targetFolder = path.join(LEAD_UPLOAD_DIR, leadFolder)
    fs.mkdirSync(targetFolder, { recursive: true })
    const fileName = `${randomUUID()}${safeFileExtension(req.file.mimetype, req.file.originalname)}`
    const filePath = path.join(targetFolder, fileName)
    fs.writeFileSync(filePath, req.file.buffer)
    storageKey = path.relative(CRM_DATA_DIR, filePath)
  }
  const attachment = db.insert('leadAttachments', {
    id,
    leadId: lead.id,
    ...(storedInNeon ? { binaryFileId: id } : { storageKey }),
    fileName: String(req.file.originalname || 'anexo').slice(0, 180),
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user.id,
    createdAt: new Date().toISOString(),
  })
  const safeAttachment = { ...attachment }
  delete safeAttachment.storageKey
  delete safeAttachment.binaryFileId
  res.status(201).json(safeAttachment)
})

app.get('/api/leads/:id/attachments/:attachmentId', requireAuth(), async (req, res) => {
  const attachment = db.find('leadAttachments', (item) => item.id === req.params.attachmentId && item.leadId === req.params.id)
  if (!attachment) return res.status(404).json({ error: 'Anexo não encontrado' })
  if (attachment.binaryFileId) {
    const file = await db.getBinaryFile(attachment.binaryFileId, { ownerId: attachment.leadId, kind: 'lead_attachment' })
    if (file) return sendFileBuffer(res, file, true)
  }
  const filePath = storedFilePath(attachment.storageKey)
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' })
  const data = fs.readFileSync(filePath)
  try {
    const stored = await db.putBinaryFile({
      id: attachment.id,
      ownerId: attachment.leadId,
      kind: 'lead_attachment',
      mimeType: attachment.mimeType || 'application/octet-stream',
      fileName: attachment.fileName || 'anexo',
      data,
    })
    if (stored && !attachment.binaryFileId) db.update('leadAttachments', attachment.id, { binaryFileId: attachment.id })
  } catch (error) {
    console.warn('[Files] Anexo legado mantido no disco local:', error?.message || error)
  }
  sendFileBuffer(res, { data, mimeType: attachment.mimeType, fileName: attachment.fileName }, true)
})

/* ==========================================================================
   EQUIPMENT & INVENTORY ROUTES
   ========================================================================== */
app.get('/api/leads/:id/checklist.pdf', requireAuth(), async (req, res) => {
  const lead = db.find('leads', (item) => item.id === req.params.id)
  if (!lead) return res.status(404).json({ error: 'Cliente não encontrado' })
  try {
    const data = await createDeliveryChecklistPdf(lead)
    const name = String(lead.name || lead.id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70)
    sendFileBuffer(res, { data, mimeType: 'application/pdf', fileName: `checklist-entrega-${name}.pdf` }, true)
  } catch (error) {
    console.error('[PDF] Falha ao gerar checklist:', error?.message || error)
    res.status(500).json({ error: 'Não foi possível gerar o checklist em PDF.' })
  }
})

const PRODUCT_CATEGORY_CODES = {
  Camas: 'CAM',
  Macas: 'MAC',
  Emergência: 'EMG',
  Mobiliário: 'MOB',
  Acessórios: 'ACE',
}

const normalizeProductCode = (value, name, category) => {
  const clean = (input) => String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const provided = clean(value)
  if (provided) return (provided.startsWith('YR-') ? provided : `YR-${provided}`).slice(0, 32).replace(/-+$/, '')

  const categoryCode = PRODUCT_CATEGORY_CODES[category] || 'PRO'
  const modelCode = clean(name).split('-').filter(Boolean).slice(0, 3).join('-').slice(0, 20).replace(/-+$/, '') || 'ITEM'
  return `YR-${categoryCode}-${modelCode}`.slice(0, 32).replace(/-+$/, '')
}

const nextPatrimonySequence = () => db.get('equipments').reduce((highest, item) => {
  const sequence = Number(String(item.serialNumber || '').match(/(\d+)$/)?.[1] || 0)
  return Math.max(highest, sequence)
}, 0) + 1

app.get('/api/equipments', requireAuth(), (req, res) => {
  res.json(db.get('equipments').filter((e) => !e.archived))
})

// Exclusao segura: apaga de vez se nada referencia o item; senao arquiva
// (archived + status 'arquivado') para nao quebrar historico de contratos/cotacoes.
app.delete('/api/equipments/:id', requireAuth(['admin']), (req, res) => {
  try {
    const id = req.params.id
    const eq = db.find('equipments', (e) => e.id === id)
    if (!eq || eq.archived) return res.status(404).json({ error: 'Equipamento não encontrado.' })
    if (eq.reservationContractId || ['alugado', 'vendido', 'reservado'].includes(eq.status)) {
      return res.status(409).json({ error: 'Item alugado, reservado ou vendido não pode ser excluído. Resolva pelo contrato primeiro.' })
    }
    const referenced = Object.keys(db.data || {}).some((collection) => (
      collection !== 'equipments' && Array.isArray(db.data[collection])
      && db.data[collection].some((record) => JSON.stringify(record).includes(id))
    ))
    if (referenced) {
      db.update('equipments', id, {
        archived: true, status: 'arquivado', archivedAt: new Date().toISOString(), archivedBy: req.user?.id || null,
      })
      return res.json({ id, mode: 'archived' })
    }
    db.delete('equipments', id)
    res.json({ id, mode: 'deleted' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/equipments', requireAuth(['admin']), (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 160)
    if (!name) throw new Error('Informe o nome ou modelo do equipamento.')

    const quantity = Number(req.body.quantity ?? 1)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error('A quantidade deve ser um número inteiro entre 1 e 100.')
    }

    const category = String(req.body.category || 'Camas').trim().slice(0, 40)
    const productCode = normalizeProductCode(req.body.productCode, name, category)
    let patrimony = nextPatrimonySequence()
    const created = []

    for (let index = 0; index < quantity; index += 1) {
      const newEq = {
        id: `eq_${randomUUID()}`,
        serialNumber: quantity === 1 && req.body.serialNumber
          ? String(req.body.serialNumber).trim().slice(0, 60)
          : `YR-PAT-${String(patrimony++).padStart(4, '0')}`,
        productCode,
        name,
        category,
        status: req.body.status || 'disponivel',
        currentLeadId: null,
        currentClientName: null,
        monthlyPrice: Number(req.body.monthlyPrice) || 0,
        salePrice: Number(req.body.salePrice) || 0,
        location: String(req.body.location || 'Galpão Principal YR').trim().slice(0, 120),
        lastSanitized: new Date().toISOString(),
        sanitizationCert: `LAUDO-ANVISA-${Math.floor(100 + Math.random() * 900)}`,
      }
      db.insert('equipments', newEq)
      created.push(newEq)
    }

    res.status(201).json({ items: created, count: created.length, productCode })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.put('/api/equipments/:id/status', requireAuth(), (req, res) => {
  const { status } = req.body
  const eq=db.find('equipments',e=>e.id===req.params.id)
  if(!eq)return res.status(404).json({error:'Equipamento não encontrado.'})
  if(eq.reservationContractId||eq.status==='vendido')return res.status(409).json({error:'Item reservado/vendido. Resolva pelo contrato, sem liberar estoque manualmente.'})
  if(!['disponivel','alugado','higienizacao','manutencao'].includes(status))return res.status(400).json({error:'Status inválido.'})
  const updated = db.update('equipments', req.params.id, {
    status,
    ...(status === 'disponivel' ? { currentLeadId: null, currentClientName: null } : {}),
  })
  res.json(updated)
})

/* ==========================================================================
   CONTRACTS & SIGNATURE ROUTES
   ========================================================================== */
app.get('/api/contracts', requireAuth(), (req, res) => {
  res.json(db.get('contracts').map(ensureSigningToken).map((contract) => ({
    ...contract,
    nextStatuses: allowedContractStatuses(contract),
  })))
})

// Cancelar, encerrar ou reativar. A tabela de transicoes fica em contracts.js.
app.put('/api/contracts/:id/status', requireAuth(), async (req, res) => {
  try {
    const result = await changeContractStatus(req.params.id, String(req.body.status || ''), {
      reason: req.body.reason,
      user: req.user,
    })
    io.emit('contract:updated', result.contract)
    if (result.lead) io.emit('lead:updated', result.lead)
    res.json({
      contract: { ...result.contract, nextStatuses: allowedContractStatuses(result.contract) },
      releasedEquipments: result.released.length,
      cancelledInvoices: result.cancelledInvoices.length,
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Manda o link de assinatura direto no WhatsApp do lead do contrato.
app.post('/api/contracts/:id/send-link', requireAuth(), async (req, res) => {
  try {
    const found = db.find('contracts', (c) => c.id === req.params.id)
    if (!found) return res.status(404).json({ error: 'Contrato não encontrado' })
    if (found.status !== 'pendente_assinatura') {
      return res.status(409).json({ error: 'Só dá para enviar o link de um contrato que está aguardando assinatura.' })
    }
    const contract = ensureSigningToken(found)
    const lead = db.find('leads', (l) => l.id === contract.leadId)
    if (!lead?.phone) return res.status(409).json({ code: 'no_lead', error: 'Este contrato não está ligado a um contato com WhatsApp.' })

    const baseUrl = resolvePublicUrl()
    if (!baseUrl) {
      return res.status(409).json({
        code: 'no_public_url',
        error: 'O CRM ainda não tem endereço público, então o link só abriria neste computador. Inicie o tunnel (ou defina PUBLIC_CRM_URL) e tente de novo.',
      })
    }

    const firstName = String(lead.name || '').trim().split(/\s+/)[0] || 'tudo bem'
    const text = `Olá, ${firstName}! Seu contrato ${contract.number} com o Grupo YR Hospitalar está pronto. É só abrir o link, conferir e assinar com o dedo na tela:\n${baseUrl}/assinar/${encodeURIComponent(contract.signingToken)}`
    const { delivered, message } = await sendTextToLead(lead, text, { sentBy: req.user.id, kind: 'contract_link' })

    db.update('contracts', contract.id, { linkSentAt: new Date().toISOString(), linkSentBy: req.user.id })
    res.json({ ok: true, delivered, leadId: lead.id, message })
  } catch (err) {
    sendBlockedOr500(res, err, 'Não foi possível enviar o link do contrato.')
  }
})

app.get('/api/contracts/:id/items/catalog', requireAuth(['admin']), (req, res) => {
  res.json(contractItemCatalog())
})

app.post('/api/contracts/:id/items', requireAuth(['admin']), (req, res) => {
  try {
    const contract = addContractItem(req.params.id, req.body || {}, req.user)
    io.emit('contract:updated', contract)
    res.status(201).json(contract)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

app.delete('/api/contracts/:id/items/:index', requireAuth(['admin']), (req, res) => {
  try {
    const contract = removeContractItem(req.params.id, req.params.index, req.user)
    io.emit('contract:updated', contract)
    res.json(contract)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

for (const [action, flag] of [['archive', true], ['unarchive', false]]) {
  app.post(`/api/contracts/:id/${action}`, requireAuth(['admin']), (req, res) => {
    try {
      const contract = setContractArchived(req.params.id, flag, req.user)
      io.emit('contract:updated', contract)
      res.json(contract)
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message })
    }
  })
}

app.post('/api/contracts', requireAuth(), (req, res) => {
  try {
    const contract = createContract(req.body)
    io.emit('contract:new', contract)
    contractEmail.onCreated(contract)
    res.status(201).json(contract)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/contracts/signing/:token', (req, res) => {
  const contract = findContractBySigningToken(req.params.token)
  if (!contract) return res.status(404).json({ error: 'Link de assinatura inválido ou expirado.' })

  const { signingToken, signerIp, emailRecipient, ...publicContract } = contract
  res.json({ contract: publicContract })
})

app.get('/api/contracts/signing/:token/html', (req, res) => {
  const contract = findContractBySigningToken(req.params.token)
  if (!contract) return res.status(404).send('Link de assinatura inválido ou expirado.')

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderContractHtml(contract))
})

app.post('/api/contracts/signing/:token/sign', async (req, res) => {
  try {
    const contract = findContractBySigningToken(req.params.token)
    if (!contract) return res.status(404).json({ error: 'Link de assinatura inválido ou expirado.' })

    const { signatureDataUrl, signerName } = req.body
    const signerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'
    const signedContract = await signContract(contract.id, signatureDataUrl, signerIp, signerName, req.body.accepted)
    await db.flush?.()

    io.emit('contract:signed', signedContract)
    contractEmail.onSigned(signedContract)
    io.emit('lead:updated', db.find('leads', (l) => l.id === signedContract.leadId))
    res.json({ ok: true, contract: signedContract })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/contracts/:id/html', requireAuth(), (req, res) => {
  const contract = db.find('contracts', (c) => c.id === req.params.id)
  if (!contract) return res.status(404).send('Contrato não encontrado')

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderContractHtml(contract))
})

app.get('/api/contracts/:id/pdf', requireAuth(), async (req, res) => {
  const contract = db.find('contracts', (item) => item.id === req.params.id)
  if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' })
  try {
    const data = await createContractPdf(contract)
    sendFileBuffer(res, { data, mimeType: 'application/pdf', fileName: `${contract.number || 'contrato'}-grupo-yr.pdf` }, true)
  } catch (error) {
    console.error('[PDF] Falha ao gerar contrato:', error?.message || error)
    res.status(500).json({ error: 'Não foi possível gerar o contrato em PDF.' })
  }
})

app.post('/api/contracts/:id/sign', requireAuth(), async (req, res) => {
  try {
    const { signatureDataUrl, signerName } = req.body
    const signerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'

    const signedContract = await signContract(req.params.id, signatureDataUrl, signerIp, signerName, req.body.accepted)
    await db.flush?.()

    io.emit('contract:signed', signedContract)
    contractEmail.onSigned(signedContract)
    io.emit('lead:updated', db.find('leads', (l) => l.id === signedContract.leadId))

    res.json({ ok: true, contract: signedContract })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/* ==========================================================================
   FINANCE & INVOICES ROUTES
   ========================================================================== */
app.get('/api/finance/invoices', requireAuth(), (req, res) => {
  res.json(db.get('invoices'))
})

/* Versioned calendar, team, and contract-cost APIs */
registerOperationsRoutes(app, { db, requireAuth })

app.post('/api/finance/invoices', requireAuth(), (req, res) => {
  const { contractNumber, clientName, leadId, amount, dueDate, status } = req.body
  const normalizedContractNumber = String(contractNumber || '').trim()
  const normalizedClientName = String(clientName || '').trim()
  const normalizedLeadId = typeof leadId === 'string' && leadId.trim() ? leadId.trim() : null
  const normalizedAmount = Number(amount)
  const normalizedStatus = status || 'pendente'

  if (!normalizedContractNumber || !normalizedClientName) {
    return res.status(400).json({ error: 'Informe o contrato e o cliente da fatura.' })
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({ error: 'O valor da fatura deve ser maior que zero.' })
  }
  if (!['pendente', 'paga'].includes(normalizedStatus)) {
    return res.status(400).json({ error: 'Status de fatura inválido.' })
  }
  if (normalizedLeadId && !db.find('leads', (lead) => lead.id === normalizedLeadId)) {
    return res.status(400).json({ error: 'O cliente selecionado não foi encontrado no CRM.' })
  }

  const newInvoice = {
    id: `inv_${Date.now()}`,
    contractNumber: normalizedContractNumber,
    clientName: normalizedClientName,
    leadId: normalizedLeadId,
    amount: normalizedAmount,
    dueDate: dueDate || new Date().toISOString().split('T')[0],
    status: normalizedStatus,
    paidAt: normalizedStatus === 'paga' ? new Date().toISOString() : null,
  }
  db.insert('invoices', newInvoice)
  res.status(201).json(newInvoice)
})

app.put('/api/finance/invoices/:id/pay', requireAuth(), (req, res) => {
  const updated = db.update('invoices', req.params.id, {
    status: 'paga',
    paidAt: new Date().toISOString(),
  })
  res.json(updated)
})

app.post('/api/finance/invoices/:id/send-reminder', requireAuth(), async (req, res) => {
  try {
    const invoice = db.find('invoices', (i) => i.id === req.params.id)
    if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada' })
    if (invoice.status === 'paga' || invoice.status === 'cancelada') {
      return res.status(409).json({ error: 'Esta fatura não está em aberto.' })
    }

    const lead = db.find('leads', (l) => l.id === invoice.leadId)
    if (!lead) return res.status(404).json({ error: 'Cliente não encontrado' })

    const firstName = String(lead.name || '').trim().split(/\s+/)[0] || lead.name
    // Data pura (YYYY-MM-DD) vira meia-noite UTC e mostra o dia anterior no Brasil.
    const due = new Date(String(invoice.dueDate).length === 10 ? `${invoice.dueDate}T00:00:00` : invoice.dueDate)
    const amount = Number(invoice.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const text = `Olá, ${firstName}! Passando para lembrar da fatura ${invoice.contractNumber ? `do contrato ${invoice.contractNumber} ` : ''}no valor de ${amount}, com vencimento em ${due.toLocaleDateString('pt-BR')}. Chave Pix: financeiro@grupoyrhospitalar.com.br. Qualquer dúvida, é só responder por aqui.`

    const { delivered, message } = await sendTextToLead(lead, text, { sentBy: req.user.id, kind: 'invoice_reminder' })
    db.update('invoices', invoice.id, { lastReminderAt: new Date().toISOString() })

    res.json({
      ok: true,
      delivered,
      leadId: lead.id,
      message: delivered
        ? `Cobrança enviada para ${lead.name} pelo WhatsApp.`
        : 'O WhatsApp está desconectado: a cobrança ficou registrada na conversa, mas ainda não saiu.',
      savedMessage: message,
    })
  } catch (err) {
    sendBlockedOr500(res, err, 'Não foi possível enviar a cobrança.')
  }
})

/* ===========================================================================
   BLOG EDITORIAL
   =========================================================================== */
const makeBlogSlug = (value = '') => value
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120)

const normalizeBlogPost = (body, existing = {}) => {
  const title = (body.title || existing.title || '').trim()
  const status = body.status === 'published' ? 'published' : 'draft'
  const slug = makeBlogSlug(body.slug || title || existing.slug)

  if (!title) throw new Error('Informe o título do artigo.')
  if (!slug) throw new Error('Não foi possível criar a URL amigável do artigo.')

  return {
    ...existing,
    title,
    slug,
    summary: (body.summary || '').trim().slice(0, 320),
    content: (body.content || '').trim(),
    category: (body.category || 'Cuidado em casa').trim().slice(0, 60),
    status,
    coverImage: body.coverImage || null,
    coverAlt: (body.coverAlt || '').trim().slice(0, 180),
    gallery: Array.isArray(body.gallery) ? body.gallery.filter(Boolean).slice(0, 8) : [],
    seoTitle: (body.seoTitle || title).trim().slice(0, 70),
    seoDescription: (body.seoDescription || body.summary || '').trim().slice(0, 160),
    publishedAt: status === 'published' ? (existing.publishedAt || new Date().toISOString()) : null,
    updatedAt: new Date().toISOString(),
  }
}

// Quando o CRM alcanca o banco do site (blog.js), a Central editorial escreve
// direto no blog publico. Sem isso ela continua local e a tela avisa.
const sendBlogError = (res, error, fallback) => {
  if (error instanceof siteBlog.BlogError) return res.status(error.status).json({ error: error.message })
  console.error('[Blog]', fallback, '-', error?.code || error?.message || error)
  return res.status(503).json({ error: fallback })
}

app.get('/api/blog/status', requireAuth(), async (_req, res) => {
  res.json({ linked: await siteBlog.isLinked(), siteUrl: 'https://site.grupoyrhospitalar.com.br/blog' })
})

app.get('/api/blog/posts', requireAuth(), async (_req, res) => {
  try {
    if (await siteBlog.isLinked()) return res.json(await siteBlog.listPosts())
  } catch (error) {
    return sendBlogError(res, error, 'Não foi possível carregar os artigos do site.')
  }
  const posts = db.get('blog_posts').toSorted((a, b) => (
    new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  ))
  res.json(posts)
})

app.post('/api/blog/posts', requireAuth(['admin']), async (req, res) => {
  try {
    if (await siteBlog.isLinked()) return res.status(201).json(await siteBlog.savePost(null, req.body))
  } catch (error) {
    return sendBlogError(res, error, 'Não foi possível salvar o artigo no site.')
  }
  try {
    const post = normalizeBlogPost(req.body)
    if (db.find('blog_posts', (item) => item.slug === post.slug)) {
      return res.status(409).json({ error: 'Já existe um artigo com esta URL amigável.' })
    }
    const newPost = db.insert('blog_posts', {
      ...post,
      id: `blog_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    })
    res.status(201).json(newPost)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.put('/api/blog/posts/:id', requireAuth(['admin']), async (req, res) => {
  try {
    if (await siteBlog.isLinked()) return res.json(await siteBlog.savePost(req.params.id, req.body))
  } catch (error) {
    return sendBlogError(res, error, 'Não foi possível salvar o artigo no site.')
  }
  try {
    const existing = db.find('blog_posts', (item) => item.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'Artigo não encontrado.' })

    const post = normalizeBlogPost(req.body, existing)
    const slugInUse = db.find('blog_posts', (item) => item.slug === post.slug && item.id !== existing.id)
    if (slugInUse) return res.status(409).json({ error: 'Já existe um artigo com esta URL amigável.' })

    res.json(db.update('blog_posts', existing.id, post))
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.delete('/api/blog/posts/:id', requireAuth(['admin']), async (req, res) => {
  try {
    if (await siteBlog.isLinked()) {
      await siteBlog.archivePost(req.params.id)
      return res.status(204).end()
    }
  } catch (error) {
    return sendBlogError(res, error, 'Não foi possível arquivar o artigo no site.')
  }
  const existing = db.find('blog_posts', (item) => item.id === req.params.id)
  if (!existing) return res.status(404).json({ error: 'Artigo não encontrado.' })
  db.delete('blog_posts', existing.id)
  res.status(204).end()
})

// Capa no blog do site: recodificada em WebP e guardada no banco do site.
app.post('/api/blog/cover', requireAuth(['admin']), blogCoverUpload.single('image'), async (req, res) => {
  try {
    if (!(await siteBlog.isLinked())) return res.status(409).json({ error: 'O CRM não está ligado ao blog do site.' })
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WebP de até 10 MB.' })
    res.status(201).json(await siteBlog.uploadCover(req.file.buffer))
  } catch (error) {
    sendBlogError(res, error, 'Não foi possível enviar a capa.')
  }
})

app.get('/api/blog/media/:id', requireAuth(), async (req, res) => {
  try {
    const data = (await siteBlog.isLinked()) ? await siteBlog.readMedia(req.params.id) : null
    if (!data) return res.status(404).end()
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.end(data)
  } catch (error) {
    sendBlogError(res, error, 'Não foi possível carregar a capa.')
  }
})

app.post('/api/blog/media', requireAuth(['admin']), imageUpload.array('images', 8), (req, res) => {
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'Envie ao menos uma imagem JPG, PNG ou WebP de até 5 MB.' })
  res.status(201).json({
    images: files.map((file) => ({
      url: `/uploads/blog/${file.filename}`,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    })),
  })
})

/* ==========================================================================
   DASHBOARD & ANALYTICS
   ========================================================================== */
app.get('/api/analytics/overview', requireAuth(), (req, res) => {
  const leads = db.get('leads').filter(isInFunnel)
  const equipments = db.get('equipments')
  const invoices = db.get('invoices')

  const totalRevenue = invoices
    .filter((i) => i.status === 'paga')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const pendingRevenue = invoices
    .filter((i) => i.status === 'pendente')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const rentedEquipments = equipments.filter((e) => e.status === 'alugado').length
  const totalEquipments = equipments.length
  const occupancyRate = totalEquipments > 0 ? Math.round((rentedEquipments / totalEquipments) * 100) : 0

  // Leads por origem
  const sourcesMap = {}
  leads.forEach((l) => {
    const src = l.origin || 'Outros'
    sourcesMap[src] = (sourcesMap[src] || 0) + 1
  })

  // Funil por estágio
  const funnelMap = {
    novo_lead: 0,
    qualificacao_ia: 0,
    proposta_enviada: 0,
    contrato_gerado: 0,
    assinado_entrega: 0,
    locacao_ativa: 0,
    finalizado: 0,
  }
  leads.forEach((l) => {
    if (funnelMap[l.stage] !== undefined) funnelMap[l.stage]++
  })

  res.json({
    totalRevenue,
    pendingRevenue,
    totalLeads: leads.length,
    rentedEquipments,
    totalEquipments,
    occupancyRate,
    sources: Object.entries(sourcesMap).map(([name, count]) => ({ name, count })),
    funnel: Object.entries(funnelMap).map(([stage, count]) => ({ stage, count })),
    fallbackModels: FALLBACK_MODELS,
  })
})

app.get('/api/activities', requireAuth(), (req, res) => {
  const contracts = db.get('contracts')
  const invoices = db.get('invoices')
  const leads = db.get('leads').filter(isInFunnel)
  const equipments = db.get('equipments')

  const activities = []

  // Signed contracts
  contracts.filter(c => c.status === 'assinado').forEach(c => {
    activities.push({
      id: `act_sign_${c.id}`,
      type: 'contract_signed',
      title: 'Contrato Assinado Digitalmente',
      description: `${c.number || c.contractNumber || 'Contrato sem número'} • ${c.clientName} (${c.equipmentNames || c.equipmentName || 'Equipamento'})`,
      timestamp: c.signedAt || c.createdAt,
      status: 'emerald',
    })
  })

  // Pending contracts
  contracts.filter(c => c.status === 'pendente_assinatura').forEach(c => {
    activities.push({
      id: `act_pend_${c.id}`,
      type: 'contract_created',
      title: 'Contrato Aguardando Assinatura',
      description: `${c.number || c.contractNumber || 'Contrato sem número'} enviado para ${c.clientName}`,
      timestamp: c.createdAt,
      status: 'amber',
    })
  })

  // Paid invoices
  invoices.filter(i => i.status === 'paga').forEach(i => {
    activities.push({
      id: `act_inv_${i.id}`,
      type: 'invoice_paid',
      title: 'Mensalidade Recebida (PIX/Cartão)',
      description: `R$ ${i.amount.toFixed(2)} quitado por ${i.clientName}`,
      timestamp: i.paidAt || i.dueDate,
      status: 'emerald',
    })
  })

  // AI qualified leads
  leads.filter(l => l.aiEnabled).forEach(l => {
    activities.push({
      id: `act_lead_${l.id}`,
      type: 'lead_ai',
      title: 'Lead Qualificado com Gemini Multimodal',
      description: `${l.name} (${l.origin}) • ${l.equipmentInterest}`,
      timestamp: l.lastInteraction || l.createdAt,
      status: 'purple',
    })
  })

  // Sanitized equipment
  equipments.filter(e => e.status === 'disponivel').slice(0, 2).forEach(e => {
    activities.push({
      id: `act_sanit_${e.id}`,
      type: 'equipment_ready',
      title: 'Equipamento Higienizado ANVISA',
      description: `${e.name} (${e.serialNumber}) liberado no galpão`,
      timestamp: e.lastSanitized,
      status: 'blue',
    })
  })

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  res.json(activities.slice(0, 10))
})

registerYriaRoutes(app, { database: db, requireAuth, evaluate: evaluateYria })
registerGoogleModelRoutes(app, { database: db, requireAuth })
registerInsightsRoutes(app, { database: db, requireAuth, publicUrl: resolvePublicUrl })
registerCustomerRoutes(app, { database: db, requireAuth, renderContract: renderContractHtml, evaluate: evaluateYria, origin: resolvePublicUrl, emit: (event, value) => io.emit(event, value), push: deliverPushToUser })
registerWebsiteChat(app, { database: db, evaluate: evaluateYria, getConfiguration: getYriaConfiguration })

app.post('/api/gemini/test-pipeline', requireAuth(), async (_req, res) => {
  try {
    const result = await evaluateYria({
      message: { id: 'diagnostic', content: 'Olá, preciso alugar uma cama hospitalar.', from: 'client' },
      messages: [], previous: {},
    })
    res.json({
      ok: result.provider.ok, activeModel: result.provider.model || 'roteiro-seguro',
      latencyMs: result.provider.latencyMs, response: result.reply, qualification: result.state,
      ...(result.provider.ok ? {} : { error: 'O provedor não respondeu. O roteiro seguro está ativo; confira chave, cota e conexão.' }),
      fallbackModels: [], sandbox: true,
    })
  } catch { res.status(503).json({ ok: false, error: 'Não foi possível testar o atendimento da YRIA.' }) }
})

/* ==========================================================================
   SETTINGS
   ========================================================================== */
const maskSettingsSecrets = (settings) => ({
  ...settings,
  freightProvider: { ...settings.freightProvider, token: settings.freightProvider?.token ? '__configured__' : '' },
  geminiApiKey: settings.geminiApiKey ? '__configured__' : '',
  metaConfig: {
    ...settings.metaConfig,
    accessToken: settings.metaConfig?.accessToken ? '__configured__' : '',
    verifyToken: settings.metaConfig?.verifyToken ? '__configured__' : '',
    appSecret: settings.metaConfig?.appSecret ? '__configured__' : '',
  },
})

app.get('/api/settings', requireAuth(['admin']), (req, res) => {
  res.json(maskSettingsSecrets(db.getSettings()))
})

app.put('/api/settings', requireAuth(['admin']), (req, res) => {
  const current = db.getSettings()
  let conversationSla
  try { conversationSla = normalizeConversationSla(req.body.conversationSla ?? current.conversationSla) }
  catch (error) { return res.status(400).json({ error: error.message }) }
  const requestedMeta = req.body.metaConfig || {}
  const users = db.get('users')
  const requestedAssignee = String(req.body.defaultLeadAssigneeId || '').slice(0, 100)
  const defaultLeadAssigneeId = users.some((user) => user.id === requestedAssignee)
    ? requestedAssignee
    : (current.defaultLeadAssigneeId || users.find((user) => user.role === 'admin')?.id || '')
  const keepOrReplace = (requested, existing) => (
    requested && requested !== '__configured__' ? requested : existing || ''
  )

  const updated = db.updateSettings({
    ...req.body,
    conversationSla,
    yria: current.yria,
    freightProvider: current.freightProvider,
    freightProviderRevision: current.freightProviderRevision,
    freightRates: current.freightRates,
    freightRevision: current.freightRevision,
    aiServicePrompt: typeof req.body.aiServicePrompt === 'string'
      ? req.body.aiServicePrompt.trim().slice(0, 5000)
      : (current.aiServicePrompt || ''),
    defaultLeadAssigneeId,
    geminiApiKey: keepOrReplace(req.body.geminiApiKey, current.geminiApiKey),
    metaConfig: {
      ...current.metaConfig,
      ...requestedMeta,
      accessToken: keepOrReplace(requestedMeta.accessToken, current.metaConfig?.accessToken),
      verifyToken: keepOrReplace(requestedMeta.verifyToken, current.metaConfig?.verifyToken),
      appSecret: keepOrReplace(requestedMeta.appSecret, current.metaConfig?.appSecret),
      // IDs da Meta entram em URL da Graph API: so digitos.
      phoneNumberId: String(requestedMeta.phoneNumberId ?? current.metaConfig?.phoneNumberId ?? '').replace(/\D/g, ''),
      wabaId: String(requestedMeta.wabaId ?? current.metaConfig?.wabaId ?? '').replace(/\D/g, ''),
    },
  })
  res.json(maskSettingsSecrets(updated))
})

app.get('/api/runtime/public-url', requireAuth(), (_req, res) => {
  res.json({ url: resolvePublicUrl() })
})

const clientDist = path.join(__dirname, '../../client/dist')

if (fs.existsSync(clientDist)) {
  console.log(`[Server] Servindo frontend estático de: ${clientDist}`)
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
await db.ready
try {
  const automationRepair = await repairExternalAutomationReplies(db)
  if (automationRepair.reclassified || automationRepair.resumed) console.log('[WhatsApp] Correção de automação externa:', JSON.stringify(automationRepair))
} catch {
  // A concurrent seller intervention must not take the entire CRM offline.
  console.warn('[WhatsApp] Correção de automação externa aguarda uma nova conferência segura; nenhum envio foi feito.')
}
contractEmail.start()
void automaticContracts.expire().catch(()=>console.warn('[YRIA] Confira as reservas automáticas pendentes.'))
setInterval(()=>void automaticContracts.expire().catch(()=>console.warn('[YRIA] Falha ao conferir vencimento de reservas.')),60000).unref()
backfillLastInbound()

// Initialize WhatsApp engine with WebSockets after the database is ready.
whatsappService.init(io)

server.listen(PORT, () => {
  console.log(`\n======================================================`)
  console.log(`🚀 SERVIDOR CRM GRUPO YR HOSPITALAR INICIADO NA PORTA ${PORT}`)
  console.log(`🔗 API Base: http://localhost:${PORT}`)
  console.log(`🤖 Fallback IA Ativo: 3.8 -> 3.7 -> 3.6 -> 3.5 -> 3.5-Lite -> 3.1-Lite`)
  console.log(`📱 Provedores WhatsApp: Baileys + Meta Cloud API`)
  console.log(`======================================================\n`)
})
