type FreightSource = {
  deliveryFreight?: number
  pickupFreight?: number
  freight?: number
  freightQuote?: { deliveryCents: number; pickupCents: number }
}

const money = (value: number | undefined) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100)

export function addCalendarMonths(source: string, months: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || !Number.isInteger(months) || months < 0 || months > 120) return ''
  const date = new Date(`${source}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== source) return ''
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date.toISOString().slice(0, 10)
}

export function freightAmounts(source: FreightSource) {
  const pickup = money(source.pickupFreight ?? (source.freightQuote ? source.freightQuote.pickupCents / 100 : 0))
  const delivery = money(source.deliveryFreight ?? (source.freightQuote
    ? source.freightQuote.deliveryCents / 100
    : Math.max(0, money(source.freight) - pickup)))
  return { delivery, pickup }
}

export function billingMonthsForDates(start: string, end: string) {
  if (!addCalendarMonths(start, 0) || !addCalendarMonths(end, 0) || end < start) return 0
  const first = new Date(`${start}T12:00:00Z`), last = new Date(`${end}T12:00:00Z`)
  let months = Math.max(1, (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth())
  if (addCalendarMonths(start, months) < end) months += 1
  return months
}
