import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { leadFreight, normalizeContractFreight, contractFreight, contractBillingPlan, rentalBillingPeriods, addBillingMonths, pickupFreightDate } from '../src/contractFreight.js'
import { sanitizeLeadDetails } from '../src/leadDetails.js'
import { renderContractHtml } from '../src/contractTemplate.js'
import { addCalendarMonths, billingMonthsForDates } from '../../client/src/lib/freight.ts'

const company = {company:{name:'Empresa QA fictícia',cnpj:'00.000.000/0000-00',address:'Rua QA',phone:'',email:''}}
const base = {id:'qa-contract',number:'QA-001',type:'locacao',clientName:'Cliente fictício',monthlyValue:500,startDate:'2026-10-10',endDate:'2026-11-09',createdAt:'2026-10-10',status:'pendente_assinatura'}

test('delivery and return are separate; legacy combined lead freight is not added twice', () => {
  assert.deepEqual(leadFreight({freight:180,deliveryFreight:100,pickupFreight:80}),{deliveryCents:10000,pickupCents:8000})
  assert.deepEqual(leadFreight({freight:180,pickupFreight:80}),{deliveryCents:10000,pickupCents:8000})
  assert.deepEqual(leadFreight({freight:100}),{deliveryCents:10000,pickupCents:0})
  assert.deepEqual(normalizeContractFreight({deliveryFreight:123.45,pickupFreight:76.55}),{deliveryCents:12345,pickupCents:7655})
})

test('a sale never charges rental return; malformed and negative freight are rejected', () => {
  assert.deepEqual(normalizeContractFreight({deliveryFreight:100,pickupFreight:80},{},'venda'),{deliveryCents:10000,pickupCents:0})
  for(const value of [-1,Infinity,'invalid',10_000_001]) assert.throws(()=>normalizeContractFreight({deliveryFreight:value}),/frete de entrega/)
  assert.throws(()=>normalizeContractFreight({pickupFreight:-1}),/frete de retirada/)
})

test('lead details preserve split fields, round cents and keep the legacy total', () => {
  const result=sanitizeLeadDetails({deliveryFreight:100.123,pickupFreight:80.678,freight:999})
  assert.equal(result.deliveryFreight,100.12)
  assert.equal(result.pickupFreight,80.68)
  assert.equal(result.freight,180.8)
  const restored=sanitizeLeadDetails(result)
  assert.equal(restored.freight,180.8)
  assert.equal(restored.pickupFreight,80.68)
})

test('manual contract document and automatic quote show each freight and the correct total', () => {
  for(const split of [{deliveryFreight:100,pickupFreight:80},{freightQuote:{deliveryCents:10000,pickupCents:8000},automatic:true}]){
    const html=renderContractHtml({...base,...split,freightDetailsVersion:1},company)
    assert.match(html,/Frete de entrega \(ida\)/)
    assert.match(html,/Frete de retirada \(volta\)/)
    assert.match(html,/100,00/)
    assert.match(html,/80,00/)
    assert.match(html,/680,00/)
    assert.doesNotMatch(html,/860,00/)
  }
  assert.deepEqual(contractFreight({...base,freightQuote:{deliveryCents:10000,pickupCents:8000}}),{deliveryCents:10000,pickupCents:8000})
})

test('signed legacy documents are not rewritten to introduce new freight clauses', () => {
  const html=renderContractHtml({...base,status:'assinado',signedAt:'2026-10-10T10:00:00Z',automatic:true,freightQuote:{deliveryCents:10000,pickupCents:8000}},company)
  assert.doesNotMatch(html,/Frete de retirada \(volta\)/)
  assert.match(html,/680,00/)
})

// Exercise the exact production creator with an in-memory database only.
// Do not import db.js: these tests must never connect to Neon or write real records.
const source=fs.readFileSync(new URL('../src/contracts.js',import.meta.url),'utf8')
const creatorSource=source.slice(source.indexOf('export function createContract('),source.indexOf('export function ensureSigningToken(')).replace('export function','function')
function createFixture(){
  const records={leads:[{id:'qa-lead',name:'Cliente QA',phone:'550000000000',freight:180,deliveryFreight:100,pickupFreight:80}],contracts:[],invoices:[],equipments:[]}
  const database={get:key=>records[key],find:(key,fn)=>records[key].find(fn),insert:(key,item)=>{records[key].push(item);return item},update:(key,id,value)=>{const item=records[key].find(row=>row.id===id);return Object.assign(item,value)}}
  const create=new Function('db','normalizeContractFreight','createSigningToken','contractBillingPlan','rentalBillingPeriods','addBillingMonths','pickupFreightDate',creatorSource+'; return createContract;')(database,normalizeContractFreight,()=> 'qa-signature',contractBillingPlan,rentalBillingPeriods,addBillingMonths,pickupFreightDate)
  return {records,create}
}

test('new one-month manual rental charges delivery first and return only in second invoice', () => {
  const {records,create}=createFixture()
  const contract=create({leadId:'qa-lead',monthlyValue:500,deliveryFreight:100,pickupFreight:80})
  assert.equal(contract.deliveryFreight,100)
  assert.equal(contract.pickupFreight,80)
  assert.equal(contract.freightDetailsVersion,1)
  assert.equal(contract.freightBillingVersion,3)
  assert.equal(records.invoices.length,2)
  assert.equal(records.invoices[0].amount,600)
  assert.equal(records.invoices[1].amount,80)
  assert.equal(records.invoices[0].billingDetails.pickupCents,0)
  assert.equal(records.invoices[1].billingDetails.rentalCents,0)
  assert.equal(records.invoices[1].kind,'frete_retirada')
  assert.equal(contract.monthlyValue,500)
})

test('three-month rental bills return alone on December 10, never as a monthly charge', () => {
  const {records,create}=createFixture()
  const contract=create({leadId:'qa-lead',monthlyValue:500,startDate:'2026-10-10',endDate:'2027-01-10',deliveryFreight:130,pickupFreight:130})
  assert.deepEqual(records.invoices.map(i=>i.amount),[630,500,500,130])
  assert.deepEqual(records.invoices.map(i=>i.dueDate),['2026-10-10','2026-11-10','2026-12-10','2026-12-10'])
  assert.equal(records.invoices.reduce((sum,i)=>sum+i.billingDetails.pickupCents,0),13000)
  assert.equal(records.invoices[3].kind,'frete_retirada')
  assert.equal(records.invoices[3].billingDetails.rentalCents,0)
  assert.equal(contract.pickupFreightDueDate,'2026-12-10')
  const html=renderContractHtml(contract,company)
  assert.match(html,/Primeira cobrança/);assert.match(html,/cobrança única, não mensal/)
  assert.match(html,/130,00.*vencimento 10\/12\/2026/)
  assert.doesNotMatch(html,/retirada uma única vez na segunda cobrança/)
  assert.doesNotMatch(html,/Os fretes são cobrados uma única vez, na primeira/)
})

test('billing calendar clamps January 31 without adding a false extra rental month', () => {
  const contract={...base,startDate:'2027-01-31',endDate:'2027-02-28',deliveryFreight:100,pickupFreight:80}
  assert.equal(rentalBillingPeriods(contract),1)
  assert.equal(addBillingMonths('2027-01-31',1),'2027-02-28')
  assert.deepEqual(contractBillingPlan(contract).map(i=>[i.dueDate,i.amount]),[['2027-01-31',600],['2027-02-28',80]])
  assert.throws(()=>contractBillingPlan({...contract,startDate:'2027-02-30'}),/data/)
})

test('zero return freight creates no extra invoice and monetary cents remain exact', () => {
  const rental={...base,rentalMonths:1,monthlyValue:450.55,deliveryFreight:100.12,pickupFreight:0}
  assert.deepEqual(contractBillingPlan(rental).map(i=>i.amount),[550.67])
  const sale={...rental,type:'venda',pickupFreight:80}
  assert.deepEqual(contractBillingPlan(sale).map(i=>i.amount),[550.67])
  assert.equal(contractBillingPlan(sale)[0].rentalCents,0)
  assert.equal(contractBillingPlan(sale)[0].saleCents,45055)
})

test('issued signed legacy contract and paid invoices are not rewritten by new creation', () => {
  const f=createFixture(),oldContract={...base,status:'assinado',freightDetailsVersion:1,deliveryFreight:100,pickupFreight:80},paid={id:'qa-paid',contractNumber:'QA-001',amount:680,status:'paga',paidAt:'2026-10-10'}
  f.records.contracts.push(oldContract);f.records.invoices.push(paid)
  const beforeHtml=renderContractHtml(oldContract,company),before=structuredClone(paid)
  f.create({leadId:'qa-lead',monthlyValue:500,deliveryFreight:100,pickupFreight:80})
  assert.deepEqual(paid,before);assert.equal(renderContractHtml(oldContract,company),beforeHtml)
  assert.match(beforeHtml,/Os fretes são cobrados uma única vez, na primeira cobrança/)
})

test('old open-tab payload does not duplicate the separate invoice created by the legacy frontend', () => {
  const {records,create}=createFixture()
  create({leadId:'qa-lead',monthlyValue:500})
  assert.equal(records.invoices[0].amount,500)
})

test('sale creator excludes return freight and invalid freight makes no records', () => {
  const {records,create}=createFixture()
  const contract=create({leadId:'qa-lead',type:'venda',monthlyValue:500,deliveryFreight:100,pickupFreight:80})
  assert.equal(contract.pickupFreight,0)
  assert.equal(records.invoices[0].amount,600)
  const invalid=createFixture()
  assert.throws(()=>invalid.create({leadId:'qa-lead',monthlyValue:500,pickupFreight:-1}))
  assert.equal(invalid.records.contracts.length,0)
  assert.equal(invalid.records.invoices.length,0)
})

test('return due date can be agreed explicitly without changing the rental term', () => {
  const {records,create}=createFixture()
  const contract=create({leadId:'qa-lead',monthlyValue:500,startDate:'2026-10-10',endDate:'2027-01-10',deliveryFreight:130,pickupFreight:130,pickupFreightDueDate:'2027-01-10'})
  assert.equal(contract.endDate,'2027-01-10')
  assert.equal(records.invoices.at(-1).dueDate,'2027-01-10')
  assert.equal(records.invoices.at(-1).amount,130)
  assert.equal(records.invoices.at(-1).billingDetails.rentalCents,0)
  assert.equal(sanitizeLeadDetails({pickupFreightDueDate:'2026-12-10'}).pickupFreightDueDate,'2026-12-10')
})

test('invalid or earlier pickup date fails before creating a contract or invoice', () => {
  for(const pickupFreightDueDate of ['2026-02-31','2026-09-10','not-a-date']){
    const f=createFixture()
    assert.throws(()=>f.create({leadId:'qa-lead',monthlyValue:500,startDate:'2026-10-10',endDate:'2027-01-10',pickupFreight:130,pickupFreightDueDate}),/data|vencimento/)
    assert.equal(f.records.contracts.length,0)
    assert.equal(f.records.invoices.length,0)
  }
})

test('calendar in the sheet matches the backend, including leap years and month-end', () => {
  for(const [start,months,end] of [['2027-01-31',1,'2027-02-28'],['2028-01-31',1,'2028-02-29'],['2026-10-10',3,'2027-01-10'],['2026-08-31',2,'2026-10-31']]){
    assert.equal(addCalendarMonths(start,months),end)
    assert.equal(addBillingMonths(start,months),end)
    assert.equal(billingMonthsForDates(start,end),months)
  }
  assert.equal(addCalendarMonths('2026-02-31',1),'')
  assert.equal(billingMonthsForDates('2027-01-31','2027-03-01'),2)
})

test('issued version-two signed schedules still keep their original freight agreement', () => {
  const old={...base,endDate:'2027-01-10',rentalMonths:3,status:'assinado',freightDetailsVersion:1,freightBillingVersion:2,deliveryFreight:130,pickupFreight:130}
  old.billingSchedule=contractBillingPlan(old)
  assert.deepEqual(old.billingSchedule.map(charge=>charge.amount),[630,630,500])
  const before=renderContractHtml(old,company)
  assert.match(before,/retirada uma única vez na segunda cobrança/)
  const f=createFixture();f.records.contracts.push(old)
  f.create({leadId:'qa-lead',monthlyValue:500,startDate:'2026-10-10',endDate:'2027-01-10',deliveryFreight:130,pickupFreight:130})
  assert.equal(renderContractHtml(old,company),before)
})

test('checklist prints return as one-time R$130 on December 10, separate from monthly rent', async () => {
  const source=fs.readFileSync(new URL('../src/documents.js',import.meta.url),'utf8')
  const functionSource=source.slice(source.indexOf('export async function createDeliveryChecklistPdf(')).replace('export async function','async function')
  const checklist=new Function('fullAddress','leadFreight','pickupFreightDate','formatCurrency','displayDate','createPdf',functionSource+';return createDeliveryChecklistPdf')(
    ()=> 'Endereço fictício',leadFreight,pickupFreightDate,value=>`R$ ${Number(value).toFixed(2).replace('.',',')}`,value=>value?value.split('-').reverse().join('/'):'Não informado',async value=>value.text)
  const text=await checklist({name:'Cliente QA',modality:'locacao',rentalMonths:3,deliveryDate:'2026-10-10',deliveryFreight:130,pickupFreight:130,quoteItems:[{product:'Cama QA',modality:'locacao',qty:1,unitPrice:500}]})
  assert.match(text,/retirada \(volta\): R\$ 130,00 - cobrança única separada, não mensal - vencimento: 10\/12\/2026/)
  assert.match(text,/Primeira cobrança: R\$ 630,00/)
  assert.match(text,/Próximas mensalidades: R\$ 500,00 cada \(sem frete de volta\)/)
  assert.doesNotMatch(text,/somente na segunda cobrança/)
})
