import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { buildLeadPerformance } from './leadPerformance.js'

export const YR_ADS_ACCOUNT = '7071472143'
const DEFAULT_ADS_CRM_URL = 'https://crm.grupoyrhospitalar.com.br'
const ADS_CRM_ORIGINS = new Set([DEFAULT_ADS_CRM_URL, 'https://crm2-grupoyr.dcfoundrydigital.com', 'https://crm-grupoyr.dcfoundrydigital.com'])
const COLLECTION = 'googleAdsIntegration'
const RECORD = 'grupo-yr'
const DAY_MS = 86400000
const datePattern = /^\d{4}-\d{2}-\d{2}$/
export function dayKey(value) {
  if (!value) return null
  if (datePattern.test(value)) return isDay(value) ? value : null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function isDay(value) {
  return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value
}
const shift = (day,n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0,10)
export function reportRange(days = 30, now = new Date()) {
  if (![7,30,90].includes(Number(days))) throw new Error('Selecione 7, 30 ou 90 dias.')
  const end = dayKey(now.toISOString()), start = shift(end,1 - Number(days))
  return { start, end, days: Number(days), previousStart: shift(start,-Number(days)), previousEnd: shift(start,-1), timeZone: 'America/Sao_Paulo' }
}
const within = (day, range) => Boolean(day && day >= range.start && day <= range.end)
const cents = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) : null
const sum = (items, selector) => items.reduce((total,item) => total + (selector(item) ?? 0),0)
const percent = (a,b) => b ? Math.round(a / b * 1000) / 10 : null
const hash = token => createHash('sha256').update(token).digest('hex')
const emptyMetrics = () => ({ costMicros: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 })
const plus = (a,b) => Object.fromEntries(Object.keys(emptyMetrics()).map(k => [k,a[k] + b[k]]))
function checkedMetrics(row) {
  const out = {}
  for (const field of Object.keys(emptyMetrics())) {
    const n = row[field]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e14 || (['costMicros','clicks','impressions'].includes(field) && !Number.isSafeInteger(n))) throw new Error('Métrica inválida no relatório.')
    out[field] = n
  }
  return out
}
export function normalizeAdsPayload(body, now = new Date()) {
  if (!body || body.accountId !== YR_ADS_ACCOUNT) throw new Error('Conta diferente do Grupo YR.')
  if (body.currency !== 'BRL' || body.timeZone !== 'America/Sao_Paulo') throw new Error('O relatório precisa usar BRL e America/Sao_Paulo.')
  if (!isDay(body.start) || !isDay(body.end) || body.start > body.end || (Date.parse(body.end)-Date.parse(body.start))/DAY_MS > 185 || body.end > dayKey(now.toISOString())) throw new Error('Período inválido no relatório.')
  const generated = Date.parse(body.generatedAt)
  if (!Number.isFinite(generated) || Math.abs(now.getTime()-generated) > 86400000) throw new Error('Relatório expirado. Execute novamente no Google Ads.')
  if (!Array.isArray(body.daily) || !Array.isArray(body.campaignDaily) || !Array.isArray(body.campaigns) || body.daily.length > 186 || body.campaignDaily.length > 25000 || body.campaigns.length > 1000) throw new Error('Tamanho ou formato do relatório inválido.')
  const seen = new Set(), range = {start:body.start,end:body.end}
  const daily = body.daily.map(row => {
    if (!isDay(row.date) || !within(row.date,range) || seen.has(row.date)) throw new Error('Data repetida ou fora do período.')
    seen.add(row.date)
    return { date: row.date, ...checkedMetrics(row) }
  })
  // A successful complete query omits dates with zero activity in Google Ads.
  for (let day = body.start; day <= body.end; day = shift(day,1)) if (!seen.has(day)) daily.push({ date: day, ...emptyMetrics() })
  const ids = new Set()
  const campaigns = body.campaigns.map(row => {
    if (!/^\d{1,20}$/.test(row.id) || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 300 || !['ENABLED','PAUSED','REMOVED','UNKNOWN','UNSPECIFIED'].includes(row.status)) throw new Error('Campanha inválida.')
    ids.add(row.id)
    return { id: row.id, name: row.name.trim(), status: row.status }
  })
  seen.clear()
  const campaignDaily = body.campaignDaily.map(row => {
    const key = row.date + ':' + row.campaignId
    if (!ids.has(row.campaignId) || !isDay(row.date) || !within(row.date,range) || seen.has(key)) throw new Error('Linha de campanha inválida ou duplicada.')
    seen.add(key)
    return {date:row.date,campaignId:row.campaignId,...checkedMetrics(row)}
  })
  return { accountId: YR_ADS_ACCOUNT, currency: 'BRL', timeZone: body.timeZone, start:body.start,end:body.end,generatedAt:new Date(generated).toISOString(),daily,campaignDaily,campaigns }
}
export function adsReport(record, range, now = new Date()) {
  const connected = Boolean(record?.lastSyncAt)
  const covered = connected && Array.from({length:range.days},(_,n)=>shift(range.start,n)).every(day=>record.daily.some(row=>row.date===day))
  const rows = record?.daily?.filter(row=>within(row.date,range)) || []
  const totals = covered ? rows.reduce(plus,emptyMetrics()) : null
  const campaigns = (record?.campaigns || []).map(campaign => {
    const metrics = covered ? (record.campaignDaily || []).filter(row=>row.campaignId===campaign.id && within(row.date,range)).reduce(plus,emptyMetrics()) : null
    return {...campaign,metrics}
  }).sort((a,b)=>(b.metrics?.costMicros || 0)-(a.metrics?.costMicros || 0))
  return { accountId: YR_ADS_ACCOUNT, connectionConfigured: Boolean(record?.tokenHash), connected, complete: Boolean(covered),
    lastSyncAt:record?.lastSyncAt || null, generatedAt:record?.generatedAt || null,
    stale: connected && now.getTime()-Date.parse(record.lastSyncAt)>26*3600000,
    currency:'BRL',timeZone:'America/Sao_Paulo',totals,
    cpc: totals?.clicks ? totals.costMicros/1e6/totals.clicks : null,
    cpa: totals?.conversions ? totals.costMicros/1e6/totals.conversions : null,
    ctr: totals ? percent(totals.clicks,totals.impressions) : null,
    campaigns, daily:rows, source:'Google Ads Scripts / consultas GAQL (somente relatórios)',
    attribution:'Conversões do Google Ads não equivalem necessariamente a contratos ou pagamentos. A origem cadastrada no CRM não comprova atribuição; ROAS e CAC não são calculados.' }
}
export function buildInsights(database, {days=30,now=new Date()} = {}) {
  const range = reportRange(days,now), today=range.end
  const allLeads=database.get('leads'), leads=allLeads.filter(l=>!l.funnelArchive)
  const equipments=database.get('equipments'), contracts=database.get('contracts'), invoices=database.get('invoices')
  const expenses=database.get('contractExpenses')
  const received=invoices.filter(i=>i.status==='paga' && cents(i.amount)!==null && within(dayKey(i.paidAt),range))
  const costs=expenses.filter(e=>cents(e.amount)!==null && within(dayKey(e.date),range))
  const overdue=invoices.filter(i=>['pendente','atrasada'].includes(i.status) && dayKey(i.dueDate) && dayKey(i.dueDate)<today)
  const currentRentals=contracts.filter(c=>c.type==='locacao' && c.status==='assinado' && dayKey(c.startDate)<=today && dayKey(c.endDate)>=today && dayKey(c.startDate))
  const ending=currentRentals.filter(c=>dayKey(c.endDate)<=shift(today,7))
  const cohort=allLeads.filter(l=>within(dayKey(l.createdAt),range))
  const signedIds=new Set(contracts.filter(c=>['assinado','encerrado'].includes(c.status) && c.signedAt).map(c=>c.leadId))
  const signed=contracts.filter(c=>['assinado','encerrado'].includes(c.status) && within(dayKey(c.signedAt),range))
  const open=leads.filter(l=>l.stage!=='finalizado' && l.conversationStatus!=='closed')
  const stale=open.filter(l=>{const when=Date.parse(l.lastInboundAt || l.lastInteraction || l.createdAt);return Number.isFinite(when) && now.getTime()-when>=48*3600000})
  const pending=contracts.filter(c=>c.status==='pendente_assinatura')
  const fleet=equipments.filter(e=>e.status!=='vendido')
  const rented=fleet.filter(e=>e.status==='alugado').length
  const free=fleet.filter(e=>e.status==='disponivel').length
  const sources=new Map()
  cohort.forEach(l=>{const origin=String(l.origin || 'Não informado').slice(0,100);sources.set(origin,(sources.get(origin)||0)+1)})
  const daily=Array.from({length:range.days},(_,n)=>{const date=shift(range.start,n);return {date,receivedCents:sum(received.filter(i=>dayKey(i.paidAt)===date),i=>cents(i.amount)),costCents:sum(costs.filter(e=>dayKey(e.date)===date),e=>cents(e.amount))}})
  const leadPerformance = buildLeadPerformance({ leads: cohort, signed, ads: database.get(COLLECTION).find(r => r.id === RECORD), dates: daily.map(row => row.date), today, dayKey })
  const paidCents=sum(received,i=>cents(i.amount)),costCents=sum(costs,e=>cents(e.amount))
  const alerts=[]
  if (stale.length) alerts.push({id:'followup',tone:'warning',title:stale.length+' atendimentos sem interação há 48h',text:'Revise as conversas abertas. O alerta considera a última interação registrada, não o tempo de resposta do vendedor.',target:'kanban'})
  if (overdue.length) alerts.push({id:'overdue',tone:'warning',title:overdue.length+' cobranças vencidas',text:'Há R$ '+(sum(overdue,i=>cents(i.amount))/100).toLocaleString('pt-BR',{minimumFractionDigits:2})+' em aberto com vencimento anterior a hoje.',target:'finance'})
  if (pending.length) alerts.push({id:'signatures',tone:'info',title:pending.length+' contratos aguardando assinatura',text:'Confira dados, envio e assinatura com o cliente antes de organizar a entrega.',target:'contracts'})
  if (ending.length) alerts.push({id:'renewal',tone:'info',title:ending.length+' locações terminam nos próximos 7 dias',text:'Confirme devolução ou eventual renovação com antecedência, sem pressionar o cliente.',target:'contracts'})
  if (fleet.length && !free) alerts.push({id:'stock',tone:'warning',title:'Nenhum equipamento disponível',text:'Confira reservas, higienização e manutenção antes de prometer entrega.',target:'equipments'})
  const undated=invoices.filter(i=>i.status==='paga' && !dayKey(i.paidAt)).length
  if (undated) alerts.push({id:'dates',tone:'warning',title:undated+' pagamentos sem data de baixa',text:'Esses pagamentos não entram no gráfico por período. Complete as datas para melhorar a análise.',target:'finance'})
  return {asOf:now.toISOString(),range,
    metrics:{newLeads:cohort.length,signedContracts:signed.length,receivedCents:paidCents,registeredCostCents:costCents,registeredBalanceCents:paidCents-costCents,
      overdueCents:sum(overdue,i=>cents(i.amount)),overdueCount:overdue.length,activeRentals:currentRentals.length,
      monthlyRentalBaseCents:sum(currentRentals,c=>cents(c.monthlyValue)),fleet:fleet.length,rented,available:free,occupancy:percent(rented,fleet.length),
      cohortSignedPercent:percent(cohort.filter(l=>signedIds.has(l.id)).length,cohort.length),pendingSignatures:pending.length,unresponsive:stale.length},
    alerts,sources:[...sources].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),daily,leadPerformance,
    ads:adsReport(database.get(COLLECTION).find(r=>r.id===RECORD),range,now),
    methodology:{financial:'Recebimentos pela data de baixa; custos pela data registrada. O saldo parcial não é lucro e não inclui despesas não cadastradas, impostos ou Ads.',
      operations:'Leads e assinaturas usam o período selecionado. Estoque, cobranças vencidas, assinaturas pendentes e locações são a situação atual.',
      conversion:'Percentual de leads criados no período com ao menos um contrato assinado, inclusive depois da criação. Não mede conversão por etapa nem atribuição de anúncios.',
      database:database.storageMode || 'local',paidWithoutDate:undated,source:'Registros reais do CRM: leads, contracts, invoices, contractExpenses e equipments.'}}
}
// Persist first, then publish in memory. A failed Neon write must never look successful.
async function saveRecord(database, record) {
  await database.ready
  if (database.pool) {
    await database.pool.query('INSERT INTO crm_records (collection,id,data,updated_at) VALUES ($1,$2,$3::jsonb,now()) ON CONFLICT (collection,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',[COLLECTION,RECORD,JSON.stringify(record)])
    database.data[COLLECTION]=[record]
  } else {
    const old=database.data[COLLECTION]
    database.data[COLLECTION]=[record]
    if (database.save()===false) {database.data[COLLECTION]=old;throw new Error('Falha de gravação')}
  }
}
export function googleAdsScript(token, endpoint) {
  // No ads, budgets, bids, conversions, billing or user mutations.
  return [
    '// Grupo YR: apenas leitura de relatórios. Não compartilhe este código: contém uma chave de envio restrita.',
    'var CRM_ENDPOINT = '+JSON.stringify(endpoint)+';',
    'var CRM_KEY = '+JSON.stringify(token)+';',
    'function main() {',
    '  var account = AdsApp.currentAccount();',
    '  if (account.getCustomerId().replace(/-/g, "") !== "'+YR_ADS_ACCOUNT+'") throw new Error("Conta incorreta.");',
    '  var zone = account.getTimeZone();',
    '  var end = Utilities.formatDate(new Date(), zone, "yyyy-MM-dd");',
    '  var start = new Date(end + "T12:00:00Z"); start.setUTCDate(start.getUTCDate() - 185);',
    '  start = Utilities.formatDate(start, "UTC", "yyyy-MM-dd");',
    '  var where = " WHERE segments.date BETWEEN \'" + start + "\' AND \'" + end + "\'";',
    '  var fields = "segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value";',
    '  function read(query, campaign) {',
    '    var output = [], rows = AdsApp.search(query);',
    '    while (rows.hasNext()) {',
    '      var row = rows.next(), m = row.metrics, item = {date:row.segments.date,costMicros:Number(m.costMicros),clicks:Number(m.clicks),impressions:Number(m.impressions),conversions:Number(m.conversions),conversionValue:Number(m.conversionsValue)};',
    '      if (campaign) item.campaignId = String(row.campaign.id);',
    '      output.push(item); if (output.length > 25000) throw new Error("Relatório muito grande.");',
    '    } return output;',
    '  }',
    '  var campaigns = [], iterator = AdsApp.search("SELECT campaign.id, campaign.name, campaign.status FROM campaign");',
    '  while (iterator.hasNext()) { var c = iterator.next().campaign; campaigns.push({id:String(c.id),name:c.name,status:c.status}); }',
    '  var payload = {accountId:"'+YR_ADS_ACCOUNT+'",currency:account.getCurrencyCode(),timeZone:zone,start:start,end:end,generatedAt:new Date().toISOString(),campaigns:campaigns,',
    '    daily:read("SELECT " + fields + " FROM customer" + where, false),campaignDaily:read("SELECT campaign.id, " + fields + " FROM campaign" + where, true)};',
    '  var response = UrlFetchApp.fetch(CRM_ENDPOINT,{method:"post",contentType:"application/json",headers:{"X-YR-Ads-Key":CRM_KEY},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:false});',
    '  var code = response.getResponseCode();',
    '  if (code !== 200) {',
    '    var detail = code === 401 ? "Chave inválida ou revogada. Gere o script uma vez no CRM e substitua o código antigo." : code === 404 ? "Endereço do CRM desatualizado. Gere novamente o script no CRM." : code === 403 ? "O destino recusou o acesso. Confira a configuração de acesso do CRM." : code >= 500 ? "CRM indisponível. Confira se o CRM está no ar antes de executar novamente." : "Relatório recusado pelo CRM. Confira conta, datas e formato dos dados.";',
    '    throw new Error("CRM não confirmou o relatório. HTTP " + code + ". " + detail);',
    '  }',
    '  var confirmation; try { confirmation = JSON.parse(response.getContentText()); } catch (error) { throw new Error("O destino não retornou a confirmação JSON do CRM. Gere novamente o script no CRM e confira o endereço."); }',
    '  if (!confirmation || confirmation.ok !== true || confirmation.accountId !== "'+YR_ADS_ACCOUNT+'") throw new Error("O destino não confirmou a importação para a conta do Grupo YR. Nenhum sucesso foi confirmado.");',
    '  Logger.log("Relatórios confirmados pelo CRM. Nenhuma campanha ou orçamento foi alterado.");',
    '}',
  ].join('\n')
}
export async function prepareAdsConnection(database, { actorId = 'local-operator', now = new Date(), publicUrl = DEFAULT_ADS_CRM_URL } = {}) {
  const origin = new URL(publicUrl)
  if (!ADS_CRM_ORIGINS.has(origin.origin) || origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new TypeError('Destino inválido')
  await database.ready
  const previous = database.get(COLLECTION).find(r => r.id === RECORD)
  const token = randomBytes(32).toString('base64url')
  await saveRecord(database, { ...(previous || {}), id: RECORD, tokenHash: hash(token), createdAt: now.toISOString(), createdBy: actorId })
  return { script: googleAdsScript(token, origin.origin + '/api/integrations/google-ads/ingest'), accountId: YR_ADS_ACCOUNT }
}
export function registerInsightsRoutes(app,{database,requireAuth,now=()=>new Date(),publicUrl=DEFAULT_ADS_CRM_URL}) {
  const auth=requireAuth(['admin'])
  let queue=Promise.resolve()
  const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task}
  const read=()=>database.get(COLLECTION).find(r=>r.id===RECORD)
  const guard=handler=>async(req,res)=>{res.setHeader('Cache-Control','private, no-store');try{await database.ready;await handler(req,res)}catch(e){res.status(e instanceof TypeError?400:503).json({error:'Não foi possível consultar ou salvar os dados. Tente novamente.'})}}
  app.get('/api/insights',auth,guard(async(req,res)=>{
    if (![7,30,90].includes(Number(req.query.days || 30))) return res.status(400).json({error:'Período inválido.'})
    res.json(buildInsights(database,{days:req.query.days || 30,now:now()}))
  }))
  app.post('/api/integrations/google-ads/script',auth,guard(async(req,res)=>{
    if (req.body?.confirmReadOnly !== true) return res.status(400).json({error:'Confirme a conexão de relatórios antes de gerar o script.'})
    res.json(await serial(() => prepareAdsConnection(database, { actorId: req.user.id, now: now(), publicUrl: typeof publicUrl === 'function' ? publicUrl() : publicUrl })))
  }))
  app.post('/api/integrations/google-ads/ingest',guard(async(req,res)=>{
    const supplied=req.get('X-YR-Ads-Key') || ''
    if (supplied.length>200) return res.status(401).json({error:'Chave inválida.'})
    const expected=read()?.tokenHash
    if (!expected || !timingSafeEqual(Buffer.from(hash(supplied),'hex'),Buffer.from(expected,'hex'))) return res.status(401).json({error:'Chave inválida.'})
    let payload
    try{payload=normalizeAdsPayload(req.body,now())}catch(e){return res.status(400).json({error:e.message})}
    await serial(async()=>{
      const old=read()
      if (old.tokenHash!==expected) { const err=new TypeError('Chave revogada');throw err }
      if (old.generatedAt && old.generatedAt>payload.generatedAt) throw new TypeError('Relatório anterior ao já recebido')
      const cutoff=shift(dayKey(now().toISOString()),-550)
      const preserve=row=>row.date>=cutoff && (row.date<payload.start || row.date>payload.end)
      await saveRecord(database,{...old,...payload,id:RECORD,daily:[...(old.daily || []).filter(preserve),...payload.daily],
        campaignDaily:[...(old.campaignDaily || []).filter(preserve),...payload.campaignDaily],lastSyncAt:now().toISOString()})
    })
    res.json({ok:true,accountId:YR_ADS_ACCOUNT})
  }))
}
