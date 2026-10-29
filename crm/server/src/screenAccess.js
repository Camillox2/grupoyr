// Permissões por tela. Cada usuário pode ter uma lista `screens` com as telas
// liberadas. Sem a lista (usuários antigos) o acesso continua total. Admins
// sempre veem tudo. O servidor bloqueia as rotas da API de cada tela, para que
// esconder o item do menu não seja a única barreira.
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

export const SCREENS = [
  { id: 'dashboard', label: 'Visão geral' },
  { id: 'insights', label: 'Insights e Ads' },
  { id: 'kanban', label: 'Funil' },
  { id: 'whatsapp', label: 'WhatsApp e IA' },
  { id: 'equipments', label: 'Equipamentos' },
  { id: 'contracts', label: 'Contratos' },
  { id: 'clients', label: 'Clientes' },
  { id: 'inspections', label: 'Vistorias' },
  { id: 'client-operations', label: 'Operação e alertas' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'blog', label: 'Blog' },
  { id: 'yria', label: 'YRIA · laboratório' },
  { id: 'settings', label: 'Configurações' },
]
export const SCREEN_IDS = SCREENS.map((screen) => screen.id)
export const ROLES = ['admin', 'vendedor', 'tecnico']

// Telas que o próprio perfil já restringia antes desta configuração.
const ROLE_LIMITS = {
  vendedor: new Set(['insights']),
  tecnico: new Set(['insights', 'client-operations']),
}

export function normalizeScreens(value) {
  if (!Array.isArray(value)) return null
  const wanted = new Set(value.filter((item) => typeof item === 'string'))
  return SCREEN_IDS.filter((id) => wanted.has(id))
}

export function allowedScreens(user) {
  if (!user || user.role === 'admin') return [...SCREEN_IDS]
  const stored = normalizeScreens(user.screens)
  const base = stored === null ? SCREEN_IDS : stored
  const limits = ROLE_LIMITS[user.role] || new Set()
  return base.filter((id) => !limits.has(id))
}

// Rotas da API -> telas que as usam (basta ter uma delas). Rotas que não
// aparecem aqui são compartilhadas pelo CRM inteiro (login, leads para o menu,
// status do WhatsApp, notificações...) e seguem só a regra de login/perfil.
const RULES = [
  { re: /^\/api\/(insights|integrations\/google-ads\/script)(\/|$)/, screens: ['insights'] },
  { re: /^\/api\/(analytics|activities|gemini\/test-pipeline)(\/|$)/, screens: ['dashboard'] },
  { re: /^\/api\/finance\/invoices\/?$/, methods: ['POST'], screens: ['finance', 'whatsapp'] },
  { re: /^\/api\/finance(\/|$)/, screens: ['finance'] },
  { re: /^\/api\/ai\/contract-retention-insights(\/|$)/, screens: ['finance', 'contracts', 'dashboard'] },
  { re: /^\/api\/blog(\/|$)/, screens: ['blog'] },
  { re: /^\/api\/yria(\/|$)/, screens: ['yria'] },
  { re: /^\/api\/(settings|users)(\/|$)/, screens: ['settings'] },
  { re: /^\/api\/email(\/|$)/, screens: ['settings', 'contracts'] },
  { re: /^\/api\/client-operations(\/|$)/, screens: ['client-operations'] },
  { re: /^\/api\/inspections(\/|$)/, screens: ['inspections'] },
  { re: /^\/api\/clients(\/|$)/, screens: ['clients'] },
  { re: /^\/api\/commercial(\/|$)/, screens: ['equipments'] },
  { re: /^\/api\/equipments(\/|$)/, methods: ['POST', 'PUT', 'PATCH', 'DELETE'], screens: ['equipments', 'dashboard'] },
  { re: /^\/api\/contracts\/signing(\/|$)/, screens: null },
  { re: /^\/api\/contracts\/?$/, methods: ['POST'], screens: ['contracts', 'kanban', 'whatsapp', 'dashboard'] },
  { re: /^\/api\/contracts\/[^/]+\/(items|archive|unarchive)(\/|$)/, screens: ['contracts'] },
  { re: /^\/api\/contracts\/[^/]+(\/|$)/, screens: ['contracts', 'clients', 'whatsapp'] },
  { re: /^\/api\/conversations(\/|$)/, screens: ['whatsapp'] },
  { re: /^\/api\/whatsapp\/(send|send-media|send-template|contacts|templates)\/?$/, screens: ['whatsapp', 'clients', 'inspections'] },
  { re: /^\/api\/leads\/[^/]+\/(messages|conversation|toggle-ai|ai-summary|avatar)(\/|$)/, screens: ['whatsapp'] },
  { re: /^\/api\/leads\/[^/]+\/(stage|funnel-archive|funnel-restore|funnel-impact)(\/|$)/, screens: ['kanban', 'whatsapp'] },
  { re: /^\/api\/leads\/[^/]+\/details(\/|$)/, screens: ['kanban', 'whatsapp', 'clients'] },
  { re: /^\/api\/leads\/[^/]+\/(attachments|checklist\.pdf)(\/|$)/, screens: ['whatsapp', 'clients', 'contracts', 'kanban'] },
  { re: /^\/api\/leads\/?$/, methods: ['POST'], screens: ['dashboard', 'kanban', 'whatsapp'] },
]

export function screensForApi(method, pathname) {
  const verb = String(method || 'GET').toUpperCase()
  for (const rule of RULES) {
    if (rule.methods && !rule.methods.includes(verb)) continue
    if (rule.re.test(pathname)) return rule.screens
  }
  return null
}

export function findUser(db, id) {
  if (!id) return null
  return db.get('users').find((user) => user.id === id) || null
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    screens: allowedScreens(user),
  }
}

export function createScreenGuard({ db, verifyToken }) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next()
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) return next()
    const decoded = verifyToken(header.slice(7))
    if (!decoded) return next()
    const user = findUser(db, decoded.id)
    if (user && user.active === false && !req.path.startsWith('/api/auth/login')) {
      return res.status(401).json({ error: 'Usuário desativado. Fale com o administrador.' })
    }
    const role = user?.role || decoded.role
    if (role === 'admin') return next()
    const required = screensForApi(req.method, req.path)
    if (!required) return next()
    const allowed = allowedScreens(user || decoded)
    if (required.some((screen) => allowed.includes(screen))) return next()
    return res.status(403).json({ error: 'Seu usuário não tem acesso a esta tela.', code: 'SCREEN_FORBIDDEN' })
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function adminView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    customScreens: Array.isArray(user.screens),
    screens: allowedScreens(user),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  }
}

export function registerUserAdminRoutes(app, { db, requireAuth }) {
  const auth = requireAuth(['admin'])
  const activeAdmins = (exceptId) => db.get('users').filter((user) => user.role === 'admin' && user.active !== false && user.id !== exceptId)

  app.get('/api/admin/users', auth, async (_req, res) => {
    await db.ready
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ screens: SCREENS, roles: ROLES, users: db.get('users').map(adminView) })
  })

  app.post('/api/admin/users', auth, async (req, res) => {
    try {
      await db.ready
      const name = String(req.body?.name || '').trim().slice(0, 120)
      const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200)
      const password = String(req.body?.password || '')
      const role = String(req.body?.role || 'vendedor')
      if (!name) return res.status(400).json({ error: 'Informe o nome.' })
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' })
      if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' })
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Perfil inválido.' })
      if (db.get('users').some((user) => String(user.email || '').toLowerCase() === email)) {
        return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' })
      }
      const screens = normalizeScreens(req.body?.screens)
      const user = {
        id: `usr_${randomUUID()}`,
        name,
        email,
        role,
        active: true,
        passwordHash: await bcrypt.hash(password, 10),
        ...(screens ? { screens } : {}),
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
      }
      db.insert('users', user)
      res.status(201).json({ user: adminView(user) })
    } catch (error) {
      res.status(500).json({ error: 'Não foi possível criar o usuário.' })
    }
  })

  app.put('/api/admin/users/:id', auth, async (req, res) => {
    try {
      await db.ready
      const target = findUser(db, req.params.id)
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' })
      const body = req.body || {}
      const updates = {}
      const isSelf = target.id === req.user.id

      if (body.name !== undefined) {
        const name = String(body.name).trim().slice(0, 120)
        if (!name) return res.status(400).json({ error: 'Informe o nome.' })
        updates.name = name
      }
      if (body.email !== undefined) {
        const email = String(body.email).trim().toLowerCase().slice(0, 200)
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' })
        if (db.get('users').some((user) => user.id !== target.id && String(user.email || '').toLowerCase() === email)) {
          return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' })
        }
        updates.email = email
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'Perfil inválido.' })
        if (target.role === 'admin' && body.role !== 'admin') {
          if (isSelf) return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de administrador.' })
          if (activeAdmins(target.id).length === 0) return res.status(400).json({ error: 'O CRM precisa de pelo menos um administrador ativo.' })
        }
        updates.role = body.role
      }
      if (body.active !== undefined) {
        const active = body.active === true
        if (!active) {
          if (isSelf) return res.status(400).json({ error: 'Você não pode desativar o seu próprio usuário.' })
          if (target.role === 'admin' && activeAdmins(target.id).length === 0) return res.status(400).json({ error: 'O CRM precisa de pelo menos um administrador ativo.' })
        }
        updates.active = active
      }
      if (body.screens !== undefined) {
        const screens = normalizeScreens(body.screens)
        if (screens === null) return res.status(400).json({ error: 'Lista de telas inválida.' })
        if (isSelf && !screens.includes('settings')) return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso às Configurações.' })
        updates.screens = screens
      }
      if (body.password !== undefined && body.password !== '') {
        const password = String(body.password)
        if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' })
        updates.passwordHash = await bcrypt.hash(password, 10)
      }
      if (Object.keys(updates).length === 0) return res.json({ user: adminView(target) })
      const saved = db.update('users', target.id, { ...updates, updatedBy: req.user.id })
      res.json({ user: adminView(saved) })
    } catch (error) {
      res.status(500).json({ error: 'Não foi possível salvar o usuário.' })
    }
  })
}
