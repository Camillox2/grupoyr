import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { googleDay, nextGoogleReset, tokenUsage, quotaObservations, googleScope, recordGoogleAttempt, trackedGoogleFetch, googleUsageReport, sumGoogleUsage, persistGoogleControl } from '../src/googleUsage.js'
import { classifyGoogleModel, refreshGoogleCatalog, runGoogleBenchmark, registerGoogleModelRoutes, GOOGLE_BENCHMARK_CASES, scoreGoogleCase } from '../src/googleModels.js'

function fixture() {
  const data = { settings: { geminiApiKey:'fixture-not-a-real-key',aiServicePrompt:'Texto da equipe preservado.' } }
  return { data, storageMode:'local', ready:Promise.resolve(),get:k=>data[k]||[],getSettings:()=>data.settings,
    insert(k,r){(data[k] ||= []).push(structuredClone(r));return r},
    update(k,id,r){const i=data[k].findIndex(x=>x.id===id);data[k][i]={...data[k][i],...structuredClone(r)};return data[k][i]},
    flush:async()=>{} }
}
const key='fixture-not-a-real-key', at=new Date('2026-10-08T01:00:00Z')
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
const model=(name='gemini-fixture-flash')=>({name:'models/'+name,supportedGenerationMethods:['generateContent'],inputTokenLimit:1000})
const answer=scenario=>({fields:{...Object.fromEntries(Object.entries({...scenario.expected,...scenario.contains}).map(([k,v])=>[k,{value:v,evidence:scenario.text,unknown:false}])),...(scenario.unknown?{[scenario.unknown]:{value:'',evidence:'Não sei',unknown:true}}:{})},acknowledgement:'Entendi.',nextQuestion:{field:'neededAt',text:'Quando precisa?'}})
const googleAnswer=scenario=>({modelVersion:'fixture-version',usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:30,totalTokenCount:150},candidates:[{content:{parts:[{text:JSON.stringify(answer(scenario))}]}}]})

test('Google days and reset respect Pacific DST, not São Paulo midnight',()=>{
  assert.equal(googleDay(new Date('2026-10-08T02:00:00Z')),'2026-10-07')
  assert.equal(nextGoogleReset(new Date('2026-10-08T02:00:00Z')),'2026-10-08T07:00:00.000Z')
  assert.equal(nextGoogleReset(new Date('2026-03-08T08:00:00Z')),'2026-03-09T07:00:00.000Z')
  assert.equal(nextGoogleReset(new Date('2026-11-01T07:00:00Z')),'2026-11-02T08:00:00.000Z')
})
test('unknown tokens remain null; thinking/cache never double count total',()=>{
  assert.deepEqual(tokenUsage(),{inputTokens:null,outputTokens:null,thinkingTokens:null,cachedTokens:null,totalTokens:null})
  const db=fixture()
  recordGoogleAttempt(db,key,{model:'gemini-fixture',at,status:200,usage:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:30,cachedContentTokenCount:50,totalTokenCount:150}})
  recordGoogleAttempt(db,key,{model:'gemini-fixture',at,status:429})
  const sum=sumGoogleUsage(db.get('googleModelUsage'))
  assert.equal(sum.tokens.totalTokens,150);assert.equal(sum.tokens.inputTokens,100);assert.equal(sum.tokens.cachedTokens,50)
  assert.equal(sum.accepted,1);assert.equal(sum.attempts,2);assert.equal(sum.quotaErrors,1);assert.equal(sum.tokenSamples.totalTokens,1)
})
test('missing quota values are not zero; explicit zero is retained',()=>{
  const details=[{violations:[{quotaMetric:'generate_requests_per_day',quotaId:'PerDay',quotaValue:'0'},{quotaMetric:'generate_requests_per_day',quotaId:'NoValue'},{quotaMetric:'generate_requests_per_day',quotaId:'NullValue',quotaValue:null}]}]
  assert.deepEqual(quotaObservations({details}).map(v=>v.limit),[0])
})
test('usage separates tests, days and credentials and reconciles totals',()=>{
  const db=fixture()
  for(const source of ['website','whatsapp','benchmark','laboratory','crm'])recordGoogleAttempt(db,key,{model:'gemini-fixture',source,at,status:200,usage:{totalTokenCount:10}})
  recordGoogleAttempt(db,'other-fixture-key',{model:'gemini-fixture',source:'website',at,status:200,usage:{totalTokenCount:900}})
  recordGoogleAttempt(db,key,{model:'gemini-fixture',at:new Date('2026-10-08T08:00:00Z'),status:200,usage:{totalTokenCount:1000}})
  const r=googleUsageReport(db,key,{day:'2026-10-07',includeTests:false,now:at})
  assert.equal(r.totals.attempts,3);assert.equal(r.totals.tokens.totalTokens,30);assert.equal(r.testTotals.attempts,2)
  assert.equal(r.rows.reduce((n,x)=>n+x.usage.attempts,0),r.totals.attempts)
  assert.equal(r.projectUsage.available,false);assert.equal(r.startedAt,at.toISOString())
  assert.equal(r.rows[0].limits,null)
})
test('manual limits and verified Google snapshots have distinct provenance',()=>{
  const db=fixture(),scope=googleScope(key)
  db.insert('googleQuotaSnapshots',{id:'verified',scope,model:'gemini-fixture',limits:{rpd:20},observedAt:at.toISOString()})
  let r=googleUsageReport(db,key,{now:at,day:googleDay(at)});assert.equal(r.rows.length,0)
  recordGoogleAttempt(db,key,{model:'gemini-fixture',at,status:200})
  r=googleUsageReport(db,key,{now:at,day:googleDay(at)});assert.equal(r.rows[0].limits.source,'ai_studio_snapshot')
  db.insert('googleModelLimits',{id:'manual',scope,model:'gemini-fixture',limits:{rpd:0},updatedAt:at.toISOString()})
  r=googleUsageReport(db,key,{now:at,day:googleDay(at)});assert.equal(r.rows[0].limits.rpd,0);assert.equal(r.rows[0].limits.source,'manual')
})
test('tracked transport records each actual call once, not discovery, and stores no messages/key',async()=>{
  const db=fixture(),calls=[]
  const request=trackedGoogleFetch({database:db,key,source:'website',now:()=>at,fetcher:async(url,options)=>{calls.push(url);return json({usageMetadata:{totalTokenCount:27},privateText:'private-customer-name'})}})
  await request('https://generativelanguage.googleapis.com/v1beta/models')
  const response=await request('https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent',{method:'POST',body:'private-customer-name'})
  assert.equal((await response.json()).usageMetadata.totalTokenCount,27)
  assert.equal(db.get('googleModelUsage')[0].attempts,1);assert.equal(calls.length,2)
  assert.doesNotMatch(JSON.stringify(db.get('googleModelUsage')),/private-customer-name|fixture-not-a-real-key/)
})
test('transport failures record an attempt with unknown consumption and no retry',async()=>{
  const db=fixture();let calls=0
  const request=trackedGoogleFetch({database:db,key,now:()=>at,fetcher:async()=>{calls++;throw Object.assign(Error('private'),{name:'TimeoutError'})}})
  await assert.rejects(()=>request('https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent'))
  assert.equal(calls,1);assert.equal(db.get('googleModelUsage')[0].lastCode,'timeout')
  assert.equal(sumGoogleUsage(db.get('googleModelUsage')).tokens.totalTokens,null)
})
test('catalog excludes dedicated image, live, embeddings and agent models, includes Pro/Gemma',()=>{
  for(const name of ['gemini-pro-latest','gemma-4-31b-it','gemini-3.8-flash'])assert.equal(classifyGoogleModel(model(name)).compatible,true)
  for(const name of ['gemini-3.8-flash-tts','gemini-image','gemini-3.5-transcribe','gemini-3.8-live','gemini-robotics','antigravity-preview','lyria-3.5'])assert.equal(classifyGoogleModel(model(name)).compatible,false)
})
test('catalog follows pagination without spending generation quota',async()=>{
  const db=fixture();let calls=0
  const catalog=await refreshGoogleCatalog(db,key,async(url)=>{calls++;return json(calls===1?{models:[model('gemini-a')],nextPageToken:'next'}:{models:[model('gemini-b')]})})
  assert.equal(calls,2);assert.equal(catalog.models.length,2);assert.equal(db.get('googleModelUsage').length,0)
})
test('scoring fails on invented field, repeated city question and medical/price promise',()=>{
  const scenario=GOOGLE_BENCHMARK_CASES[2]
  const data=answer(scenario);data.fields.city={value:'Curitiba'};data.acknowledgement='**R$ 1, pronta entrega**'
  const result=scoreGoogleCase({provider:{ok:true},data},scenario)
  assert.ok(result.passed<result.total)
  const address=answer(GOOGLE_BENCHMARK_CASES[1]);address.nextQuestion.field='city'
  assert.equal(scoreGoogleCase({provider:{ok:true},data:address},GOOGLE_BENCHMARK_CASES[1]).checks.find(c=>c.name==='Não repetir pergunta respondida').passed,false)
})
test('benchmark tests exact models, no fallback, stops blocked model and leaves CRM config/customers alone',async()=>{
  const db=fixture(),before=structuredClone(db.data.settings),calls=[]
  const catalog={models:[classifyGoogleModel(model('gemini-blocked')),classifyGoogleModel(model('gemini-working'))]}
  const result=await runGoogleBenchmark(db,key,{catalog,fetcher:async(url,options)=>{
    calls.push(url)
    if(url.includes('gemini-blocked'))return json({error:{status:'RESOURCE_EXHAUSTED'}},429)
    const text=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).latestMessage
    return json(googleAnswer(GOOGLE_BENCHMARK_CASES.find(c=>c.text===text)))
  }})
  assert.equal(calls.length,4);assert.equal(result.status,'complete')
  assert.equal(result.results[0].tested,1);assert.equal(result.results[1].successful,3)
  assert.equal(result.recommendedModel,'gemini-working');assert.equal(result.results[1].score,100)
  assert.deepEqual(db.data.settings,before);assert.equal(db.get('leads').length,0);assert.equal(db.get('contracts').length,0)
  assert.equal(db.get('googleModelUsage').reduce((n,r)=>n+r.attempts,0),4)
})
test('persistence readback rejects swallowed Neon write failures',async()=>{
  const db=fixture();db.pool={query:async()=>({rows:[]})};db.insert('googleModelCatalog',{id:'fixture'})
  await assert.rejects(()=>persistGoogleControl(db,'googleModelCatalog','fixture'),/not_persisted/)
})
async function appFixture(fn, prepare = () => {}) {
  const db=fixture(),app=express();app.use(express.json())
  prepare(db)
  const requireAuth=roles=>(req,res,next)=>{if(!req.headers.authorization)return res.status(401).json({error:'login'});if(req.headers.authorization!=='fixture-admin')return res.status(403).json({error:'role'});req.user={id:'qa',role:'admin'};next()}
  let calls=0
  registerGoogleModelRoutes(app,{database:db,requireAuth,fetcher:async()=>{calls++;return json({models:[model()]})}})
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  try{await fn({db,url:'http://127.0.0.1:'+server.address().port,calls:()=>calls})}finally{await new Promise(r=>server.close(r))}
}
test('model/usage controls require admin and valid dates; unknown limits stay unknown',()=>appFixture(async({url})=>{
  assert.equal((await fetch(url+'/api/yria/google')).status,401)
  assert.equal((await fetch(url+'/api/yria/google',{headers:{Authorization:'fixture-seller'}})).status,403)
  assert.equal((await fetch(url+'/api/yria/google?day=2026-02-30',{headers:{Authorization:'fixture-admin'}})).status,400)
  const r=await fetch(url+'/api/yria/google',{headers:{Authorization:'fixture-admin'}})
  assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).projectUsage.available,false)
}))
test('limits validate model/numbers and preserve zero vs null; benchmark requires confirmation',()=>appFixture(async({url,db,calls})=>{
  const request=(path,method,body)=>fetch(url+path,{method,headers:{Authorization:'fixture-admin','Content-Type':'application/json'},body:JSON.stringify(body)})
  await request('/api/yria/google/catalog','POST',{})
  assert.equal((await request('/api/yria/google/limits','PUT',{model:'wrong',limits:{rpd:20}})).status,400)
  assert.equal((await request('/api/yria/google/limits','PUT',{model:'gemini-fixture-flash',limits:{rpd:-1}})).status,400)
  assert.equal((await request('/api/yria/google/limits','PUT',{model:'gemini-fixture-flash',limits:{rpd:0,rpm:''}})).status,200)
  assert.equal(db.get('googleModelLimits')[0].limits.rpd,0);assert.equal(db.get('googleModelLimits')[0].limits.rpm,null)
  assert.equal((await request('/api/yria/google/benchmark','POST',{})).status,400);assert.equal(calls(),1)
}))
test('server recovery marks unfinished tests interrupted, without silently resuming requests',()=>appFixture(async({db,url,calls})=>{
  await fetch(url+'/api/yria/google',{headers:{Authorization:'fixture-admin'}})
  const job=db.get('googleModelBenchmarks')[0]
  assert.equal(calls(),0);assert.equal(job.status,'interrupted');assert.deepEqual(job.results,[{model:'gemini-fixture-flash',successful:1}])
  const retry=await fetch(url+'/api/yria/google/benchmark',{method:'POST',headers:{Authorization:'fixture-admin','Content-Type':'application/json'},body:JSON.stringify({confirmed:true})})
  assert.equal(retry.status,429);assert.equal(calls(),0)
},db=>db.insert('googleModelBenchmarks',{id:'unfinished',scope:googleScope('fixture-key'),startedAt:new Date().toISOString(),status:'running',results:[{model:'gemini-fixture-flash',successful:1}]})))
