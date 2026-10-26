// Uso único (2026-10-26): cadastra "SUPORTE DE SORO" (R$ 50/mês) e inclui 1 unidade no CTR-2026-003.
// Rodar com o serviço parado. Idempotente.
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db } from '../src/db.js'
import { addContractItem } from '../src/contractAmendments.js'
await db.ready
const CODE = 'YR-ACE-SUPORTE-DE-SORO'
const contract = db.find('contracts', (c) => c.number === 'CTR-2026-003')
if (!contract) throw new Error('CTR-2026-003 não encontrado')
console.log('ANTES', JSON.stringify({ items: (contract.itemsSnapshot || []).map((i) => `${i.qty}x ${i.product} ${i.unitPrice}`), monthlyValue: contract.monthlyValue, schedule: contract.billingSchedule.map((b) => b.amount) }))
if ((contract.itemsSnapshot || []).some((i) => i.productCode === CODE)) { console.log('já incluído; nada a fazer'); process.exit(0) }
let eq = db.find('equipments', (e) => e.productCode === CODE && !e.archived && e.status === 'disponivel' && !e.reservationContractId)
if (!eq) {
  const seq = db.get('equipments').reduce((h, i) => Math.max(h, Number(String(i.serialNumber || '').match(/(\d+)$/)?.[1] || 0)), 0) + 1
  eq = { id: `eq_${randomUUID()}`, serialNumber: `YR-PAT-${String(seq).padStart(4, '0')}`, productCode: CODE, name: 'SUPORTE DE SORO', category: 'Acessórios', status: 'disponivel', currentLeadId: null, currentClientName: null, monthlyPrice: 50, salePrice: 0, location: 'Galpão Principal YR', lastSanitized: new Date().toISOString(), sanitizationCert: `LAUDO-ANVISA-${Math.floor(100 + Math.random() * 900)}` }
  db.insert('equipments', eq)
  console.log('EQUIP criado', eq.id, eq.serialNumber)
}
const admin = db.find('users', (u) => u.id === 'usr_admin')
const updated = addContractItem(contract.id, { productCode: CODE, qty: 1, unitPrice: 50 }, { id: 'script_suporte_soro', name: `Ajuste solicitado por Vitor (via ${admin?.name || 'admin'})` })
await db.flush()
console.log('DEPOIS', JSON.stringify({ items: updated.itemsSnapshot.map((i) => `${i.qty}x ${i.product} ${i.unitPrice}`), monthlyValue: updated.monthlyValue, schedule: updated.billingSchedule.map((b) => b.amount), invoices: updated.itemAmendments.at(-1).invoices, hashKept: updated.documentHash === contract.documentHash }))
process.exit(0)
