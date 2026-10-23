import { randomUUID } from 'node:crypto'
import { FIELD_LABELS, PERSONAS, clean, normalizeConfig } from './yriaCore.js'
import { getYriaConfiguration } from './yriaCore.js'
import { discoverModels, providerHealth } from './yriaProvider.js'
import { automationReadiness } from './automaticContracts.js'

// Sandbox deliberately has no transport, real lead, contract or notification dependency.
export function registerYriaRoutes(app, { database, requireAuth, evaluate }) {
  const sessions = new Map(), quotas = new Map()
  const auth = requireAuth(['admin'])
  const guard = async (req, res, next) => {
    try { await database.ready; res.setHeader('Cache-Control', 'no-store'); next() }
    catch { res.status(503).json({ error: 'Banco temporariamente indisponível.' }) }
  }
  const wrap = handler => async (req, res) => {
    try { await handler(req, res) } catch { res.status(500).json({ error: 'Não foi possível concluir esta operação da YRIA. Tente novamente.' }) }
  }
  const state = () => getYriaConfiguration(database.getSettings())
  const persist = async value => {
    database.updateSettings({ yria: value })
    if (database.flush) await database.flush()
    else if (database.writeQueue) await database.writeQueue
    if (database.pool) {
      const check = await database.pool.query("SELECT data->'yria' AS yria FROM crm_settings WHERE id = 1")
      if (check.rows[0]?.yria?.revision !== value.revision) throw new Error('configuration_not_persisted')
    }
  }
  const conflict = (req, res, current) => {
    if (req.body?.revision !== current.revision) { res.status(409).json({ error: 'A configuração foi atualizada em outra tela. Recarregue antes de salvar.' }); return true }
    return false
  }
  const view = current => ({ ...current, automation: automationReadiness(database.getSettings()), personas: PERSONAS, fieldLabels: FIELD_LABELS, provider: { ...providerHealth }, configured: Boolean(database.getSettings().geminiApiKey || process.env.GEMINI_API_KEY) })
  app.get('/api/yria', auth, guard, wrap(async (_req, res) => res.json(view(state()))))
  app.get('/api/yria/models', auth, guard, wrap(async (_req, res) => {
    try { res.json({ models: await discoverModels(database.getSettings().geminiApiKey || process.env.GEMINI_API_KEY || '') }) }
    catch { res.status(503).json({ error: 'Não foi possível consultar os modelos. Confira a chave, cota e conexão nas configurações.' }) }
  }))
  app.put('/api/yria/draft', auth, guard, wrap(async (req, res) => {
    const current = state()
    if (conflict(req, res, current)) return
    const updated = { ...current, revision: current.revision + 1, draft: normalizeConfig(req.body.config), updatedAt: new Date().toISOString() }
    await persist(updated)
    res.json(view(updated))
  }))
  app.post('/api/yria/publish', auth, guard, wrap(async (req, res) => {
    const current = state()
    if (conflict(req, res, current)) return
    const published = { id: randomUUID(), config: current.draft, createdAt: new Date().toISOString(), label: clean(req.body.label, 80) || 'Versão publicada', authorId: req.user.id }
    if(published.config.automaticContractsEnabled&&!automationReadiness(database.getSettings()).ready)return res.status(422).json({error:'Antes de ativar contratos automáticos, confira: '+automationReadiness(database.getSettings()).issues.join('; ')+'.'})
    const updated = { ...current, revision: current.revision + 1, published, versions: [current.published, ...current.versions].slice(0,10) }
    await persist(updated)
    // Keep the old settings text in sync without erasing other configuration.
    database.updateSettings({ aiServicePrompt: published.config.customPrompt })
    if (database.flush) await database.flush()
    else if (database.writeQueue) await database.writeQueue
    res.json(view(updated))
  }))
  app.post('/api/yria/restore', auth, guard, wrap(async (req, res) => {
    const current = state()
    if (conflict(req, res, current)) return
    const old = current.versions.find(v => v.id === req.body.versionId)
    if (!old) return res.status(404).json({ error: 'Versão não encontrada.' })
    // Restore to draft first: never silently change live WhatsApp.
    const updated = { ...current, revision: current.revision + 1, draft: normalizeConfig(old.config) }
    await persist(updated)
    res.json(view(updated))
  }))
  app.post('/api/yria/lab/sessions', auth, guard, wrap(async (req, res) => {
    const now = Date.now()
    for (const [id,s] of sessions) if (now - s.updatedAt > 7200000) sessions.delete(id)
    if (sessions.size > 300) return res.status(429).json({ error: 'Laboratório ocupado. Tente novamente mais tarde.' })
    const own = [...sessions.values()].filter(s => s.userId === req.user.id)
    if (own.length >= 12) sessions.delete(own[0].id)
    const current = state()
    const session = { id: randomUUID(), userId: req.user.id, config: normalizeConfig(req.body.config || current.draft), state: {}, messages: [], updatedAt: now, busy: false, requests: new Map(), inputTokens: 0, outputTokens: 0 }
    sessions.set(session.id, session)
    res.status(201).json({ id: session.id, config: session.config, state: {}, messages: [] })
  }))
  app.post('/api/yria/lab/sessions/:id/messages', auth, guard, wrap(async (req, res) => {
    const s = sessions.get(req.params.id)
    if (!s || s.userId !== req.user.id || Date.now() - s.updatedAt > 7200000) return res.status(404).json({ error: 'Teste expirado. Inicie uma nova conversa.' })
    const requestId = clean(req.body.requestId, 80), text = clean(req.body.text, 2000)
    if (!requestId || !text) return res.status(400).json({ error: 'Escreva uma mensagem de teste.' })
    if (s.requests.has(requestId)) return res.json(s.requests.get(requestId))
    if (s.busy) return res.status(409).json({ error: 'Aguarde a resposta atual antes de enviar outra mensagem.' })
    if (s.messages.length >= 60) return res.status(429).json({ error: 'Este teste chegou ao limite de 30 mensagens. Reinicie a conversa.' })
    const q = quotas.get(req.user.id) || { at: Date.now(), count: 0 }
    if (Date.now() - q.at > 60000) { q.at = Date.now(); q.count = 0 }
    if (++q.count > 20) return res.status(429).json({ error: 'Limite de 20 testes por minuto. Aguarde um pouco.' })
    quotas.set(req.user.id, q)
    s.busy = true
    try {
      const message = { id: requestId, from: 'client', content: text, timestamp: new Date().toISOString() }
      const result = await evaluate({ previous: s.state, messages: s.messages, message, config: s.config, sandbox: true })
      if(result.automation)result.reply='Simulação concluída: dados e valores autorizados. No atendimento real, a opção ativa gera o contrato e envia o link para assinatura após nova conferência de estoque e frete. Neste teste, nenhum contrato, reserva, cobrança ou WhatsApp foi criado.'
      s.messages.push(message)
      if (result.reply) s.messages.push({ id: randomUUID(), from: 'ai', content: result.reply, timestamp: new Date().toISOString() })
      s.state = result.state
      s.updatedAt = Date.now()
      s.inputTokens += result.provider.inputTokens || 0
      s.outputTokens += result.provider.outputTokens || 0
      const payload = { ...result, id: s.id, messages: s.messages, usage: { inputTokens: s.inputTokens, outputTokens: s.outputTokens }, sandbox: true }
      s.requests.set(requestId, payload)
      res.json(payload)
    } finally { s.busy = false }
  }))
  app.get('/api/yria/scenarios', auth, guard, wrap(async (req, res) => res.json(database.filter('yriaScenarios', s => s.userId === req.user.id).slice(0,30))))
  app.post('/api/yria/scenarios', auth, guard, wrap(async (req, res) => {
    const prompts = Array.isArray(req.body.prompts) ? req.body.prompts.slice(0,30).map(t => clean(t,2000)).filter(Boolean) : []
    if (!prompts.length || !clean(req.body.name,80)) return res.status(400).json({ error: 'Informe um nome e pelo menos uma mensagem para o cenário.' })
    if (database.filter('yriaScenarios', s => s.userId === req.user.id).length >= 30) return res.status(409).json({ error: 'Limite de 30 cenários salvos por usuário.' })
    const record = database.insert('yriaScenarios', { id: randomUUID(), userId: req.user.id, name: clean(req.body.name,80), prompts, createdAt: new Date().toISOString() })
    if (database.flush) await database.flush()
    else if (database.writeQueue) await database.writeQueue
    res.status(201).json(record)
  }))
}
