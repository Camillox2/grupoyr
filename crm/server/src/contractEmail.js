import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import nodemailer from 'nodemailer'

const DEFAULTS = { enabled: false, user: '', fromName: 'Grupo YR Hospitalar', companyEmail: 'rodrigo@grupoyrhospitalar.com.br', autoSendOnCreate: false, signedCopies: false }
const clean = (value, limit = 160) => String(value || '').replace(/[\r\n\x00]/g, '').trim().slice(0, limit)
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value) && !value.includes('..')
const escape = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

// Credentials never enter Neon, API responses, logs or browser storage. Both
// files stay inside ignored server/data; backing up the encrypted file requires
// its machine-local key. Encryption does not replace Windows account security.
export function createEmailStore(directory) {
  const configPath = path.join(directory, 'smtp-config.enc.json')
  const keyPath = path.join(directory, 'smtp-machine.key')
  const jobsPath = path.join(directory, 'contract-email-jobs.json')
  function write(file, value) {
    fs.mkdirSync(directory, { recursive: true })
    const temp = `${file}.${crypto.randomUUID()}.tmp`
    try {
      const fd = fs.openSync(temp, 'wx', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(temp, file)
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  function key(create = false) {
    if (!fs.existsSync(keyPath)) {
      if (!create) throw fail('A chave local do e-mail está indisponível. Reconfigure a conta.', 503)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 })
    }
    const data = fs.readFileSync(keyPath)
    if (data.length !== 32) throw fail('A chave local do e-mail está inválida.', 503)
    return data
  }
  return {
    readConfig() {
      if (!fs.existsSync(configPath)) return { ...DEFAULTS, password: '' }
      try {
        const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(stored.iv, 'base64'))
        decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
        return { ...DEFAULTS, ...JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.data, 'base64')), decipher.final()]).toString()) }
      } catch { throw fail('Não foi possível ler a configuração de e-mail. Confira o backup ou reconfigure a conta.', 503) }
    },
    writeConfig(config) {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key(true), iv)
      const data = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()])
      write(configPath, { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
    },
    readJobs: () => fs.existsSync(jobsPath) ? JSON.parse(fs.readFileSync(jobsPath, 'utf8')) : [],
    writeJobs: jobs => write(jobsPath, jobs),
  }
}

export function createContractEmail({ store, db, createPdf, ensureToken, publicUrl, makeTransport = options => nodemailer.createTransport(options) }) {
  let processing = false
  let timer
  let jobs = []
  let storageUnavailable = false
  try {
    jobs = store.readJobs()
    if (!Array.isArray(jobs) || jobs.some(job => !job || typeof job !== 'object' || !['queued', 'sending', 'accepted', 'failed', 'unknown'].includes(job.status))) throw new Error('Invalid job ledger')
  } catch { storageUnavailable = true; jobs = [] }
  const requireStorage = () => { if (storageUnavailable) throw fail('O histórico de e-mail está indisponível. Restaure o backup antes de enviar; o restante do CRM continua funcionando.', 503) }
  // SMTP may have accepted a message before the process stopped. Never replay
  // that uncertain delivery automatically (duplicate signed documents).
  if (jobs.some(job => job.status === 'sending')) {
    jobs.forEach(job => { if (job.status === 'sending') Object.assign(job, { status: 'unknown', error: 'O processo foi interrompido durante o envio. Verifique a caixa de e-mail antes de reenviar.', updatedAt: new Date().toISOString() }) })
    try { store.writeJobs(jobs) } catch { storageUnavailable = true }
  }
  const maskedConfig = () => {
    requireStorage()
    const { password, ...config } = store.readConfig()
    return { ...config, passwordConfigured: Boolean(password), configured: Boolean(validEmail(config.user) && password), host: 'mail.spacemail.com', port: 465 }
  }
  const transport = config => makeTransport({
    host: 'mail.spacemail.com', port: 465, secure: true,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    disableFileAccess: true, disableUrlAccess: true,
  })
  function update(job, updates) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() })
    store.writeJobs(jobs)
  }
  function enqueue(contract, { to, purpose = 'signature', idempotencyKey, requestedBy = null }) {
    requireStorage()
    if (!validEmail(to)) throw fail('Informe um e-mail válido para o destinatário.')
    if (!['pendente_assinatura', 'assinado', 'encerrado'].includes(contract.status)) throw fail('Este contrato não está disponível para envio.', 409)
    if (purpose === 'signed' && !contract.signedAt) throw fail('O contrato ainda não foi assinado.', 409)
    const config = store.readConfig()
    if (!config.enabled || !validEmail(config.user) || !config.password) throw fail('Configure e habilite o e-mail em Configurações antes de enviar.', 409)
    const current = jobs.find(job => job.idempotencyKey === idempotencyKey)
    if (current) {
      if (current.contractId !== contract.id || current.to !== to || current.purpose !== purpose) throw fail('A solicitação já foi usada para outro envio.', 409)
      return current
    }
    if (jobs.some(job => job.contractId === contract.id && job.to === to && ['queued', 'sending'].includes(job.status))) throw fail('Já existe um envio em andamento para este destinatário.', 409)
    const base = publicUrl()
    if (!base || !/^https:\/\//i.test(base)) throw fail('O CRM precisa de uma URL pública HTTPS para enviar o contrato.', 409)
    const withToken = ensureToken(contract)
    if (!withToken.signingToken) throw fail('O contrato está sem link de assinatura.', 409)
    const job = {
      id: crypto.randomUUID(), idempotencyKey, contractId: contract.id,
      to, purpose, status: 'queued', requestedBy, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), signingUrl: `${base.replace(/\/$/, '')}/assinar/${encodeURIComponent(withToken.signingToken)}`,
    }
    jobs.push(job)
    store.writeJobs(jobs)
    return job
  }
  const summary = job => {
    const { signingUrl, idempotencyKey, requestedBy, ...safe } = job
    return safe
  }
  async function processQueue() {
    if (processing || storageUnavailable) return
    processing = true
    try {
      for (const job of jobs.filter(item => item.status === 'queued')) {
        let smtp
        let submitted = false
        try {
          const config = store.readConfig()
          if (!config.enabled || !config.password) continue
          const contract = db.find('contracts', row => row.id === job.contractId)
          if (!contract || ['cancelado', 'rascunho'].includes(contract.status)) throw fail('Contrato cancelado ou indisponível para envio.')
          if (job.purpose === 'signed' && !contract.signedAt) throw fail('A assinatura ainda não está registrada.')
          // A queued signing invitation becomes a final copy if it was signed
          // while waiting; no stale PDF or misleading invitation is sent.
          const signed = Boolean(contract.signedAt)
          const pdf = await createPdf(contract)
          if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw fail('Não foi possível gerar o PDF do contrato.')
          const title = signed ? 'Contrato assinado' : 'Contrato para assinatura'
          const line = signed ? 'Sua assinatura foi registrada no CRM. Segue uma cópia do contrato assinado.' : 'Confira o contrato e assine pelo link abaixo, usando o dedo no celular ou o mouse. Não precisa responder este e-mail com um anexo.'
          const text = `Olá, ${clean(contract.clientName)}!\n\n${line}\n\n${job.signingUrl}\n\nContrato: ${clean(contract.number)}\n${signed ? `Assinado em: ${contract.signedAt}\n` : ''}\nGrupo YR Hospitalar\nEste link é pessoal. Não compartilhe com terceiros.`
          smtp = transport(config)
          update(job, { status: 'sending', error: null })
          submitted = true
          const result = await smtp.sendMail({
            from: { name: config.fromName, address: config.user }, to: { address: job.to }, replyTo: { address: config.companyEmail || config.user },
            subject: `${title} ${clean(contract.number, 70)} — Grupo YR Hospitalar`,
            text, html: `<div style="font-family:Arial,sans-serif;color:#123154;line-height:1.6;max-width:640px"><h2>${escape(title)}</h2><p>Olá, ${escape(contract.clientName)}!</p><p>${escape(line)}</p><p><a href="${escape(job.signingUrl)}" style="display:inline-block;padding:12px 20px;background:#215ca5;color:white;border-radius:8px">${signed ? 'Ver contrato assinado' : 'Conferir e assinar contrato'}</a></p><p>Contrato: ${escape(contract.number)}</p><p>Uma cópia em PDF está anexada.</p><p>Grupo YR Hospitalar<br>Este link é pessoal. Não compartilhe com terceiros.</p></div>`,
            attachments: [{ filename: `${clean(contract.number, 70).replace(/[^a-zA-Z0-9_-]/g, '-') || 'contrato'}${signed ? '-assinado' : ''}.pdf`, content: pdf, contentType: 'application/pdf' }],
          })
          if (!result.accepted?.some(address => String(address).toLowerCase() === job.to.toLowerCase())) throw Object.assign(fail('O servidor de e-mail recusou o destinatário.'), { code: 'EENVELOPE' })
          update(job, { status: 'accepted', messageId: clean(result.messageId), acceptedAt: new Date().toISOString(), documentSigned: signed })
          if (job.purpose === 'signature') db.update('contracts', contract.id, { emailRecipient: job.to })
        } catch (error) {
          const definitelyFailed = !submitted || ['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(error.code) || (Number(error.responseCode) >= 400)
          update(job, {
            status: definitelyFailed ? 'failed' : 'unknown',
            error: !submitted ? 'Não foi possível preparar o PDF ou o contrato para envio.' : error.code === 'EAUTH' ? 'A conta de e-mail recusou a autenticação. Confira a senha SMTP.' : definitelyFailed ? 'O servidor recusou o envio. Confira o destinatário e a configuração SMTP.' : 'Não foi possível confirmar o envio. Confira a caixa de e-mail antes de reenviar.',
          })
        } finally { smtp?.close?.() }
      }
    } finally { processing = false }
  }
  function kick() { void processQueue().catch(() => console.warn('[Contratos/e-mail] Falha no processamento. Consulte o histórico.')) }
  function automatically(contract, type) {
    try {
      const config = store.readConfig()
      if (!config.enabled || !(type === 'signed' ? config.signedCopies : config.autoSendOnCreate)) return
      const lead = db.find('leads', row => row.id === contract.leadId)
      const clientEmail = contract.emailRecipient || contract.clientEmail || lead?.email
      const recipients = type === 'signed' ? [...new Set([clientEmail, config.companyEmail].filter(validEmail))] : [clientEmail].filter(validEmail)
      for (const to of recipients) enqueue(contract, { to, purpose: type, idempotencyKey: `${contract.id}:${type}:${type === 'signed' ? contract.signedAt : contract.createdAt}:${to}` })
      kick()
    } catch { console.warn('[Contratos/e-mail] Não foi possível preparar o envio automático. A assinatura permanece registrada.') }
  }
  return {
    settings: maskedConfig,
    saveSettings(input) {
      requireStorage()
      const previous = store.readConfig()
      const next = {
        ...previous, user: clean(input.user, 254), companyEmail: clean(input.companyEmail, 254), fromName: clean(input.fromName) || DEFAULTS.fromName,
        password: typeof input.password === 'string' && input.password ? input.password : previous.password,
        enabled: input.enabled === true, autoSendOnCreate: input.autoSendOnCreate === true, signedCopies: input.signedCopies === true,
      }
      if (next.user && !validEmail(next.user)) throw fail('Informe o e-mail completo da conta Spacemail.')
      if (next.companyEmail && !validEmail(next.companyEmail)) throw fail('Informe um e-mail válido para receber as cópias da empresa.')
      if (next.password.length > 512) throw fail('A senha excede o limite permitido.')
      if (next.enabled && (!validEmail(next.user) || !next.password)) throw fail('Informe a conta e a senha SMTP antes de habilitar.')
      if (next.signedCopies && !next.companyEmail) throw fail('Informe o e-mail da empresa para receber o contrato assinado.')
      delete next.verifiedAt
      store.writeConfig(next)
      return maskedConfig()
    },
    async verify() {
      requireStorage()
      const config = store.readConfig()
      if (!validEmail(config.user) || !config.password) throw fail('Salve a conta e a senha SMTP primeiro.', 409)
      const smtp = transport(config)
      try { await smtp.verify(); store.writeConfig({ ...config, verifiedAt: new Date().toISOString() }); return { ok: true, message: 'Conexão e autenticação verificadas. Nenhum e-mail foi enviado.' } }
      catch { throw fail('Não foi possível autenticar no Spacemail. Confira a senha SMTP e se o acesso por aplicativos está habilitado.', 502) }
      finally { smtp.close?.() }
    },
    history: contractId => { requireStorage(); return jobs.filter(job => job.contractId === contractId).slice(-50).reverse().map(summary) },
    send(contract, input, user) {
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey || '')) throw fail('Identificador do envio inválido. Abra a janela novamente.')
      const job = enqueue(contract, { to: String(input.to || '').trim(), purpose: contract.signedAt ? 'signed' : 'signature', idempotencyKey: input.idempotencyKey, requestedBy: user?.id })
      kick()
      return summary(job)
    },
    onCreated: contract => automatically(contract, 'signature'),
    onSigned: contract => automatically(contract, 'signed'),
    processQueue,
    start() { timer = setInterval(kick, 5000); timer.unref(); kick() },
    stop() { clearInterval(timer) },
  }
}

export function registerContractEmailRoutes(app, { service, db, requireAuth }) {
  const handler = action => async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try { await action(req, res) } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível acessar o serviço de e-mail.' }) }
  }
  app.get('/api/email/settings', requireAuth(['admin']), handler((_req, res) => res.json(service.settings())))
  app.put('/api/email/settings', requireAuth(['admin']), handler((req, res) => res.json(service.saveSettings(req.body))))
  app.post('/api/email/verify', requireAuth(['admin']), handler(async (_req, res) => res.json(await service.verify())))
  app.get('/api/contracts/:id/email-history', requireAuth(), handler((req, res) => {
    if (!db.find('contracts', row => row.id === req.params.id)) throw fail('Contrato não encontrado.', 404)
    res.json({ history: service.history(req.params.id) })
  }))
  app.post('/api/contracts/:id/send-email', requireAuth(), handler((req, res) => {
    const contract = db.find('contracts', row => row.id === req.params.id)
    if (!contract) throw fail('Contrato não encontrado.', 404)
    res.status(202).json({ job: service.send(contract, req.body, req.user) })
  }))
}
