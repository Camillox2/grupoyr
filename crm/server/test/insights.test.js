import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import vm from 'node:vm'
import { buildInsights, reportRange, normalizeAdsPayload, adsReport, registerInsightsRoutes, prepareAdsConnection, googleAdsScript, YR_ADS_ACCOUNT, dayKey } from '../src/insights.js'
const now=new Date('2026-10-07T15:00:00Z')
const metrics={costMicros:2000000,clicks:4,impressions:100,conversions:0.5,conversionValue:50}
function database(data={}) {
  return {data,ready:Promise.resolve(),storageMode:'local',get(k){return this.data[k]||[]},save(){return true}}
}
const payload=()=>({accountId:YR_ADS_ACCOUNT,currency:'BRL',timeZone:'America/Sao_Paulo',start:'2026-10-01',end:'2026-10-07',generatedAt:now.toISOString(),
  campaigns:[{id:'123',name:'Campanha YR',status:'PAUSED'}],daily:[{date:'2026-10-07',...metrics}],campaignDaily:[{date:'2026-10-07',campaignId:'123',...metrics}]})
test('São Paulo dates, valid dates, and 7/30/90 ranges',()=>{
  assert.equal(dayKey('2026-10-07T01:00:00Z'),'2026-10-06')
  assert.equal(dayKey('2026-02-31'),null)
  assert.deepEqual(reportRange(7,now),{start:'2026-10-01',end:'2026-10-07',days:7,previousStart:'2026-09-24',previousEnd:'2026-09-30',timeZone:'America/Sao_Paulo'})
  assert.throws(()=>reportRange(365,now))
})
test('cash uses paidAt, excludes cancelled/undated and compares period without inventing LTV',()=>{
  const db=database({invoices:[
    {status:'paga',amount:100,paidAt:'2026-10-02T10:00:00Z',dueDate:'2026-09-02'},
    {status:'paga',amount:200,paidAt:'2026-09-02T10:00:00Z',dueDate:'2026-10-02'},
    {status:'paga',amount:900,paidAt:null},
    {status:'cancelada',amount:800,paidAt:now.toISOString()},
    {status:'pendente',amount:150,dueDate:'2026-10-01'}],
    contractExpenses:[{amount:20,date:'2026-10-03'},{amount:90,date:'2026-09-03'}]})
  const r=buildInsights(db,{days:7,now})
  assert.equal(r.metrics.receivedCents,10000);assert.equal(r.metrics.registeredCostCents,2000)
  assert.equal(r.metrics.registeredBalanceCents,8000);assert.equal(r.metrics.overdueCents,15000)
  assert.equal(r.methodology.paidWithoutDate,1);assert.equal(r.daily.reduce((s,d)=>s+d.receivedCents,0),10000)
  assert.equal(r.ads.totals,null)
})
test('fleet excludes sold, monthly base uses signed current rental contracts only',()=>{
  const db=database({equipments:[{status:'alugado'},{status:'disponivel'},{status:'vendido'}],
    contracts:[{type:'locacao',status:'assinado',startDate:'2026-10-01',endDate:'2026-10-31',monthlyValue:400},
      {type:'venda',status:'assinado',startDate:'2026-10-01',endDate:'2026-10-31',monthlyValue:900},
      {type:'locacao',status:'rascunho',startDate:'2026-10-01',endDate:'2026-10-31',monthlyValue:900}]})
  const r=buildInsights(db,{days:7,now})
  assert.equal(r.metrics.fleet,2);assert.equal(r.metrics.occupancy,50)
  assert.equal(r.metrics.monthlyRentalBaseCents,40000)
  assert.equal(buildInsights(database(),{now}).metrics.occupancy,null)
})
test('cohort deduplicates signed contracts, origins stay separate from Ads',()=>{
  const db=database({leads:[{id:'a',createdAt:'2026-10-02',origin:'Google Ads'},{id:'b',createdAt:'2026-10-03',origin:'Indicação'}],
    contracts:[{leadId:'a',status:'assinado',signedAt:'2026-10-04'},{leadId:'a',status:'assinado',signedAt:'2026-10-05'}]})
  const r=buildInsights(db,{days:7,now})
  assert.equal(r.metrics.cohortSignedPercent,50);assert.equal(r.metrics.signedContracts,2)
  assert.equal(r.ads.totals,null);assert.equal(r.sources.find(s=>s.name==='Google Ads').value,1)
})
test('Ads complete export fills no-activity dates, preserves fractional conversions',()=>{
  const r=normalizeAdsPayload(payload(),now);assert.equal(r.daily.length,7)
  const report=adsReport({...r,lastSyncAt:now.toISOString()},reportRange(7,now),now)
  assert.equal(report.complete,true);assert.equal(report.totals.conversions,.5)
  assert.equal(report.cpc,.5);assert.equal(report.ctr,4);assert.equal(report.cpa,4)
  assert.equal(adsReport({...r,lastSyncAt:now.toISOString()},reportRange(30,now),now).totals,null)
})
test('Ads rejects other accounts/currencies, duplicates, missing metrics, invalid dates and expired reports',()=>{
  for(const change of [{accountId:'4270885111'},{currency:'USD'},{start:'2026-02-31'},{generatedAt:'2026-09-01T00:00:00Z'},{daily:[{date:'2026-10-07',...metrics},{date:'2026-10-07',...metrics}]},{daily:[{date:'2026-10-07',costMicros:0}]}]){
    assert.throws(()=>normalizeAdsPayload({...payload(),...change},now))
  }
})
test('generated script contains only reporting APIs and a fixed account, no Ads mutations or credential logging',()=>{
  const script=googleAdsScript('fixture-only','https://crm-grupoyr.dcfoundrydigital.com/api/integrations/google-ads/ingest')
  assert.match(script,/AdsApp\.search/);assert.match(script,/7071472143/);assert.match(script,/followRedirects:false/)
  assert.doesNotMatch(script,/\.setBudget|\.pause\(|\.enable\(|\.create\(|\.mutate\(|log\(CRM_KEY/)
})
async function withApi(t,db=database(),routeOptions={}){
  const app=express();app.use(express.json())
  const requireAuth=roles=>(req,res,next)=>{
    if(!req.get('Authorization'))return res.status(401).end()
    const role=req.get('Authorization')
    if(!roles.includes(role))return res.status(403).end()
    req.user={id:'fixture-admin',role};next()
  }
  registerInsightsRoutes(app,{database:db,requireAuth,now:()=>now,...routeOptions})
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve))
  t.after(()=>new Promise(resolve=>server.close(resolve)))
  const request=(url,{body,role='admin',key}={})=>fetch('http://127.0.0.1:'+server.address().port+url,{
    method:body?'POST':'GET',headers:{...(role?{Authorization:role}:{}),...(key?{'X-YR-Ads-Key':key}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  return {request,db}
}
test('insights and script controls require admin and explicit connection confirmation',async t=>{
  const {request}=await withApi(t)
  assert.equal((await request('/api/insights',{role:null})).status,401)
  assert.equal((await request('/api/insights',{role:'vendedor'})).status,403)
  assert.equal((await request('/api/insights?days=5')).status,400)
  assert.equal((await request('/api/integrations/google-ads/script',{body:{}})).status,400)
  const r=await request('/api/insights');assert.equal(r.headers.get('Cache-Control'),'private, no-store')
})
test('scoped key ingestion, idempotent daily totals, key rotation, no key leak in insights',async t=>{
  const {request,db}=await withApi(t)
  assert.equal((await request('/api/integrations/google-ads/ingest',{body:payload(),role:null})).status,401)
  const script=await (await request('/api/integrations/google-ads/script',{body:{confirmReadOnly:true}})).json()
  const token=JSON.parse(script.script.match(/var CRM_KEY = (.*);/)[1])
  assert.equal(JSON.stringify(db.data).includes(token),false)
  for(let i=0;i<2;i++)assert.equal((await request('/api/integrations/google-ads/ingest',{body:payload(),role:null,key:token})).status,200)
  const report=await (await request('/api/insights?days=7')).json()
  assert.equal(report.ads.totals.costMicros,2000000)
  assert.equal(report.ads.connected,true)
  assert.equal(JSON.stringify(report).includes('tokenHash'),false)
  await request('/api/integrations/google-ads/script',{body:{confirmReadOnly:true}})
  assert.equal((await request('/api/integrations/google-ads/ingest',{body:payload(),role:null,key:token})).status,401)
})
test('failed Neon persistence never changes memory or returns a generated script',async t=>{
  const db=database();db.pool={query:async()=>{throw new Error('fixture unavailable')}}
  const {request}=await withApi(t,db)
  const response=await request('/api/integrations/google-ads/script',{body:{confirmReadOnly:true}})
  assert.equal(response.status,503);assert.equal(db.get('googleAdsIntegration').length,0)
})

test('default generated destination is CRM2 and resolver is evaluated for each request',async t=>{
  const generated=await prepareAdsConnection(database())
  assert.match(generated.script,/https:\/\/crm2-grupoyr\.dcfoundrydigital\.com\/api\/integrations\/google-ads\/ingest/)
  let origin='https://crm2-grupoyr.dcfoundrydigital.com'
  const {request}=await withApi(t,database(),{publicUrl:()=>origin})
  const first=await request('/api/integrations/google-ads/script',{body:{confirmReadOnly:true}})
  assert.equal(first.status,200);assert.match((await first.json()).script,/crm2-grupoyr/)
  origin='https://crm-grupoyr.dcfoundrydigital.com'
  const second=await request('/api/integrations/google-ads/script',{body:{confirmReadOnly:true}})
  assert.equal(second.status,200);assert.doesNotMatch((await second.json()).script,/crm2-grupoyr/)
})

test('untrusted origins and URL credentials/path/query fail before rotating the key',async()=>{
  const db=database({googleAdsIntegration:[{id:'grupo-yr',tokenHash:'fixture-existing'}]}),before=structuredClone(db.data)
  for(const publicUrl of ['http://crm2-grupoyr.dcfoundrydigital.com','https://evil.example.test','https://crm2-grupoyr.dcfoundrydigital.com.evil.example.test','https://user:password@crm2-grupoyr.dcfoundrydigital.com','https://crm2-grupoyr.dcfoundrydigital.com/path','https://crm2-grupoyr.dcfoundrydigital.com/?other=1','https://crm2-grupoyr.dcfoundrydigital.com/#other']){
    await assert.rejects(prepareAdsConnection(db,{publicUrl}),/Destino inválido/)
    assert.deepEqual(db.data,before)
  }
})

function runScript({code=200,body='{"ok":true,"accountId":"7071472143"}',accountId='707-147-2143'}={}){
  const logs=[],requests=[],queries=[]
  const context=vm.createContext({
    AdsApp:{currentAccount:()=>({getCustomerId:()=>accountId,getTimeZone:()=> 'America/Sao_Paulo',getCurrencyCode:()=> 'BRL'}),search:query=>{queries.push(query);return{hasNext:()=>false}}},
    Utilities:{formatDate:(date,zone)=>zone==='UTC'?date.toISOString().slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
    UrlFetchApp:{fetch:(url,options)=>{requests.push({url,options});return{getResponseCode:()=>code,getContentText:()=>body}}},
    Logger:{log:text=>logs.push(text)},
  })
  vm.runInContext(googleAdsScript('synthetic-fixture-not-a-real-key','https://crm2-grupoyr.dcfoundrydigital.com/api/integrations/google-ads/ingest'),context)
  return{run:()=>vm.runInContext('main()',context),logs,requests,queries}
}

test('generated script runs reporting queries and accepts only confirmed account JSON',()=>{
  const script=runScript();script.run()
  assert.equal(script.requests.length,1);assert.equal(script.queries.length,3)
  assert.ok(script.queries.every(query=>query.startsWith('SELECT ')))
  const payload=JSON.parse(script.requests[0].options.payload)
  assert.equal(payload.accountId,YR_ADS_ACCOUNT);assert.equal(normalizeAdsPayload(payload,new Date()).daily.length,186)
  assert.equal(script.logs.length,1);assert.doesNotMatch(script.logs[0],/synthetic-fixture/)
  for(const body of ['<html>Old frontend</html>','{}','{"ok":true,"accountId":"wrong"}','{"ok":false,"accountId":"7071472143"}']){
    const invalid=runScript({body});assert.throws(invalid.run,/confirma|confirmou/);assert.equal(invalid.logs.length,0)
  }
})

test('generated script explains HTTP failures without logging keys or HTML, wrong account never transmits',()=>{
  for(const [code,message] of [[401,/revogada/],[404,/desatualizado/],[403,/recusou/],[503,/indisponível/],[400,/recusado/]]){
    const script=runScript({code,body:'DO NOT LOG synthetic-fixture-not-a-real-key'})
    assert.throws(script.run,message);assert.equal(script.logs.length,0)
  }
  const wrong=runScript({accountId:'000-000-0000'});assert.throws(wrong.run,/Conta incorreta/);assert.equal(wrong.requests.length,0)
})
