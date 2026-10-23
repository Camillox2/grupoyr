const labels = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
export function buildLeadPerformance({ leads, signed, ads, dates, today, dayKey }) {
  const arrivals = new Map(), signatures = new Map(), adRows = new Map()
  // Count distinct CRM leads, not messages, and retain archived leads in history.
  const seen = new Set()
  for (const lead of leads) {
    if (seen.has(lead.id)) continue
    seen.add(lead.id)
    const day = dayKey(lead.createdAt)
    if (day) arrivals.set(day, (arrivals.get(day) || 0) + 1)
  }
  for (const contract of signed) { const day = dayKey(contract.signedAt); if (day) signatures.set(day, (signatures.get(day) || 0) + 1) }
  if (ads?.lastSyncAt && ads.timeZone === 'America/Sao_Paulo') for (const row of ads.daily || []) {
    if (Number.isSafeInteger(row.costMicros) && row.costMicros >= 0 && Number.isFinite(row.conversions) && row.conversions >= 0) adRows.set(row.date, row)
  }
  const daily = dates.map(date => ({ date, leads: arrivals.get(date) || 0, signedContracts: signatures.get(date) || 0,
    adCostMicros: adRows.get(date)?.costMicros ?? null, adConversions: adRows.get(date)?.conversions ?? null, partial: date === today }))
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(weekday => {
    const rows = daily.filter(row => !row.partial && new Date(row.date + 'T12:00:00Z').getUTCDay() === weekday)
    const covered = rows.filter(row => row.adCostMicros !== null)
    const complete = rows.length > 0 && covered.length === rows.length
    const leads = rows.reduce((sum, row) => sum + row.leads, 0)
    const cost = complete ? rows.reduce((sum, row) => sum + row.adCostMicros, 0) : null
    const conversions = complete ? rows.reduce((sum, row) => sum + row.adConversions, 0) : null
    return { weekday, name: labels[weekday], days: rows.length, leads, averageLeads: rows.length ? leads / rows.length : null,
      coveredAdDays: covered.length, adCostMicros: cost, adConversions: conversions,
      costPerAdConversionMicros: cost !== null && conversions > 0 ? cost / conversions : null }
  })
  const completeDays = daily.filter(row => !row.partial)
  const maximum = Math.max(0, ...completeDays.map(row => row.leads))
  const bestDays = maximum > 0 ? completeDays.filter(row => row.leads === maximum).map(row => row.date) : []
  return { daily, weekdays, bestDays, maximumLeads: maximum, entryDate: 'createdAt', timeZone: 'America/Sao_Paulo',
    note: 'Leads pela entrada no CRM; contratos pela assinatura. Gasto e conversões são os relatórios do Google Ads, não atribuição comprovada aos leads. Hoje é parcial e não entra na comparação de dias da semana. Gasto ausente não é zero.' }
}
