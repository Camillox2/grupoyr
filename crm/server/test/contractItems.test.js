import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { resolveContractItems } from '../src/contractItems.js'
import { normalizeContractFreight, contractBillingPlan, rentalBillingPeriods, addBillingMonths, pickupFreightDate } from '../src/contractFreight.js'
import { sanitizeLeadDetails } from '../src/leadDetails.js'
import { renderContractHtml } from '../src/contractTemplate.js'
const eq = (id, name, productCode, monthlyPrice, salePrice) => ({ id, name, productCode, monthlyPrice, salePrice, status: 'disponivel', serialNumber: id })
const stock = [eq('qa-bed', 'CAMA ELETRICA 3 MOV LUXO', 'YR-CAE-3MV-LX', 450, 5800), eq('qa-support', 'SUPORTE DE ALIMENTO 2 GANCHOS', 'YR-SUP-ALIMENTO', 50, 300), eq('qa-d33', 'COLCHAO D33', 'YR-COLCH-D33', 0, 600)]
const items = stock.map(e => ({ product: e.name, productCode: e.productCode, modality: e.id === 'qa-d33' ? 'compra' : 'locacao', qty: 1, unitPrice: e.id === 'qa-d33' ? 600 : e.monthlyPrice }))
const company = { company: { name: 'Empresa fictícia QA', cnpj: '00.000.000/0000-00', address: 'Rua QA', phone: '', email: '' } }
const source = fs.readFileSync(new URL('../src/contracts.js', import.meta.url), 'utf8')
const creator = source.slice(source.indexOf('export function createContract('), source.indexOf('export function ensureSigningToken(')).replace('export function', 'function')
const signer = source.slice(source.indexOf('export async function signContract('), source.indexOf('// De -> para.')).replace('export async function', 'async function')
function fixture() {
  const lead = { id: 'qa-lead', name: 'Joice QA', phone: '5541999991234', email: 'qa@example.invalid', cpf: '000.000.000-00', address: 'Rua QA, 123 - Curitiba', rentalMonths: 1, quoteItems: structuredClone(items), closingNotes: 'Pedido com colchão D33. <script>QA</script>' }
  const records = { leads: [lead], equipments: structuredClone(stock), contracts: [], invoices: [] }
  const db = { get: key => records[key], find: (key, predicate) => records[key].find(predicate), insert: (key, item) => { records[key].push(item); return item }, update: (key, id, value) => Object.assign(records[key].find(item => item.id === id), value) }
  return { records, create: new Function('db', 'normalizeContractFreight', 'createSigningToken', 'resolveContractItems', 'contractBillingPlan', 'rentalBillingPeriods', 'addBillingMonths', 'pickupFreightDate', creator + ';return createContract')(db, normalizeContractFreight, () => 'qa-token', resolveContractItems, contractBillingPlan, rentalBillingPeriods, addBillingMonths, pickupFreightDate), sign: new Function('db', 'crypto', 'signAutomaticContract', signer + ';return signContract')(db, crypto, () => { throw new Error('not automatic fixture') }) }
}
test('real catalog preserves D33, support, customer identity and closing notes', () => {
  const result = sanitizeLeadDetails({ name: 'Joice QA', phone: '(41) 99999-1234', quoteItems: items, closingNotes: 'Entrega combinada <QA>' }, stock)
  assert.equal(result.name, 'Joice QA'); assert.equal(result.phone, '5541999991234'); assert.equal(result.closingNotes, 'Entrega combinada <QA>')
  assert.equal(result.quoteItems.length, 3); assert.equal(result.quoteItems[2].productCode, 'YR-COLCH-D33')
  assert.deepEqual(sanitizeLeadDetails({ quoteItems: [{ product: 'Produto inexistente', productCode: '' }] }, stock).quoteItems, [])
})
test('snapshot chooses physical units and splits rental versus one-time purchases', () => {
  const result = resolveContractItems(items, stock)
  assert.equal(result.rentalMonthly, 500); assert.equal(result.purchaseTotal, 600)
  assert.deepEqual(result.equipmentIds, ['qa-bed', 'qa-support', 'qa-d33'])
})
test('insufficient, reserved, unknown or duplicate units cannot form a contract', () => {
  assert.throws(() => resolveContractItems([{ ...items[0], qty: 2 }], stock), /Estoque insuficiente/)
  assert.throws(() => resolveContractItems(items, stock.map(e => ({ ...e, reservationContractId: 'qa-other' }))), /Estoque insuficiente/)
  assert.throws(() => resolveContractItems([{ ...items[0], product: 'Inventado', productCode: 'BAD' }], stock), /Estoque insuficiente/)
  assert.throws(() => resolveContractItems([items[0], items[0]], stock), /Estoque insuficiente/)
  assert.throws(() => resolveContractItems([{ ...items[0], unitPrice: 0 }], stock), /preço/)
  assert.throws(() => resolveContractItems([{ ...items[0], qty: 1.5 }], stock), /quantidade/)
})
test('sheet contract bills rental + purchase + both freights once and idempotently', () => {
  const f = fixture(), input = { leadId: 'qa-lead', useQuoteItems: true, creationRequestId: 'qa_creation_id_0000001', startDate: '2026-10-10', endDate: '2026-11-10', deliveryFreight: 100, pickupFreight: 80 }
  const contract = f.create(input)
  assert.equal(contract.monthlyValue, 500); assert.equal(contract.oneTimePurchaseTotal, 600); assert.equal(f.records.invoices[0].amount, 1200); assert.equal(f.records.invoices[1].amount, 80)
  assert.equal(f.create(input).id, contract.id); assert.equal(f.records.contracts.length, 1); assert.equal(f.records.invoices.length, 2)
  const html = renderContractHtml(contract, company)
  for (const value of ['COLCHAO D33', 'SUPORTE DE ALIMENTO', 'Joice QA', '5541999991234', 'Observações do fechamento', '1.280,00']) assert.ok(html.includes(value), value)
  assert.ok(!html.includes('<script>QA</script>')); assert.ok(html.includes('&lt;script&gt;'))
  assert.equal(contract.rentalMonths, 1); assert.ok(html.includes('(1 período(s))')); assert.ok(!html.includes('1.780,00'))
  f.records.leads[0].name = 'Nome alterado depois'
  assert.match(renderContractHtml(contract, company), /Joice QA/)
})

test('sheet months remain explicit across 31-day and multi-month terms', () => {
  const f = fixture(); f.records.leads[0].rentalMonths = 3
  const contract = f.create({ leadId: 'qa-lead', useQuoteItems: true, startDate: '2026-10-10', endDate: '2027-01-10', deliveryFreight: 100, pickupFreight: 80 })
  assert.equal(contract.rentalMonths, 3)
  assert.ok(renderContractHtml(contract, company).includes('2.280,00'))
  assert.ok(renderContractHtml(contract, company).includes('(3 período(s))'))
})

test('invalid sheet rental duration blocks creation without changing financial records', () => {
  for (const months of [0, 1.5, 121, null]) {
    const f = fixture(); f.records.leads[0].rentalMonths = months
    assert.throws(() => f.create({ leadId: 'qa-lead', useQuoteItems: true }), /período de locação/)
    assert.equal(f.records.contracts.length, 0); assert.equal(f.records.invoices.length, 0)
  }
})
test('signature returns signed contract and keeps purchases sold, rentals rented', async () => {
  const f = fixture(), contract = f.create({ leadId: 'qa-lead', useQuoteItems: true, deliveryFreight: 100, pickupFreight: 80 })
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS7cAAAAASUVORK5CYII='
  await assert.rejects(f.sign(contract.id, image, '127.0.0.1', 'Joice QA', false), /concorda/)
  const result = await f.sign(contract.id, image, '127.0.0.1', 'Joice QA', true)
  assert.equal(result.status, 'assinado'); assert.match(result.documentHash, /^[a-f0-9]{64}$/)
  assert.equal(f.records.equipments.find(e => e.id === 'qa-bed').status, 'alugado'); assert.equal(f.records.equipments.find(e => e.id === 'qa-support').status, 'alugado'); assert.equal(f.records.equipments.find(e => e.id === 'qa-d33').status, 'vendido')
})
