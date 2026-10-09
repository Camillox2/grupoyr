// Same-origin bridge: the CRM owns the YRIA prompt, persona, catalog and key.
// Neither browser history nor client-supplied qualification/config is trusted.
const CRM_CHAT = 'https://crm-grupoyr.dcfoundrydigital.com/api/website-chat'
const ORIGINS = new Set(['https://grupoyrhospitalar.com.br', 'https://www.grupoyrhospitalar.com.br', 'https://site.grupoyrhospitalar.com.br'])

export function createChatHandler(fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Método não permitido.' })
    }
    if (req.headers?.origin && !ORIGINS.has(req.headers.origin)) return res.status(403).json({ error: 'Origem não permitida.' })
    const body = req.body || {}
    // Support an old cached website bundle during the deployment transition.
    const message = body.message ?? (Array.isArray(body.messages) ? body.messages.filter(item => item?.role === 'user' && typeof item.text === 'string').at(-1)?.text : undefined)
    if (typeof message !== 'string' || !message.trim() || message.length > 1800) return res.status(400).json({ error: 'Mensagem inválida.' })
    try {
      const response = await fetcher(CRM_CHAT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://grupoyrhospitalar.com.br' },
        body: JSON.stringify({ message, sessionId: body.sessionId, requestId: body.requestId }),
        signal: AbortSignal.timeout(35000), redirect: 'error',
      })
      const data = await response.json().catch(() => null)
      if (response.ok && typeof data?.reply === 'string' && typeof data?.sessionId === 'string') {
        const contactUrl = typeof data.contactUrl === 'string' && data.contactUrl.startsWith('https://wa.me/5541997714985?text=') ? data.contactUrl : ''
        return res.json({ reply: data.reply, sessionId: data.sessionId, handoff: data.handoff === true, mode: data.mode === 'ai' ? 'ai' : 'guided', contactUrl })
      }
      if ([400, 409, 410, 429].includes(response.status)) {
        if (response.status === 429) res.setHeader('Retry-After', '60')
        return res.status(response.status).json({ error: typeof data?.error === 'string' ? data.error : 'Tente novamente em instantes.', ...(data?.code === 'session_expired' ? { code: data.code } : {}) })
      }
    } catch { /* Provider/internal details never reach the public website. */ }
    return res.status(503).json({ error: 'O atendimento está temporariamente indisponível. Tente novamente ou fale com a equipe pelo WhatsApp.' })
  }
}

export default createChatHandler()
