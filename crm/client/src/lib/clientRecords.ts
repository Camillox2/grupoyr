import type { Contract, Lead } from '../types'

export interface ClientRecord {
  id: string
  lead: Lead | null
  leadIds: string[]
  name: string
  phone: string
  email: string
  cpf: string
  contracts: Contract[]
  lastActivity: string
}

export const digitsOnly = (value: string | null | undefined) => String(value || '').replace(/\D/g, '')

export const normalizedText = (value: string | null | undefined) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const clientStages = new Set<Lead['stage']>([
  'contrato_gerado',
  'assinado_entrega',
  'locacao_ativa',
  'finalizado',
])

export const buildClientRecords = (leads: Lead[], contracts: Contract[]): ClientRecord[] => {
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
  const leadsByCpf = new Map<string, Lead>()
  const leadsByContact = new Map<string, Lead>()

  for (const lead of leads) {
    const cpf = digitsOnly(lead.cpf)
    const phone = digitsOnly(lead.phone)
    const name = normalizedText(lead.name)
    if (cpf) leadsByCpf.set(cpf, lead)
    if (phone && name) leadsByContact.set(`${phone}:${name}`, lead)
  }

  const grouped = new Map<string, ClientRecord>()
  const completeness = (lead: Lead) => Number(Boolean(lead.email))
    + Number(Boolean(lead.cpf))
    + Number(Boolean(lead.address))
    + Number(Boolean(lead.addressData?.street))
    + Number(Boolean(lead.quoteItems?.length))
    + Number(Boolean(lead.deliveryDate))

  for (const contract of contracts) {
    const phone = digitsOnly(contract.clientPhone)
    const name = normalizedText(contract.clientName)
    const cpf = digitsOnly(contract.clientCpf)
    const lead = leadsById.get(contract.leadId)
      || (cpf ? leadsByCpf.get(cpf) : undefined)
      || (phone && name ? leadsByContact.get(`${phone}:${name}`) : undefined)
      || null
    const clientCpf = cpf || digitsOnly(lead?.cpf)
    const contactKey = name && phone ? `contact:${name}:${phone}` : ''
    const id = clientCpf ? `cpf:${clientCpf}` : contactKey || (lead ? `lead:${lead.id}` : `legacy:${name}:${phone}`)
    let record = grouped.get(id)

    if (!record) {
      record = {
        id,
        lead,
        leadIds: [],
        name: lead?.name || contract.clientName || 'Cliente sem nome',
        phone: lead?.phone || contract.clientPhone || '',
        email: lead?.email || '',
        cpf: lead?.cpf || contract.clientCpf || '',
        contracts: [],
        lastActivity: contract.createdAt || '',
      }
      grouped.set(id, record)
    } else if (lead && (!record.lead || completeness(lead) > completeness(record.lead))) {
      record.lead = lead
      record.name = lead.name || record.name
      record.phone = lead.phone || record.phone
      record.email = lead.email || record.email
      record.cpf = lead.cpf || record.cpf
    }

    if (lead?.id && !record.leadIds.includes(lead.id)) record.leadIds.push(lead.id)
    record.contracts.push(contract)
    if (String(contract.createdAt || '') > record.lastActivity) record.lastActivity = contract.createdAt
  }

  for (const lead of leads) {
    if (!clientStages.has(lead.stage)) continue
    const cpf = digitsOnly(lead.cpf)
    const phone = digitsOnly(lead.phone)
    const name = normalizedText(lead.name)
    const contactKey = name && phone ? `contact:${name}:${phone}` : ''
    const id = cpf ? `cpf:${cpf}` : contactKey || `lead:${lead.id}`
    const existing = grouped.get(id)

    if (existing) {
      if (!existing.leadIds.includes(lead.id)) existing.leadIds.push(lead.id)
      if (!existing.lead || completeness(lead) > completeness(existing.lead)) {
        existing.lead = lead
        existing.name = lead.name || existing.name
        existing.phone = lead.phone || existing.phone
        existing.email = lead.email || existing.email
        existing.cpf = lead.cpf || existing.cpf
      }
      continue
    }

    grouped.set(id, {
      id,
      lead,
      leadIds: [lead.id],
      name: lead.name || 'Cliente sem nome',
      phone: lead.phone || '',
      email: lead.email || '',
      cpf: lead.cpf || '',
      contracts: [],
      lastActivity: lead.lastInteraction || lead.createdAt || '',
    })
  }

  return Array.from(grouped.values())
    .map((client) => ({
      ...client,
      contracts: client.contracts.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
      leadIds: Array.from(new Set(client.leadIds)),
    }))
    .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)))
}
