import { createHash } from 'node:crypto'
import { addBillingMonths } from './contractFreight.js'

export const recordHash = record => createHash('sha256').update(JSON.stringify(record)).digest('hex')

/** An explicitly authorized financial correction, never an edit to a signed contract. */
export function preparePickupCorrection({ contract, invoices, dueDate, amount, now = new Date().toISOString() }) {
  const cents = Math.round(Number(amount) * 100)
  if (!contract || contract.type !== 'locacao' || contract.status !== 'assinado') throw Error('Confira o contrato assinado alvo da correção.')
  if (!Number.isFinite(Number(amount)) || cents <= 0 || cents !== Math.round(Number(contract.pickupFreight) * 100)) throw Error('O frete não corresponde ao valor contratado.')
  const date = addBillingMonths(dueDate, 0)
  if (date < contract.startDate) throw Error('O vencimento não pode ser anterior ao início.')
  const target = invoices.filter(invoice => invoice.contractNumber === contract.number && invoice.kind === 'mensalidade_e_retirada' && invoice.billingDetails?.pickupCents === cents)
  if (target.length !== 1) throw Error('É necessário exatamente um lançamento combinado para corrigir.')
  const source = target[0]
  if (!['pendente', 'atrasada'].includes(source.status) || source.paidAt) throw Error('Uma cobrança paga ou cancelada não pode ser corrigida por este fluxo.')
  if (invoices.some(invoice => invoice.contractNumber === contract.number && invoice.kind === 'frete_retirada' && invoice.status !== 'cancelada')) throw Error('Já existe um frete separado; confira antes de repetir.')
  const totalCents = Math.round(source.amount * 100)
  const details = source.billingDetails
  if (details.amount !== source.amount || details.dueDate !== source.dueDate || totalCents !== details.rentalCents + details.saleCents + details.purchaseCents + details.deliveryCents + details.pickupCents || totalCents <= cents) throw Error('Os componentes da cobrança não conferem.')
  const corrected = {
    ...source, amount: (totalCents - cents) / 100, kind: 'mensalidade',
    billingDetails: { ...details, amount: (totalCents - cents) / 100, pickupCents: 0, kind: 'mensalidade' },
    billingCorrectionAt: now,
  }
  const pickup = {
    id: `inv_${contract.id}_return_${date.replaceAll('-', '')}`, contractNumber: contract.number,
    clientName: source.clientName, leadId: source.leadId, amount: cents / 100, dueDate: date,
    status: 'pendente', paidAt: null, kind: 'frete_retirada', freightBillingVersion: 3,
    billingDetails: { installment: 0, dueDate: date, amount: cents / 100, rentalCents: 0, saleCents: 0, purchaseCents: 0, deliveryCents: 0, pickupCents: cents, kind: 'frete_retirada' },
    correctedFromInvoiceId: source.id, createdAt: now,
  }
  return { source, corrected, pickup, audit: {
    id: `pickup_${contract.id}_${date.replaceAll('-', '')}`, type: 'authorized_pickup_split',
    contractId: contract.id, contractNumber: contract.number, signedDocumentPreserved: true,
    contractRecordHash: recordHash(contract), originalInvoice: structuredClone(source),
    correctedInvoice: structuredClone(corrected), newInvoice: structuredClone(pickup), createdAt: now,
    reason: 'Correção expressamente autorizada pelo administrador: frete de R$ 130 em cobrança única em 10/12/2026. Documento assinado preservado; alteração contratual depende de formalização com o cliente.',
  } }
}
