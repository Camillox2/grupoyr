import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInsights, dayKey } from '../src/insights.js'
import { buildLeadPerformance } from '../src/leadPerformance.js'
const dates = ['2026-10-10', '2026-10-11', '2026-10-12']
test('daily entries reconcile, duplicate IDs are not messages; archived leads remain and Ads missing is null, not zero', () => {
  const result = buildLeadPerformance({ leads: [{ id: 'a', createdAt: '2026-10-11T01:00:00Z', funnelArchive: {} }, { id: 'b', createdAt: '2026-10-11T15:00:00Z' }, { id: 'b', createdAt: '2026-10-11T15:00:00Z' }], signed: [], ads: { lastSyncAt: 'now', timeZone: 'America/Sao_Paulo', daily: [{ date: '2026-10-10', costMicros: 0, conversions: 0 }, { date: '2026-10-11', costMicros: 15000000, conversions: 3 }] }, dates, today: '2026-10-12', dayKey })
  assert.deepEqual(result.daily.map(row => row.leads), [1, 1, 0])
  assert.deepEqual(result.daily.map(row => row.adCostMicros), [0, 15000000, null])
  assert.equal(result.weekdays.find(row => row.weekday === 0).costPerAdConversionMicros, 5000000)
  assert.equal(result.weekdays.find(row => row.weekday === 1).days, 0)
  assert.deepEqual(result.bestDays, ['2026-10-10', '2026-10-11'])
})
test('weekdays use daily denominators, exclude partial today and refuse partial Ads efficiency comparisons', () => {
  const result = buildLeadPerformance({ leads: [{ id: 'a', createdAt: '2026-10-05T12:00:00Z' }, { id: 'b', createdAt: '2026-10-12T12:00:00Z' }], signed: [], dates: ['2026-10-05', '2026-10-12', '2026-10-19'], today: '2026-10-19', ads: { lastSyncAt: 'now', timeZone: 'America/Sao_Paulo', daily: [{ date: '2026-10-05', costMicros: 10000000, conversions: 2 }] }, dayKey })
  const monday = result.weekdays.find(row => row.weekday === 1)
  assert.equal(monday.days, 2); assert.equal(monday.averageLeads, 1); assert.equal(monday.adCostMicros, null)
  assert.equal(monday.coveredAdDays, 1); assert.equal(monday.costPerAdConversionMicros, null)
})
test('existing insights expose daily lead/Ads data without changing money, stock or lead sources', () => {
  const data = { leads: [{ id: 'a', createdAt: '2026-10-11T12:00:00Z', origin: 'WhatsApp Direto' }] }
  const before = structuredClone(data)
  const result = buildInsights({ get: key => data[key] || [], storageMode: 'neon' }, { days: 7, now: new Date('2026-10-11T15:00:00Z') })
  assert.equal(result.leadPerformance.daily.reduce((sum, row) => sum + row.leads, 0), result.metrics.newLeads)
  assert.equal(result.leadPerformance.daily.at(-1).adCostMicros, null)
  assert.deepEqual(data, before)
})
