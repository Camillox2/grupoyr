import { randomUUID } from 'node:crypto'

const EVENT_TYPES = new Set(['compromisso', 'entrega', 'retirada', 'visita', 'ligacao', 'cobranca', 'manutencao'])
const EVENT_STATUSES = new Set(['scheduled', 'done', 'cancelled'])
const EXPENSE_CATEGORIES = new Set(['entrega', 'retirada', 'manutencao', 'outro'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const isDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const cleanId = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const cleanText = (value, max) => String(value || '').trim().slice(0, max)

function normalizeEvent(body, existing, db, user) {
  const field = (name) => Object.prototype.hasOwnProperty.call(body, name) ? body[name] : existing?.[name]
  const title = cleanText(field('title'), 100)
  const type = field('type')
  const date = field('date')
  const endDate = cleanId(field('endDate'))
  const startTime = cleanId(field('startTime'))
  const endTime = cleanId(field('endTime'))
  const status = field('status') ?? 'scheduled'
  let leadId = cleanId(field('leadId'))
  let contractId = cleanId(field('contractId'))
  const equipmentId = cleanId(field('equipmentId'))
  const invoiceId = cleanId(field('invoiceId'))
  const assignedValue = Object.prototype.hasOwnProperty.call(body, 'assignedTo') ? body.assignedTo : (existing?.assignedTo ?? user?.id)
  const assignedTo = cleanId(assignedValue)

  if (!title) throw new Error('Informe o título do compromisso.')
  if (!EVENT_TYPES.has(type)) throw new Error('Tipo de compromisso inválido.')
  if (!isDate(date)) throw new Error('Informe uma data válida.')
  if (endDate && (!isDate(endDate) || endDate < date)) throw new Error('A data final deve ser válida e igual ou posterior à inicial.')
  if (endDate && type !== 'manutencao') throw new Error('Períodos com data final são reservados para manutenção.')
  if (startTime && !TIME_RE.test(startTime)) throw new Error('Horário inicial inválido.')
  if (endTime && !TIME_RE.test(endTime)) throw new Error('Horário final inválido.')
  if (startTime && endTime && !endDate && endTime < startTime) throw new Error('O horário final deve ser posterior ao inicial.')
  if (!EVENT_STATUSES.has(status)) throw new Error('Status de compromisso inválido.')

  let contract = contractId && db.find('contracts', (item) => item.id === contractId)
  if (contractId && !contract) throw new Error('O contrato selecionado não foi encontrado.')
  if (contract) {
    if (leadId && leadId !== contract.leadId) throw new Error('O cliente não corresponde ao contrato selecionado.')
    leadId = contract.leadId
    if (equipmentId && !(contract.equipmentIds || []).includes(equipmentId)) {
      throw new Error('O equipamento não pertence ao contrato selecionado.')
    }
  }
  if (leadId && !db.find('leads', (item) => item.id === leadId)) throw new Error('O cliente selecionado não foi encontrado.')
  if (equipmentId && !db.find('equipments', (item) => item.id === equipmentId)) throw new Error('O equipamento selecionado não foi encontrado.')
  if (invoiceId) {
    const invoice = db.find('invoices', (item) => item.id === invoiceId)
    if (!invoice) throw new Error('A fatura selecionada não foi encontrada.')
    const invoiceContract = db.find('contracts', (item) => item.number === invoice.contractNumber)
    if (contract && contract.number !== invoice.contractNumber) throw new Error('A fatura selecionada não corresponde ao contrato do evento.')
    if (!contract && invoiceContract) {
      contractId = invoiceContract.id
      contract = invoiceContract
    }
    const invoiceLeadId = invoice.leadId || invoiceContract?.leadId || null
    if (leadId && invoiceLeadId && leadId !== invoiceLeadId) throw new Error('A fatura selecionada não corresponde ao cliente do evento.')
    if (!leadId) leadId = invoiceLeadId
  }
  if (contract && equipmentId && !(contract.equipmentIds || []).includes(equipmentId)) throw new Error('O equipamento não pertence ao contrato selecionado.')
  if (leadId && !db.find('leads', (item) => item.id === leadId)) throw new Error('O cliente selecionado não foi encontrado.')
  if (assignedTo && !db.find('users', (item) => item.id === assignedTo)) throw new Error('O responsável selecionado não foi encontrado.')

  return {
    ...(existing || {}),
    id: existing?.id,
    title,
    type,
    date,
    endDate: endDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    leadId,
    contractId,
    equipmentId,
    invoiceId,
    assignedTo,
    notes: cleanText(body.notes ?? existing?.notes, 600),
    status,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeExpense(body, db) {
  const contractId = cleanId(body.contractId)
  const contract = contractId && db.find('contracts', (item) => item.id === contractId)
  const category = body.category
  const description = cleanText(body.description, 240)
  const amount = Number(body.amount)
  const date = body.date
  if (!contract) throw new Error('Selecione um contrato válido para associar o custo.')
  if (!EXPENSE_CATEGORIES.has(category)) throw new Error('Categoria de custo inválida.')
  if (!description) throw new Error('Informe uma descrição para o custo.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('O valor do custo deve ser maior que zero.')
  if (!isDate(date)) throw new Error('Informe uma data válida para o custo.')
  return {
    contractId: contract.id,
    contractNumber: contract.number,
    clientName: contract.clientName,
    leadId: contract.leadId,
    category,
    description,
    amount: Math.round(amount * 100) / 100,
    date,
  }
}

export function registerOperationsRoutes(app, { db, requireAuth, idFactory = () => randomUUID() }) {
  app.get('/api/team', requireAuth(), (_req, res) => {
    res.json(db.get('users').map(({ id, name, role }) => ({ id, name, role })))
  })

  app.get('/api/calendar/events', requireAuth(), (_req, res) => {
    const events = db.get('calendarEvents') || []
    res.json([...events].sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '').localeCompare(String(b.startTime || ''))))
  })

  app.post('/api/calendar/events', requireAuth(), (req, res) => {
    try {
      const normalized = normalizeEvent(req.body || {}, null, db, req.user)
      const event = { ...normalized, id: `evt_${idFactory()}`, createdAt: new Date().toISOString() }
      db.insert('calendarEvents', event)
      res.status(201).json(event)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.put('/api/calendar/events/:id', requireAuth(), (req, res) => {
    const existing = db.find('calendarEvents', (item) => item.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' })
    try {
      const normalized = normalizeEvent(req.body || {}, existing, db, req.user)
      const updated = db.update('calendarEvents', existing.id, normalized)
      res.json(updated)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.delete('/api/calendar/events/:id', requireAuth(), (req, res) => {
    const existing = db.find('calendarEvents', (item) => item.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' })
    db.delete('calendarEvents', existing.id)
    res.json({ ok: true })
  })

  app.get('/api/finance/contract-expenses', requireAuth(), (_req, res) => {
    res.json(db.get('contractExpenses') || [])
  })

  app.post('/api/finance/contract-expenses', requireAuth(), (req, res) => {
    try {
      const expense = { ...normalizeExpense(req.body || {}, db), id: `cost_${idFactory()}`, createdAt: new Date().toISOString() }
      db.insert('contractExpenses', expense)
      res.status(201).json(expense)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.put('/api/finance/contract-expenses/:id', requireAuth(), (req, res) => {
    const existing = db.find('contractExpenses', (item) => item.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'Custo não encontrado.' })
    try {
      const updated = db.update('contractExpenses', existing.id, normalizeExpense(req.body || {}, db))
      res.json(updated)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.delete('/api/finance/contract-expenses/:id', requireAuth(), (req, res) => {
    const existing = db.find('contractExpenses', (item) => item.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'Custo não encontrado.' })
    db.delete('contractExpenses', existing.id)
    res.json({ ok: true })
  })
}
