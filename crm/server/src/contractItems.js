const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export function resolveContractItems(items, equipments) {
  if (!Array.isArray(items) || !items.length || items.length > 12) throw new Error('Adicione os produtos da ficha antes de gerar o contrato.')
  const used = new Set()
  const rows = items.map(item => {
    if (!['locacao', 'compra'].includes(item.modality) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) throw new Error('Confira a quantidade, modalidade e preço de todos os produtos.')
    let candidates = equipments.filter(eq => (item.productCode && eq.productCode === item.productCode) || normalize(eq.name) === normalize(item.product))
    // One legacy alias only; never silently choose between distinct models.
    if (!candidates.length && item.productCode === 'YR-CAM-ELE') {
      const aliases = equipments.filter(eq => /cama.*eletri/i.test(String(eq.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      if (new Set(aliases.map(eq => eq.productCode || eq.name)).size === 1) candidates = aliases
    }
    const available = candidates.filter(eq => eq.status === 'disponivel' && !eq.reservationContractId && !used.has(eq.id))
    if (available.length < item.qty) throw new Error(`Estoque insuficiente para ${item.product}. Disponível: ${available.length}; solicitado: ${item.qty}.`)
    const selected = available.slice(0, item.qty)
    selected.forEach(eq => used.add(eq.id))
    return { product: selected[0].name, productCode: selected[0].productCode || '', modality: item.modality, qty: item.qty, unitPrice: Math.round(item.unitPrice * 100) / 100, equipmentIds: selected.map(eq => eq.id), patrimonies: selected.map(eq => eq.serialNumber) }
  })
  const total = modality => rows.filter(row => row.modality === modality).reduce((sum, row) => sum + row.qty * Math.round(row.unitPrice * 100), 0) / 100
  return { rows, equipmentIds: rows.flatMap(row => row.equipmentIds), rentalMonthly: total('locacao'), purchaseTotal: total('compra'), names: rows.map(row => `${row.qty}x ${row.product} (${row.productCode}; Patr. ${row.patrimonies.join(', ')})`).join('; ') }
}
