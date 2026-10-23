import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePickupCorrection } from '../src/billingCorrection.js'

const contract = { id: 'qa', number: 'QA-001', type: 'locacao', status: 'assinado', startDate: '2026-10-10', pickupFreight: 130, documentHash: 'signed-original' }
const invoice = { id: 'qa-2', contractNumber: 'QA-001', amount: 630.01, dueDate: '2026-11-10', status: 'pendente', paidAt: null, kind: 'mensalidade_e_retirada', billingDetails: { amount: 630.01, dueDate: '2026-11-10', rentalCents: 50001, saleCents: 0, purchaseCents: 0, deliveryCents: 0, pickupCents: 13000 } }
const input = () => ({ contract: structuredClone(contract), invoices: [structuredClone(invoice)], dueDate: '2026-12-10', amount: 130 })
test('correction preserves signed contract, keeps cents, splits only the unpaid invoice and creates a recovery record', () => {
  const args = input(), before = structuredClone(args), result = preparePickupCorrection(args)
  assert.deepEqual(args, before)
  assert.equal(result.corrected.amount, 500.01)
  assert.equal(result.corrected.billingDetails.pickupCents, 0)
  assert.equal(result.pickup.amount, 130)
  assert.equal(result.pickup.dueDate, '2026-12-10')
  assert.equal(result.pickup.billingDetails.rentalCents, 0)
  assert.equal(result.audit.signedDocumentPreserved, true)
  assert.deepEqual(result.audit.originalInvoice, invoice)
})
test('paid, cancelled, duplicate return and inconsistent amounts fail closed', () => {
  for (const status of ['paga', 'cancelada']) { const args = input(); args.invoices[0].status = status; assert.throws(() => preparePickupCorrection(args), /paga ou cancelada/) }
  const paid = input(); paid.invoices[0].paidAt = '2026-10-10'; assert.throws(() => preparePickupCorrection(paid))
  const duplicate = input(); duplicate.invoices.push({ ...invoice, id: 'return', kind: 'frete_retirada' }); assert.throws(() => preparePickupCorrection(duplicate), /Já existe/)
  const altered = input(); altered.invoices[0].amount = 999; assert.throws(() => preparePickupCorrection(altered), /não conferem/)
  assert.throws(() => preparePickupCorrection({ ...input(), amount: 100 }))
})
