const cents = (value, label) => {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number) || number < 0 || number > 10_000_000) {
    throw new Error(`Informe um valor válido para o frete de ${label}.`)
  }
  return Math.round(number * 100)
}

/** Legacy lead.freight is the combined charge; never add it to the split amounts. */
export function leadFreight(lead = {}) {
  const pickupCents = cents(lead.pickupFreight, 'retirada')
  const deliveryCents = lead.deliveryFreight != null
    ? cents(lead.deliveryFreight, 'entrega')
    : Math.max(0, cents(lead.freight, 'entrega') - pickupCents)
  return { deliveryCents, pickupCents }
}

export function normalizeContractFreight(input = {}, lead = {}, type = 'locacao') {
  const saved = leadFreight(lead)
  const deliveryCents = input.deliveryFreight == null ? saved.deliveryCents : cents(input.deliveryFreight, 'entrega')
  // A sale has no scheduled return. Do not charge a rental-only pickup by accident.
  const pickupCents = type === 'locacao'
    ? input.pickupFreight == null ? saved.pickupCents : cents(input.pickupFreight, 'retirada')
    : 0
  return { deliveryCents, pickupCents }
}

export function contractFreight(contract = {}) {
  const deliveryCents = cents(contract.deliveryFreight ?? (contract.freightQuote?.deliveryCents || 0) / 100, 'entrega')
  const pickupCents = contract.type === 'locacao'
    ? cents(contract.pickupFreight ?? (contract.freightQuote?.pickupCents || 0) / 100, 'retirada')
    : 0
  return { deliveryCents, pickupCents }
}

export function addBillingMonths(date, months) {
  const source = String(date || '')
  const current = new Date(`${source}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || Number.isNaN(current.getTime()) || current.toISOString().slice(0, 10) !== source) throw new Error('Informe uma data de cobrança válida.')
  const day = current.getUTCDate()
  current.setUTCDate(1)
  current.setUTCMonth(current.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate()
  current.setUTCDate(Math.min(day, lastDay))
  return current.toISOString().slice(0, 10)
}

/** Only new contracts use this rule; issued legacy schedules are not rewritten. */
export function rentalBillingPeriods(contract) {
  if (contract.type !== 'locacao') return 1
  if (contract.rentalMonths != null) {
    if (!Number.isInteger(contract.rentalMonths) || contract.rentalMonths < 1 || contract.rentalMonths > 120) throw new Error('Informe de 1 a 120 meses de locação.')
    return contract.rentalMonths
  }
  const start = addBillingMonths(contract.startDate, 0), end = addBillingMonths(contract.endDate, 0)
  if (end < start) throw new Error('O término deve ser posterior ao início da locação.')
  const startDate = new Date(`${start}T12:00:00Z`), endDate = new Date(`${end}T12:00:00Z`)
  let periods = Math.max(1, (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + endDate.getUTCMonth() - startDate.getUTCMonth())
  if (addBillingMonths(start, periods) < end) periods += 1
  if (periods > 120) throw new Error('O período de locação excede 120 meses.')
  return periods
}

export function pickupFreightDate(contract) {
  // Never include return in the first payment. By default it falls on the last
  // rental due date; a one-month term gets a later, return-only payment.
  const date = addBillingMonths(contract.pickupFreightDueDate || addBillingMonths(contract.startDate, Math.max(1, rentalBillingPeriods(contract) - 1)), 0)
  if (date < addBillingMonths(contract.startDate, 0)) throw new Error('O vencimento do frete de retirada não pode ser anterior ao início da locação.')
  return date
}

export function contractBillingPlan(contract) {
  const freight = contractFreight(contract), periods = rentalBillingPeriods(contract)
  const monthlyCents = cents(contract.monthlyValue, 'valor do contrato')
  const purchaseCents = contract.type === 'locacao' ? cents(contract.oneTimePurchaseTotal, 'acessórios') : 0
  // Version 3 keeps return freight outside every rental installment. Preserve
  // version 2 and signed legacy schedules exactly as they were agreed.
  if (contract.freightBillingVersion === 3) {
    const schedule = Array.from({ length: periods }, (_, index) => ({
      installment: index + 1, dueDate: addBillingMonths(contract.startDate, index),
      amount: (monthlyCents + (index === 0 ? purchaseCents + freight.deliveryCents : 0)) / 100,
      rentalCents: contract.type === 'locacao' ? monthlyCents : 0,
      saleCents: contract.type === 'locacao' ? 0 : monthlyCents,
      purchaseCents: index === 0 ? purchaseCents : 0,
      deliveryCents: index === 0 ? freight.deliveryCents : 0,
      pickupCents: 0,
      kind: index === 0 ? 'contrato_e_frete' : 'mensalidade',
    }))
    if (freight.pickupCents > 0) schedule.push({
      installment: schedule.length + 1, dueDate: pickupFreightDate(contract),
      amount: freight.pickupCents / 100, rentalCents: 0, saleCents: 0,
      purchaseCents: 0, deliveryCents: 0, pickupCents: freight.pickupCents,
      kind: 'frete_retirada',
    })
    return schedule
  }
  return Array.from({ length: Math.max(periods, freight.pickupCents > 0 ? 2 : 1) }, (_, index) => {
    const rentalCents = contract.type === 'locacao' && index < periods ? monthlyCents : 0
    const saleCents = contract.type !== 'locacao' && index === 0 ? monthlyCents : 0
    const deliveryCents = index === 0 ? freight.deliveryCents : 0
    const pickupCents = index === 1 ? freight.pickupCents : 0
    const accessoriesCents = index === 0 ? purchaseCents : 0
    return {
      installment: index + 1, dueDate: addBillingMonths(contract.startDate, index),
      amount: (rentalCents + saleCents + accessoriesCents + deliveryCents + pickupCents) / 100,
      rentalCents, saleCents, purchaseCents: accessoriesCents, deliveryCents, pickupCents,
      kind: index === 0 ? 'contrato_e_frete' : pickupCents ? rentalCents ? 'mensalidade_e_retirada' : 'frete_retirada' : 'mensalidade',
    }
  })
}
