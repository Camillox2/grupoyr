import { randomBytes, randomUUID } from 'node:crypto'

const ORIGINS = new Set(['https://grupoyrhospitalar.com.br', 'https://www.grupoyrhospitalar.com.br', 'https://site.grupoyrhospitalar.com.br'])
const TTL = 2 * 60 * 60 * 1000
const CONTACT = 'https://wa.me/5541997714985'

// Anonymous conversations are isolated from CRM customer records and WhatsApp.
// A random session capability grants access only to this temporary conversation.
export function createWebsiteChat({ evaluate, getConfiguration, ready = Promise.resolve(), now = Date.now }) {
  const sessions = new Map(), limits = new Map()
  function limited(key, maximum, windowMs) {
    const at = now(), current = limits.get(key)
    if (!current || current.until <= at) { limits.set(key, { count: 1, until: at + windowMs }); return false }
    return ++current.count > maximum
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const origin = req.headers.origin
    if (origin && !ORIGINS.has(origin)) return res.status(403).json({ error: 'Origem não permitida.' })
    const body = req.body || {}
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1800 || JSON.stringify(body).length > 6000) {
      return res.status(400).json({ error: 'Escreva uma mensagem de até 1.800 caracteres.' })
    }
    const at = now()
    for (const [key, value] of sessions) if (!value.busy && value.expires <= at) sessions.delete(key)
    for (const [key, value] of limits) if (value.until <= at) limits.delete(key)
    // Do not trust arbitrary X-Forwarded-For supplied by public callers.
    const ip = String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || 'unknown').slice(0, 80)
    if (limited('global', 120, 60000) || limited('ip:' + ip, 80, 60000) || limits.size > 5000) {
      res.setHeader('Retry-After', '60')
      return res.status(429).json({ error: 'Muitas mensagens. Aguarde um minuto para continuar.' })
    }
    let session, sessionId = body.sessionId
    if (sessionId) {
      if (typeof sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(sessionId) || !(session = sessions.get(sessionId))) {
        return res.status(410).json({ code: 'session_expired', error: 'A conversa expirou. Inicie um novo atendimento.' })
      }
    } else {
      if (sessions.size >= 500) return res.status(503).json({ error: 'Atendimento ocupado. Tente novamente em instantes.' })
      sessionId = randomBytes(32).toString('hex')
      session = { state: { introduced: true, lastAskedField: 'name' }, messages: [], expires: at + TTL, turns: 0, lastRequest: '', lastResponse: null, busy: false }
      sessions.set(sessionId, session)
    }
    const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 80) : ''
    if (requestId && requestId === session.lastRequest && session.lastResponse) return res.json(session.lastResponse)
    if (session.busy) return res.status(409).json({ error: 'Aguarde a resposta da mensagem anterior.' })
    if (session.turns >= 40) return res.status(429).json({ error: 'Continue este atendimento com a equipe pelo WhatsApp.' })
    session.busy = true
    try {
      await ready
      const published = getConfiguration().published.config
      // Anonymous site users cannot issue contracts. Published persona, prompt,
      // sales rules and catalog are otherwise the same as the CRM.
      const config = { ...published, automaticContractsEnabled: false }
      const message = { id: randomUUID(), from: 'client', content: body.message.trim(), timestamp: new Date(at).toISOString() }
      const result = await evaluate({ previous: structuredClone(session.state), messages: [...session.messages, message], message, config, source: 'website' })
      if (!result || typeof result.reply !== 'string' || (!result.reply.trim() && !result.handoff)) throw new Error('invalid_reply')
      session.state = result.state
      session.turns += 1
      session.expires = now() + TTL
      const reply = result.handoff
        ? 'Organizei as informações desta conversa. Para continuar com a equipe do Grupo YR, toque em “Falar no WhatsApp” abaixo. O resumo será incluído na mensagem para você conferir antes de enviar.'
        : result.reply
      session.messages = [...session.messages, message, { id: randomUUID(), from: 'ai', content: reply, timestamp: new Date(now()).toISOString() }].slice(-40)
      const handoffText = 'Olá! Vim pelo atendimento YRIA do site do Grupo YR. Segue o resumo da minha solicitação:\n' + (result.summary || '')
      const response = { reply, sessionId, handoff: Boolean(result.handoff), mode: result.provider?.ok === true ? 'ai' : 'guided', contactUrl: CONTACT + '?text=' + encodeURIComponent(handoffText.slice(0, 3200)) }
      session.lastRequest = requestId
      session.lastResponse = response
      return res.json(response)
    } catch {
      // Never log customer messages, configuration or provider credentials here.
      return res.status(503).json({ error: 'Não foi possível responder agora. Tente novamente ou fale com a equipe no WhatsApp.' })
    } finally { session.busy = false }
  }
}

export function registerWebsiteChat(app, { evaluate, database, getConfiguration }) {
  const handler = createWebsiteChat({ evaluate, ready: database.ready, getConfiguration: () => getConfiguration(database.getSettings()) })
  app.post('/api/website-chat', handler)
}
