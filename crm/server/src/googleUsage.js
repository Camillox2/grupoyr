import { createHash } from 'node:crypto'

export const GOOGLE_DAY_ZONE = 'America/Los_Angeles'
export const GOOGLE_DOCS = 'https://ai.google.dev/gemini-api/docs/rate-limits'
export const AI_STUDIO_LIMITS = 'https://aistudio.google.com/rate-limit?timeRange=last-28-days'
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 24)
export const googleScope = key => key ? hash(key) : 'unconfigured'
export function googleDay(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: GOOGLE_DAY_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]))
  return `${p.year}-${p.month}-${p.day}`
}
export function nextGoogleReset(date = new Date()) {
  // Locate the next civil-date boundary rather than assuming a fixed UTC offset (DST).
  const day = googleDay(date)
  let lo = date.getTime(), hi = lo + 27 * 3600000
  while (hi - lo > 1) { const mid = Math.floor((hi + lo) / 2); if (googleDay(new Date(mid)) === day) lo = mid; else hi = mid }
  return new Date(hi).toISOString()
}
export function tokenUsage(meta = {}) {
  return { inputTokens: number(meta.promptTokenCount), outputTokens: number(meta.candidatesTokenCount),
    thinkingTokens: number(meta.thoughtsTokenCount), cachedTokens: number(meta.cachedContentTokenCount), totalTokens: number(meta.totalTokenCount) }
}
export function quotaObservations(error = {}) {
  const result = []
  for (const detail of error.details || []) for (const v of detail.violations || []) {
    const metric = String(v.quotaMetric || ''), id = String(v.quotaId || '')
    const dimension = /input.*token|token.*input/i.test(metric + id) ? 'tokens' : /request|generate.*count/i.test(metric + id) ? 'requests' : ''
    const period = /per.*day/i.test(metric + id) ? 'day' : /per.*minute/i.test(metric + id) ? 'minute' : ''
    const limit = v.quotaValue === undefined || v.quotaValue === null || v.quotaValue === '' ? null : Number(v.quotaValue)
    if (dimension && period && limit !== null && Number.isFinite(limit) && limit >= 0) result.push({ kind: (dimension === 'tokens' ? 'tp' : 'rp') + (period === 'day' ? 'd' : 'm'), limit, metric: metric.replace(/[^a-zA-Z0-9_./-]/g, '').slice(0,160), quotaId: id.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0,160) })
  }
  return result
}
function upsert(database, collection, item) {
  return database.get(collection).some(r => r.id === item.id) ? database.update(collection, item.id, item) : database.insert(collection, item)
}
export function recordGoogleAttempt(database, key, { model, source = 'crm', status = 0, usage, error, latencyMs = 0, at = new Date(), code = '' }) {
  const scope = googleScope(key), day = googleDay(at), time = at.toISOString()
  if (!database.get('googleControlMeta').some(r => r.id === scope)) database.insert('googleControlMeta', { id: scope, startedAt: time })
  const id = hash([scope, day, model, source].join('|'))
  const old = database.get('googleModelUsage').find(r => r.id === id)
  const row = old ? structuredClone(old) : { id, scope, day, model, source, attempts: 0, accepted: 0, errors: 0, quotaErrors: 0, tokenReports: 0, latencyMs: 0, tokenSums: {}, tokenSamples: {}, firstAt: time }
  row.attempts++; row.accepted += status >= 200 && status < 300 ? 1 : 0
  row.errors += status >= 200 && status < 300 ? 0 : 1
  row.quotaErrors += status === 429 ? 1 : 0
  row.latencyMs += Math.max(0, latencyMs); row.lastAt = time; row.lastCode = code || String(status || 'network')
  const tokens = tokenUsage(usage)
  if (Object.values(tokens).some(v => v !== null)) row.tokenReports++
  for (const [k,v] of Object.entries(tokens)) if (v !== null) { row.tokenSums[k] = (row.tokenSums[k] || 0) + v; row.tokenSamples[k] = (row.tokenSamples[k] || 0) + 1 }
  upsert(database, 'googleModelUsage', row)
  for (const quota of quotaObservations(error)) {
    // Keep independent limits; do not sum aliases or contradictory buckets.
    upsert(database, 'googleQuotaObservations', { id: hash([scope, model, quota.kind, quota.quotaId].join('|')), scope, model, ...quota, observedAt: time, source: 'google_error' })
  }
  return row
}
export function trackedGoogleFetch({ database, key, source, fetcher = fetch, now = () => new Date() }) {
  return async (url, options) => {
    const match = String(url).match(/\/models\/([^/:?]+):generateContent(?:\?|$)/)
    if (!match || !String(url).startsWith('https://generativelanguage.googleapis.com/')) return fetcher(url, options)
    const model = decodeURIComponent(match[1]), at = now(), start = Date.now()
    let response, data
    try {
      response = await fetcher(url, options)
      try { data = await response.clone().json() } catch { /* Token metadata can be unavailable. */ }
    } catch (error) {
      recordGoogleAttempt(database, key, { model, source, at, latencyMs: Date.now() - start, code: error.name === 'TimeoutError' ? 'timeout' : 'network' })
      throw error
    }
    recordGoogleAttempt(database, key, { model, source, at, latencyMs: Date.now() - start, status: response.status, usage: data?.usageMetadata, error: data?.error })
    return response
  }
}
export function sumGoogleUsage(rows) {
  const out = { attempts: 0, accepted: 0, errors: 0, quotaErrors: 0, tokenReports: 0, latencyMs: 0, tokens: {}, tokenSamples: {} }
  for (const row of rows) {
    for (const k of ['attempts','accepted','errors','quotaErrors','tokenReports','latencyMs']) out[k] += row[k] || 0
    for (const k of ['inputTokens','outputTokens','thinkingTokens','cachedTokens','totalTokens']) { if ((row.tokenSamples?.[k] || 0) > 0) { out.tokens[k] = (out.tokens[k] || 0) + row.tokenSums[k]; out.tokenSamples[k] = (out.tokenSamples[k] || 0) + row.tokenSamples[k] } }
  }
  for (const k of ['inputTokens','outputTokens','thinkingTokens','cachedTokens','totalTokens']) if (!(k in out.tokens)) out.tokens[k] = null
  return out
}
export function googleUsageReport(database, key, { day = googleDay(), includeTests = true, now = new Date() } = {}) {
  const scope = googleScope(key), catalog = database.get('googleModelCatalog').find(r => r.id === scope)
  const all = database.get('googleModelUsage').filter(r => r.scope === scope && r.day === day)
  const selected = all.filter(r => includeTests || !['benchmark','laboratory','diagnostic'].includes(r.source))
  const models = new Set([...(catalog?.models || []).map(m => m.name), ...all.map(r => r.model)])
  const jobs = database.get('googleModelBenchmarks').filter(r => r.scope === scope).sort((a,b) => b.startedAt.localeCompare(a.startedAt))
  const rows = [...models].map(model => {
    const definitions = catalog?.models.find(m => m.name === model) || { name: model, compatible: true }
    const observations = database.get('googleQuotaObservations').filter(r => r.scope === scope && r.model === model)
    const manual = database.get('googleModelLimits').find(r => r.scope === scope && r.model === model)
    const verified = database.get('googleQuotaSnapshots').find(r => r.scope === scope && r.model === model)
    return { ...definitions, usage: sumGoogleUsage(selected.filter(r => r.model === model)), limits: manual ? { ...manual.limits, source: 'manual', updatedAt: manual.updatedAt } : verified ? { ...verified.limits, source: 'ai_studio_snapshot', updatedAt: verified.observedAt, sourceUrl: verified.sourceUrl } : null, observations,
      benchmark: jobs[0]?.results?.find(r => r.model === model) || null }
  })
  return { day, timeZone: GOOGLE_DAY_ZONE, resetAt: nextGoogleReset(now), refreshedAt: now.toISOString(), startedAt: database.get('googleControlMeta').find(r => r.id === scope)?.startedAt || null,
    configured: Boolean(key), storage: database.storageMode, includeTests, totals: sumGoogleUsage(selected), testTotals: sumGoogleUsage(all.filter(r => ['benchmark','laboratory','diagnostic'].includes(r.source))),
    rows, catalogAt: catalog?.fetchedAt || null, benchmark: jobs[0] || null,
    projectUsage: { available: false, reason: 'A chave Gemini não fornece o consumo global do projeto. Este painel mede somente CRM, site, laboratório e testes instrumentados a partir da data indicada.' },
    quotaNote: 'Limites por projeto/modelo. Não some cotas de aliases. Falhas 429 não são contadas como respostas aceitas. Metadados ausentes não são zero. Limites observados em erro podem estar desatualizados.',
    links: { limits: AI_STUDIO_LIMITS, documentation: GOOGLE_DOCS } }
}
export async function persistGoogleControl(database, collection, id) {
  await database.flush?.()
  if (database.pool) {
    const local = database.get(collection).find(r => r.id === id)
    const result = await database.pool.query('SELECT data FROM crm_records WHERE collection = $1 AND id = $2', [collection, id])
    if (!local || JSON.stringify(result.rows[0]?.data) === undefined || result.rows[0].data.updatedAt !== local.updatedAt) throw new Error('google_control_not_persisted')
  }
}
