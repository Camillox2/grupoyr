import { db } from './db.js'

// Inclusão/remoção de itens em contratos existentes (aditivo).
// Nunca altera itens originais nem o hash do documento assinado. Se o item tiver preço,
// soma na mensalidade/compra e nas cobranças ainda pendentes (faturas pagas não mudam).
const EDITABLE = ['rascunho', 'pendente_assinatura', 'assinado']
const isFree = (eq) => eq && !eq.archived && eq.status === 'disponivel' && !eq.reservationContractId

export function contractItemCatalog() {
  const groups = new Map()
  for (const eq of db.get('equipments')) {
    if (eq.archived) continue
    const key = eq.productCode || eq.name
    const g = groups.get(key) || { productCode: eq.productCode || '', name: eq.name, category: eq.category || '', available: 0, total: 0, monthlyPrice: Number(eq.monthlyPrice) || 0, salePrice: Number(eq.salePrice) || 0 }
    g.total += 1
    if (isFree(eq)) g.available += 1
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}


const round2 = (n) => Math.round(n * 100) / 100
function priceDelta(contract, row, sign) {
  const cents = Math.round((row.unitPrice || 0) * 100) * row.qty * sign
  if (!cents) return { patch: {}, invoices: [] }
  const rental = row.modality === 'locacao'
  const schedule = (contract.billingSchedule || []).map((charge) => {
    const hit = rental ? (charge.rentalCents || 0) > 0 : charge.installment === 1
    if (!hit) return charge
    const key = rental ? 'rentalCents' : 'purchaseCents'
    return { ...charge, [key]: (charge[key] || 0) + cents, amount: round2(charge.amount + cents / 100) }
  })
  const invoices = []
  for (const charge of schedule) {
    const inv = db.find('invoices', (i) => i.id === `inv_${contract.id}_${charge.installment}`)
    const before = (contract.billingSchedule || []).find((c) => c.installment === charge.installment)
    if (inv && before && before.amount !== charge.amount) {
      if (inv.status === 'paga') invoices.push({ id: inv.id, skipped: 'paga' })
      else { db.update('invoices', inv.id, { amount: charge.amount, ...(inv.billingDetails ? { billingDetails: { ...charge } } : {}) }); invoices.push({ id: inv.id, from: inv.amount, to: charge.amount }) }
    }
  }
  const patch = { billingSchedule: schedule }
  if (rental) patch.monthlyValue = round2((contract.monthlyValue || 0) + cents / 100)
  else patch.oneTimePurchaseTotal = round2((contract.oneTimePurchaseTotal || 0) + cents / 100)
  return { patch, invoices }
}

const itemLabel = (row) => `${row.qty}x ${row.product} (${row.productCode || 's/ código'}; Patr. ${row.patrimonies.join(', ')})`

export function addContractItem(contractId, { productCode, qty = 1, modality, unitPrice }, user) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if (!contract) throw Object.assign(new Error('Contrato não encontrado.'), { status: 404 })
  if (!EDITABLE.includes(contract.status)) throw new Error('Só é possível editar itens de contratos ativos ou pendentes.')
  qty = Number(qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('Quantidade inválida (1 a 20).')
  const code = String(productCode || '').trim()
  if (!code) throw new Error('Escolha um produto do catálogo.')
  const mode = modality === 'compra' || (!modality && contract.type === 'venda') ? 'compra' : 'locacao'
  const free = db.get('equipments').filter((eq) => (eq.productCode || eq.name) === code && isFree(eq))
  if (free.length < qty) throw new Error(`Estoque insuficiente. Disponível: ${free.length}; solicitado: ${qty}.`)
  const selected = free.slice(0, qty)
  const catalogPrice = mode === 'compra' ? selected[0].salePrice : selected[0].monthlyPrice
  const price = unitPrice === '' || unitPrice == null ? (Number(catalogPrice) > 0 ? Number(catalogPrice) : null) : Number(unitPrice)
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 100000)) throw new Error('Preço inválido.')
  const now = new Date().toISOString()
  const signed = contract.status === 'assinado'
  const row = {
    qty, product: selected[0].name, productCode: selected[0].productCode || '', modality: mode,
    unitPrice: price == null ? null : round2(price), equipmentIds: selected.map((e) => e.id), patrimonies: selected.map((e) => e.serialNumber),
    addedAt: now, addedBy: user?.id || null, addedByName: user?.name || null, addedAfterSignature: signed,
  }
  if (signed) {
    for (const eq of selected) {
      db.update('equipments', eq.id, { status: mode === 'compra' ? 'vendido' : 'alugado', currentLeadId: contract.leadId || null, currentClientName: contract.clientName || null })
    }
  }
  row.namesPart = `${itemLabel(row)} — incluído em ${now.slice(0, 10).split('-').reverse().join('/')}`
  const amendment = { at: now, by: user?.id || null, byName: user?.name || null, action: 'add', item: itemLabel(row), equipmentIds: row.equipmentIds }
  const { patch, invoices } = priceDelta(contract, row, 1)
  amendment.invoices = invoices
  amendment.priceChange = patch.monthlyValue != null ? { monthlyValue: [contract.monthlyValue, patch.monthlyValue] } : patch.oneTimePurchaseTotal != null ? { oneTimePurchaseTotal: [contract.oneTimePurchaseTotal, patch.oneTimePurchaseTotal] } : null
  return db.update('contracts', contract.id, {
    ...patch,
    itemsSnapshot: [...(contract.itemsSnapshot || []), row],
    equipmentIds: [...(contract.equipmentIds || []), ...row.equipmentIds],
    equipmentNames: [contract.equipmentNames, row.namesPart].filter(Boolean).join('; '),
    itemAmendments: [...(contract.itemAmendments || []), amendment],
    updatedAt: now,
  })
}

export function removeContractItem(contractId, index, user) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if (!contract) throw Object.assign(new Error('Contrato não encontrado.'), { status: 404 })
  if (!EDITABLE.includes(contract.status)) throw new Error('Só é possível editar itens de contratos ativos ou pendentes.')
  const rows = contract.itemsSnapshot || []
  const row = rows[Number(index)]
  if (!row) throw Object.assign(new Error('Item não encontrado no contrato.'), { status: 404 })
  if (!row.addedAt) throw new Error('Itens originais do contrato não podem ser removidos por aqui. Só itens incluídos pela edição.')
  for (const id of row.equipmentIds || []) {
    const eq = db.find('equipments', (e) => e.id === id)
    if (eq && (eq.currentLeadId === (contract.leadId || null) || eq.status === 'disponivel')) {
      db.update('equipments', id, { status: 'disponivel', currentLeadId: null, currentClientName: null })
    }
  }
  const now = new Date().toISOString()
  const label = itemLabel(row)
  const amendment = { at: now, by: user?.id || null, byName: user?.name || null, action: 'remove', item: label, equipmentIds: row.equipmentIds }
  const ids = new Set(row.equipmentIds || [])
  const { patch, invoices } = priceDelta(contract, row, -1)
  amendment.invoices = invoices
  return db.update('contracts', contract.id, {
    ...patch,
    itemsSnapshot: rows.filter((_, i) => i !== Number(index)),
    equipmentIds: (contract.equipmentIds || []).filter((id) => !ids.has(id)),
    equipmentNames: row.namesPart ? String(contract.equipmentNames || '').replace(`; ${row.namesPart}`, '').replace(row.namesPart, '') : contract.equipmentNames,
    itemAmendments: [...(contract.itemAmendments || []), amendment],
    updatedAt: now,
  })
}

// Arquivar só esconde o contrato da lista principal. Não toca em cobranças,
// equipamentos, status nem itens; nada é apagado.
export function setContractArchived(contractId, archived, user) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if (!contract) throw Object.assign(new Error('Contrato não encontrado.'), { status: 404 })
  const now = new Date().toISOString()
  if (Boolean(contract.archived) === Boolean(archived)) return contract
  const log = { at: now, by: user?.id || null, byName: user?.name || null, action: archived ? 'archive' : 'unarchive' }
  return db.update('contracts', contract.id, archived
    ? { archived: true, archivedAt: now, archivedBy: user?.id || null, archivedByName: user?.name || null, archiveLog: [...(contract.archiveLog || []), log] }
    : { archived: false, unarchivedAt: now, unarchivedBy: user?.id || null, archiveLog: [...(contract.archiveLog || []), log] })
}
