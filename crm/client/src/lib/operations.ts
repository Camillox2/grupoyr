import { CalendarEvent, CalendarEventType, Contract, Equipment, Invoice, Lead } from '../types'

export type AgendaStatus = CalendarEvent['status'] | 'overdue' | 'paid' | 'tentative'
export type AgendaSource = 'manual' | 'contract' | 'invoice'

export interface AgendaItem {
  id: string
  title: string
  type: CalendarEventType
  date: string
  startTime: string
  endTime: string
  leadId: string | null
  contractId: string | null
  equipmentId: string | null
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
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    leadId: event.leadId,
    contractId: event.contractId,
    equipmentId: event.equipmentId,
    notes: event.notes || '',
    status: event.status,
    source: 'manual',
  }))

  for (const contract of contracts) {
    if (contract.status !== 'assinado' && contract.status !== 'encerrado') continue
    const lead = leadById.get(contract.leadId)
    const deliveryDate = lead?.deliveryDate || contract.startDate
    if (isValidIsoDate(deliveryDate)) {
      items.push({
        id: `contract-delivery-${contract.id}`,
        title: `Entrega · ${contract.clientName}`,
        type: 'entrega',
        date: deliveryDate,
        startTime: '',
        endTime: '',
        leadId: contract.leadId,
        contractId: contract.id,
        equipmentId: contract.equipmentIds?.[0] || null,
        notes: lead?.deliveryNotes || '',
        status: 'scheduled',
        source: 'contract',
      })
    }
    if (isValidIsoDate(contract.endDate)) {
      items.push({
        id: `contract-return-${contract.id}`,
        title: `Retirada · ${contract.clientName}`,
        type: 'retirada',
        date: contract.endDate,
        startTime: '',
        endTime: '',
        leadId: contract.leadId,
        contractId: contract.id,
        equipmentId: contract.equipmentIds?.[0] || null,
        notes: `Término previsto do contrato ${contract.number}.`,
        status: 'scheduled',
        source: 'contract',
      })
    }
  }

  for (const invoice of invoices) {
    if (!['pendente', 'atrasada'].includes(invoice.status) || !isValidIsoDate(invoice.dueDate)) continue
    const relatedContract = contractByNumber.get(invoice.contractNumber)
    const due = parseLocalDate(invoice.dueDate)
    const today = parseLocalDate(toLocalDateKey(new Date()))
    const isOverdue = invoice.status === 'atrasada' || Boolean(due && today && due < today)
    items.push({
      id: `invoice-${invoice.id}`,
      title: `Cobrança · ${invoice.clientName}`,
      type: 'cobranca',
      date: invoice.dueDate,
      startTime: '',
      endTime: '',
      leadId: invoice.leadId,
      contractId: relatedContract?.id || null,
      equipmentId: null,
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
    .filter((contract) => contract.status === 'assinado' || contract.status === 'pendente_assinatura')
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
    .filter((booking) => isValidIsoDate(booking.startDate) && isValidIsoDate(booking.endDate))
}
