const EVENT_TYPES = new Set([
  'compromisso',
  'entrega',
  'retirada',
  'visita',
  'ligacao',
  'cobranca',
  'manutencao',
])

const EVENT_STATUSES = new Set(['scheduled', 'done', 'cancelled'])
const EXPENSE_CATEGORIES = new Set(['entrega', 'retirada', 'manutencao', 'outro'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

const cleanText = (value, maxLength) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)

const normalizeDate = (value, label = 'data') => {
  const date = String(value ?? '').trim()
  if (!DATE_PATTERN.test(date)) throw new Error(`Informe uma ${label} válida.`)
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Informe uma ${label} válida.`)
  }
  return date
}

const normalizeOptionalId = (value, label) => {
  if (value === undefined || value === null || value === '') return null
  const id = cleanText(value, 140)
  if (!id) throw new Error(`${label} inválido.`)
  return id
}

export function normalizeCalendarEvent(input = {}) {
  const title = cleanText(input.title, 100)
  if (title.length < 2) throw new Error('Dê um nome ao compromisso.')

  const type = String(input.type || 'compromisso')
  if (!EVENT_TYPES.has(type)) throw new Error('Tipo de compromisso inválido.')

  const status = String(input.status || 'scheduled')
  if (!EVENT_STATUSES.has(status)) throw new Error('Status de compromisso inválido.')

  const startTime = String(input.startTime || '').trim()
  const endTime = String(input.endTime || '').trim()
  if (startTime && !TIME_PATTERN.test(startTime)) throw new Error('Horário inicial inválido.')
  if (endTime && !TIME_PATTERN.test(endTime)) throw new Error('Horário final inválido.')
  if (endTime && !startTime) throw new Error('Informe o horário inicial antes do horário final.')
  if (startTime && endTime && endTime <= startTime) throw new Error('O horário final deve ser posterior ao inicial.')

  return {
    title,
    type,
    date: normalizeDate(input.date),
    startTime,
    endTime,
    leadId: normalizeOptionalId(input.leadId, 'Cliente'),
    contractId: normalizeOptionalId(input.contractId, 'Contrato'),
    equipmentId: normalizeOptionalId(input.equipmentId, 'Equipamento'),
    notes: cleanText(input.notes, 600),
    status,
    assignedTo: normalizeOptionalId(input.assignedTo, 'Responsável'),
  }
}

export function normalizeContractExpense(input = {}) {
  const contractId = normalizeOptionalId(input.contractId, 'Contrato')
  if (!contractId) throw new Error('Selecione o contrato relacionado ao custo.')

  const category = String(input.category || 'outro')
  if (!EXPENSE_CATEGORIES.has(category)) throw new Error('Categoria de custo inválida.')

  const description = cleanText(input.description, 160)
  if (description.length < 3) throw new Error('Descreva o custo em pelo menos 3 caracteres.')

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    throw new Error('Informe um custo maior que zero e menor que R$ 100.000.000.')
  }

  return {
    contractId,
    category,
    description,
    amount: Math.round(amount * 100) / 100,
    date: normalizeDate(input.date),
  }
}
