import { CalendarEvent, CalendarEventType, Contract, Equipment, Invoice, Lead } from '../types'

export type AgendaStatus = CalendarEvent['status'] | 'overdue' | 'paid' | 'tentative'
export type AgendaSource = 'manual' | 'contract' | 'invoice'

export interface AgendaItem {
  id: string
  title: string
  type: CalendarEventType
  date: string
  endDate: string | null
  startTime: string
  endTime: string
  leadId: string | null
  contractId: string | null
  equipmentId: string | null
  invoiceId: string | null
  assignedTo: string | null
  notes: string
  status: AgendaStatus
  source: AgendaSource
}

export interface EquipmentBooking {
  id: string
  contractId: string
  contractNumber: string
  equipmentId: string
  clientName: string
  leadId: string
  startDate: string
  endDate: string
  tentative: boolean
}

export interface EquipmentPeriod {
  id: string
  equipmentId: string
  startDate: string | null
  endDate: string | null
  kind: 'confirmed' | 'reservation' | 'maintenance' | 'hygiene'
  contractId: string | null
  contractNumber: string | null
  leadId: string | null
  clientName: string | null
  title: string
  conflict: boolean
}

export const parseLocalDate = (value: string) => {
  const parts = String(value || '').slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  return Number.isNaN(date.getTime()) ? null : date
}

export const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const addLocalDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export const startOfLocalWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export const formatLocalDate = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  const date = parseLocalDate(value)
  return date ? date.toLocaleDateString('pt-BR', options) : 'Data não informada'
}

export const isValidIsoDate = (value: string) => Boolean(parseLocalDate(value)) && toLocalDateKey(parseLocalDate(value)!) === value.slice(0, 10)

export function buildAgendaItems(
  customEvents: CalendarEvent[],
  contracts: Contract[],
  leads: Lead[],
  invoices: Invoice[],
): AgendaItem[] {
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))
  const contractByNumber = new Map(contracts.map((contract) => [contract.number, contract]))
  const items: AgendaItem[] = customEvents.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    date: event.date,
    endDate: event.endDate || null,
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    leadId: event.leadId,
    contractId: event.contractId,
    equipmentId: event.equipmentId,
    invoiceId: event.invoiceId || null,
    assignedTo: event.assignedTo || null,
    notes: event.notes || '',
    status: event.status,
    source: 'manual',
  }))

  const activeManual = customEvents.filter((event) => event.status !== 'cancelled')
  for (const contract of contracts) {
    if (contract.status !== 'assinado' && contract.status !== 'encerrado') continue
    const lead = leadById.get(contract.leadId)
    const deliveryDate = lead?.deliveryDate
    const alreadyHasDelivery = activeManual.some((event) => event.contractId === contract.id && event.type === 'entrega' && event.date === deliveryDate)
    if (deliveryDate && !alreadyHasDelivery && isValidIsoDate(deliveryDate)) {
      items.push({
        id: `contract-delivery-${contract.id}`,
        title: `Entrega · ${contract.clientName}`,
        type: 'entrega',
        date: deliveryDate,
        endDate: null,
        startTime: '',
        endTime: '',
        leadId: contract.leadId,
        contractId: contract.id,
        equipmentId: contract.equipmentIds?.[0] || null,
        invoiceId: null,
        assignedTo: lead?.assignedTo || null,
        notes: lead?.deliveryNotes || '',
        status: 'scheduled',
        source: 'contract',
      })
    }
    const alreadyHasReturn = activeManual.some((event) => event.contractId === contract.id && event.type === 'retirada' && event.date === contract.endDate)
    if (!alreadyHasReturn && isValidIsoDate(contract.endDate)) {
      items.push({
        id: `contract-return-${contract.id}`,
        title: `Retirada · ${contract.clientName}`,
        type: 'retirada',
        date: contract.endDate,
        endDate: null,
        startTime: '',
        endTime: '',
        leadId: contract.leadId,
        contractId: contract.id,
        equipmentId: contract.equipmentIds?.[0] || null,
        invoiceId: null,
        assignedTo: lead?.assignedTo || null,
        notes: `Término previsto do contrato ${contract.number}.`,
        status: 'scheduled',
        source: 'contract',
      })
    }
  }

  for (const invoice of invoices) {
    if (!['pendente', 'atrasada'].includes(invoice.status) || !isValidIsoDate(invoice.dueDate)) continue
    if (activeManual.some((event) => event.invoiceId === invoice.id)) continue
    const relatedContract = contractByNumber.get(invoice.contractNumber)
    const due = parseLocalDate(invoice.dueDate)
    const today = parseLocalDate(toLocalDateKey(new Date()))
    const isOverdue = invoice.status === 'atrasada' || Boolean(due && today && due < today)
    items.push({
      id: `invoice-${invoice.id}`,
      title: `Cobrança · ${invoice.clientName}`,
      type: 'cobranca',
      date: invoice.dueDate,
      endDate: null,
      startTime: '',
      endTime: '',
      leadId: invoice.leadId || relatedContract?.leadId || null,
      contractId: relatedContract?.id || null,
      equipmentId: null,
      invoiceId: invoice.id,
      assignedTo: leadById.get(invoice.leadId || relatedContract?.leadId || '')?.assignedTo || null,
      notes: `${invoice.contractNumber} · ${Number(invoice.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      status: isOverdue ? 'overdue' : 'scheduled',
      source: 'invoice',
    })
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title))
}

export function buildEquipmentBookings(contracts: Contract[], equipments: Equipment[]): EquipmentBooking[] {
  const knownIds = new Set(equipments.map((equipment) => equipment.id))
  return contracts
    .filter((contract) => contract.type === 'locacao' && (contract.status === 'assinado' || contract.status === 'pendente_assinatura'))
    .flatMap((contract) => (contract.equipmentIds || [])
      .filter((equipmentId) => knownIds.has(equipmentId))
      .map((equipmentId) => ({
        id: `${contract.id}:${equipmentId}`,
        contractId: contract.id,
        contractNumber: contract.number,
        equipmentId,
        clientName: contract.clientName,
        leadId: contract.leadId,
        startDate: contract.startDate,
        endDate: contract.endDate,
        tentative: contract.status === 'pendente_assinatura',
      })))
    .filter((booking) => isValidIsoDate(booking.startDate) && isValidIsoDate(booking.endDate) && booking.endDate >= booking.startDate)
}

export function buildEquipmentPeriods(
  contracts: Contract[],
  equipments: Equipment[],
  events: CalendarEvent[],
  leads: Lead[] = [],
): EquipmentPeriod[] {
  const periods: EquipmentPeriod[] = buildEquipmentBookings(contracts, equipments).map((booking) => ({
    id: booking.id,
    equipmentId: booking.equipmentId,
    startDate: booking.startDate,
    endDate: booking.endDate,
    kind: booking.tentative ? 'reservation' : 'confirmed',
    contractId: booking.contractId,
    contractNumber: booking.contractNumber,
    leadId: booking.leadId,
    clientName: booking.clientName,
    title: booking.tentative ? 'Reserva pendente' : 'Locação confirmada',
    conflict: false,
  }))

  for (const event of events) {
    if (event.type !== 'manutencao' || !event.equipmentId || event.status === 'cancelled' || event.status === 'done') continue
    if (!isValidIsoDate(event.date)) continue
    periods.push({
      id: event.id,
      equipmentId: event.equipmentId,
      startDate: event.date,
      endDate: isValidIsoDate(event.endDate || '') && event.endDate! >= event.date ? event.endDate! : event.date,
      kind: 'maintenance',
      contractId: event.contractId || null,
      contractNumber: contracts.find((contract) => contract.id === event.contractId)?.number || null,
      leadId: event.leadId || null,
      clientName: event.leadId
        ? (contracts.find((contract) => contract.id === event.contractId)?.clientName || leads.find((lead) => lead.id === event.leadId)?.name || null)
        : null,
      title: event.title || 'Manutenção',
      conflict: false,
    })
  }

  for (const equipment of equipments) {
    const today = toLocalDateKey(new Date())
    const hasMaintenanceToday = periods.some((period) => period.equipmentId === equipment.id && period.kind === 'maintenance' && period.startDate && period.endDate && period.startDate <= today && period.endDate >= today)
    if (!hasMaintenanceToday && equipment.status === 'higienizacao') {
      periods.push({ id: `hygiene:${equipment.id}`, equipmentId: equipment.id, startDate: null, endDate: null, kind: 'hygiene', contractId: null, contractNumber: null, leadId: equipment.currentLeadId, clientName: equipment.currentClientName, title: 'Higienização · período não registrado', conflict: false })
    }
    if (!hasMaintenanceToday && equipment.status === 'manutencao') {
      periods.push({ id: `maintenance:${equipment.id}`, equipmentId: equipment.id, startDate: null, endDate: null, kind: 'maintenance', contractId: null, contractNumber: null, leadId: equipment.currentLeadId, clientName: equipment.currentClientName, title: 'Manutenção · período não registrado', conflict: false })
    }
  }

  const dated = periods.filter((period) => period.startDate && period.endDate)
  const conflicts = new Set<string>()
  for (let index = 0; index < dated.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < dated.length; otherIndex += 1) {
      const left = dated[index]
      const right = dated[otherIndex]
      if (left.equipmentId === right.equipmentId && left.startDate! <= right.endDate! && right.startDate! <= left.endDate!) {
        conflicts.add(left.id)
        conflicts.add(right.id)
      }
    }
  }
  return periods.map((period) => ({ ...period, conflict: conflicts.has(period.id) }))
}
