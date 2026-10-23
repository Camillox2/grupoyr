import crypto from 'node:crypto'
import { db } from './db.js'
import { renderContractHtml as renderTemplate } from './contractTemplate.js'
import { normalizeContractFreight, contractBillingPlan, rentalBillingPeriods, addBillingMonths, pickupFreightDate } from './contractFreight.js'
import { resolveContractItems } from './contractItems.js'
import { signAutomaticContract,changeAutomaticContractStatus } from './automaticContractLifecycle.js'

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0)

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const displayDate = (value) => {
  if (!value) return 'Não informado'
  const source = String(value)
  const date = new Date(source.length === 10 ? `${source}T00:00:00` : source)
  return Number.isNaN(date.getTime()) ? escapeHtml(source) : date.toLocaleDateString('pt-BR')
}

const textWithBreaks = (value = '') => escapeHtml(value).replace(/\r?\n/g, '<br>')

const createSigningToken = () => crypto.randomBytes(32).toString('base64url')

const contractualCycles = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const days = Math.max(1, Math.ceil((end - start) / 86400000))
  return Math.max(1, Math.ceil(days / 30))
}

export function createContract({
  leadId,
  type = 'locacao', // locacao | venda
  equipmentIds = [],
  startDate,
  endDate,
  monthlyValue,
  deliveryFreight,
  pickupFreight,
  pickupFreightDueDate,
  customClauses = '',
  useQuoteItems = false,
  creationRequestId = '',
}) {
  const lead = db.find('leads', (l) => l.id === leadId)
  if (!lead) throw new Error('Lead não encontrado')
  if (creationRequestId) {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(creationRequestId)) throw new Error('Identificador da geração inválido.')
    const existing = db.find('contracts', item => item.leadId === lead.id && item.creationRequestId === creationRequestId)
    if (existing) return existing
  }

  const itemSnapshot = useQuoteItems === true ? resolveContractItems(lead.quoteItems, db.get('equipments')) : null
  if (itemSnapshot) {
    equipmentIds = itemSnapshot.equipmentIds
    type = itemSnapshot.rentalMonthly > 0 ? 'locacao' : 'venda'
    monthlyValue = type === 'locacao' ? itemSnapshot.rentalMonthly : itemSnapshot.purchaseTotal
  }
  const rentalMonths = itemSnapshot && type === 'locacao' ? Number(lead.rentalMonths) : null
  if (rentalMonths !== null && (!Number.isInteger(rentalMonths) || rentalMonths < 1 || rentalMonths > 120)) {
    throw new Error('Informe um período de locação inteiro entre 1 e 120 meses na ficha.')
  }
  const equipments = equipmentIds.map((id) => db.find('equipments', (e) => e.id === id)).filter(Boolean)
  if(equipments.length!==equipmentIds.length||equipments.some(e=>e.status!=='disponivel'||e.reservationContractId))throw new Error('Há equipamento indisponível ou reservado. Confira o estoque.')
  const equipmentNames = itemSnapshot?.names || equipments.map((e) => `${e.name} (Patr. ${e.serialNumber})`).join(', ') || lead.equipmentInterest

  const contractCount = db.get('contracts').reduce((highest, item) => {
    const sequence = Number(String(item.number || '').match(/-(\d+)$/)?.[1] || 0)
    return Math.max(highest, sequence)
  }, 0) + 1
  const normalizedMonthlyValue = Number(monthlyValue)
  if (!Number.isFinite(normalizedMonthlyValue) || normalizedMonthlyValue <= 0) {
    throw new Error('Informe um valor de contrato maior que zero')
  }
  const contractNumber = `CTR-2026-${String(contractCount).padStart(3, '0')}`
  const freightQuote = normalizeContractFreight({ deliveryFreight, pickupFreight }, lead, type)
  // Old open tabs still create their own extra freight invoice. Only the new
  // split-field payload receives the new schedule; legacy tabs keep their old flow.
  const splitBilling = deliveryFreight != null || pickupFreight != null || useQuoteItems === true
  const normalizedStartDate = addBillingMonths(startDate || new Date().toISOString().split('T')[0], 0)
  const normalizedEndDate = type === 'locacao'
    ? rentalMonths !== null ? addBillingMonths(normalizedStartDate, rentalMonths) : addBillingMonths(endDate || addBillingMonths(normalizedStartDate, 1), 0)
    : normalizedStartDate
  if (normalizedEndDate < normalizedStartDate) throw new Error('O término deve ser posterior ao início da locação.')

  const contract = {
    id: `ctr_${Date.now()}`,
    number: contractNumber,
    leadId: lead.id,
    ...(creationRequestId ? { creationRequestId } : {}),
    clientName: lead.name,
    clientEmail: lead.email || '',
    closingNotes: lead.closingNotes || '',
    clientCpf: lead.cpf || 'Não informado na cotação',
    clientPhone: lead.phone,
    address: lead.address || 'Curitiba - PR',
    type,
    equipmentIds,
    equipmentNames,
    ...(itemSnapshot ? { itemDetailsVersion: 1, itemsSnapshot: itemSnapshot.rows, oneTimePurchaseTotal: type === 'locacao' ? itemSnapshot.purchaseTotal : 0 } : {}),
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    monthlyValue: normalizedMonthlyValue,
    ...(rentalMonths !== null ? { rentalMonths } : {}),
    deliveryFreight: freightQuote.deliveryCents / 100,
    pickupFreight: freightQuote.pickupCents / 100,
    freightQuote,
    freightDetailsVersion: 1,
    ...(splitBilling ? { freightBillingVersion: 3 } : {}),
    customClauses,
    status: 'pendente_assinatura',
    signedAt: null,
    signerIp: null,
    signatureDataUrl: null,
    documentHash: null,
    signingToken: createSigningToken(),
    createdAt: new Date().toISOString(),
  }

  if (splitBilling) {
    if (contract.type === 'locacao') contract.rentalMonths = rentalBillingPeriods(contract)
    if (freightQuote.pickupCents > 0) contract.pickupFreightDueDate = pickupFreightDate({ ...contract, pickupFreightDueDate: pickupFreightDueDate || lead.pickupFreightDueDate })
    contract.billingSchedule = contractBillingPlan(contract)
  }

  db.insert('contracts', contract)

  // Atualiza lead com o estágio de contrato gerado
  db.update('leads', lead.id, {
    stage: 'contrato_gerado',
    notes: `Contrato ${contractNumber} gerado e aguardando assinatura.`,
  })

  // Return is a separate one-time invoice with its own agreed due date.
  const schedule = contract.billingSchedule || [{ installment: 1, amount: contract.monthlyValue + (contract.oneTimePurchaseTotal || 0), dueDate: contract.startDate }]
  for (const charge of schedule) db.insert('invoices', {
    id: `inv_${contract.id}_${charge.installment}`,
    contractNumber: contract.number,
    clientName: contract.clientName,
    leadId: contract.leadId,
    amount: charge.amount,
    dueDate: charge.dueDate,
    ...(splitBilling ? { kind: charge.kind, billingDetails: { ...charge }, freightBillingVersion: 3 } : {}),
    status: 'pendente',
    paidAt: null,
  })

  return contract
}

export function ensureSigningToken(contract) {
  if (contract.signingToken) return contract
  return db.update('contracts', contract.id, { signingToken: createSigningToken() }) || contract
}

export function findContractBySigningToken(token) {
  if (!token) return null
  return db.find('contracts', (contract) => contract.signingToken === token && !(contract.automatic&&contract.status==='pendente_assinatura'&&contract.reservationExpiresAt<=new Date().toISOString()))
}

export async function signContract(contractId, signatureDataUrl, signerIp = '127.0.0.1', signerName = '', accepted = false) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if(contract?.automatic)return signAutomaticContract(db,contractId,{signatureDataUrl,signerIp,signerName,accepted})
  if (!contract) throw new Error('Contrato não encontrado')
  if (contract.status === 'assinado') throw new Error('Este contrato já foi assinado')
  // O link de assinatura e publico e nao expira: sem esta trava, um contrato
  // cancelado continuava podendo ser assinado por quem tivesse o link antigo.
  if (['cancelado', 'encerrado'].includes(contract.status)) {
    throw new Error('Este contrato não está mais disponível para assinatura.')
  }
  if (accepted !== true) throw new Error('Confirme que leu e concorda com as condições do contrato.')
  if (typeof signatureDataUrl !== 'string' || !/^data:image\/(png|jpeg);base64,/i.test(signatureDataUrl)) {
    throw new Error('Assinatura digital inválida')
  }
  if (signatureDataUrl.length > 1000000) throw new Error('A assinatura digital excede o limite permitido')

  const normalizedSignerName = String(signerName || contract.clientName || '').trim()
  if (normalizedSignerName.length < 2) throw new Error('Informe o nome completo do signatário')
  if((contract.equipmentIds||[]).some(id=>{const e=db.find('equipments',e=>e.id===id);return !e||e.reservationContractId||(e.status!=='disponivel'&&e.currentLeadId!==contract.leadId)}))throw new Error('Equipamento indisponível. Confira a reserva com a equipe.')

  const signedAt = new Date().toISOString()
  const rawContent = JSON.stringify({
    contractId: contract.id,
    number: contract.number,
    clientName: contract.clientName,
    equipmentNames: contract.equipmentNames,
    startDate: contract.startDate,
    endDate: contract.endDate,
    monthlyValue: contract.monthlyValue,
    ...(contract.freightDetailsVersion === 1 ? { deliveryFreight: contract.deliveryFreight, pickupFreight: contract.pickupFreight } : {}),
    ...(contract.freightBillingVersion === 2 ? { freightBillingVersion: 2, billingSchedule: contract.billingSchedule } : {}),
    ...(contract.freightBillingVersion === 3 ? { freightBillingVersion: 3, billingSchedule: contract.billingSchedule, pickupFreightDueDate: contract.pickupFreightDueDate } : {}),
    ...(contract.itemDetailsVersion === 1 ? { itemsSnapshot: contract.itemsSnapshot, oneTimePurchaseTotal: contract.oneTimePurchaseTotal, rentalMonths: contract.rentalMonths, clientCpf: contract.clientCpf, clientPhone: contract.clientPhone, clientEmail: contract.clientEmail } : {}),
    ...(contract.closingNotes ? { closingNotes: contract.closingNotes } : {}),
    signerName: normalizedSignerName,
    signatureDataUrl,
    signedAt,
    signerIp,
  })
  const documentHash = crypto.createHash('sha256').update(rawContent).digest('hex')

  const updated = db.update('contracts', contractId, {
    status: 'assinado',
    signedAt,
    signerIp,
    signerName: normalizedSignerName,
    signatureDataUrl,
    documentHash,
  })

  // Atualiza equipamentos vinculados para status 'alugado'
  if (contract.equipmentIds && contract.equipmentIds.length > 0) {
    for (const eqId of contract.equipmentIds) {
      db.update('equipments', eqId, {
        status: contract.itemsSnapshot?.find(item => item.equipmentIds.includes(eqId))?.modality === 'compra' || contract.type==='venda'?'vendido':'alugado',
        currentLeadId: contract.leadId,
        currentClientName: contract.clientName,
      })
    }
  }

  // Atualiza lead para 'assinado_entrega'
  db.update('leads', contract.leadId, {
    stage: 'assinado_entrega',
    notes: `Contrato ${contract.number} assinado digitalmente em ${new Date().toLocaleString('pt-BR')}. Pronto para entrega e montagem.`,
  })

  return updated
}

// De -> para. Tudo o que nao esta aqui e recusado.
const STATUS_TRANSITIONS = {
  rascunho: ['pendente_assinatura', 'cancelado'],
  pendente_assinatura: ['cancelado'],
  assinado: ['encerrado', 'cancelado'],
  // So volta a valer o que nunca chegou a ser assinado.
  cancelado: ['pendente_assinatura'],
  encerrado: [],
}

export function allowedContractStatuses(contract) {
  if(contract.automatic&&contract.status==='cancelado')return []
  const next = STATUS_TRANSITIONS[contract.status] || []
  return contract.status === 'cancelado' && contract.signedAt ? [] : next
}

/**
 * Cancela, encerra ou reativa um contrato e arruma o que depende dele:
 * equipamento volta para higienizacao, cobranca em aberto de contrato
 * cancelado deixa de ser cobrada e o lead anda no funil.
 */
export async function changeContractStatus(contractId, nextStatus, { reason = '', user = null } = {}) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if(contract?.automatic)return changeAutomaticContractStatus(db,contractId,nextStatus,{reason,user})
  if (!contract) throw new Error('Contrato não encontrado')
  if (!allowedContractStatuses(contract).includes(nextStatus)) {
    throw new Error('Essa mudança de status não é permitida para este contrato.')
  }

  const now = new Date().toISOString()
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  // Cancelar mexe em estoque e cobranca: o motivo e obrigatorio tambem aqui,
  // nao so na tela.
  if (nextStatus === 'cancelado' && cleanReason.length < 3) throw new Error('Informe o motivo do cancelamento.')
  const history = Array.isArray(contract.statusHistory) ? contract.statusHistory : []
  const updated = db.update('contracts', contractId, {
    status: nextStatus,
    statusReason: cleanReason,
    statusChangedAt: now,
    statusHistory: [...history, { from: contract.status, to: nextStatus, at: now, by: user?.id || null, byName: user?.name || '', reason: cleanReason }].slice(-20),
  })

  const leaving = nextStatus === 'cancelado' || nextStatus === 'encerrado'
  const released = []
  if (leaving) {
    for (const equipmentId of contract.equipmentIds || []) {
      const equipment = db.find('equipments', (item) => item.id === equipmentId)
      // So mexe no que ESTE contrato alugou: o mesmo equipamento pode ja
      // estar com outro cliente.
      if (equipment && equipment.status === 'alugado' && equipment.currentLeadId === contract.leadId) {
        released.push(db.update('equipments', equipmentId, { status: 'higienizacao', currentLeadId: null, currentClientName: null }))
      }
    }
  }

  const cancelledInvoices = []
  if (nextStatus === 'cancelado') {
    for (const invoice of db.filter('invoices', (item) => item.contractNumber === contract.number && ['pendente', 'atrasada'].includes(item.status))) {
      cancelledInvoices.push(db.update('invoices', invoice.id, { status: 'cancelada', cancelledAt: now }))
    }
  }

  const lead = db.find('leads', (item) => item.id === contract.leadId)
  let updatedLead = null
  if (lead) {
    if (nextStatus === 'encerrado') {
      updatedLead = db.update('leads', lead.id, { stage: 'finalizado' })
    } else if (nextStatus === 'cancelado' && ['contrato_gerado', 'assinado_entrega', 'locacao_ativa'].includes(lead.stage)) {
      updatedLead = db.update('leads', lead.id, { stage: 'proposta_enviada' })
    } else if (nextStatus === 'pendente_assinatura' && lead.stage === 'proposta_enviada') {
      updatedLead = db.update('leads', lead.id, { stage: 'contrato_gerado' })
    }
  }

  return { contract: updated, lead: updatedLead, released, cancelledInvoices }
}

export function renderContractHtml(contract) { return renderTemplate(contract,db.getSettings()) }
