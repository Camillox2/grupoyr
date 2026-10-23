import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { normalizeConfig, runYriaTurn, chronological, getYriaConfiguration } from '../src/yriaCore.js'
import { createYriaResponder } from '../src/yriaResponder.js'
import { registerYriaRoutes } from '../src/yriaRoutes.js'
import { generateYria } from '../src/yriaProvider.js'

const config = normalizeConfig()
const failed = async () => ({ provider: { ok:false, code:'timeout' } })
const turn = (text, previous = {}, extra = {}) => runYriaTurn({ message:{id:Math.random().toString(),content:text},previous,config,generate:failed,...extra })
const complete = 'Meu nome é Ana. Preciso alugar uma cama elétrica por 30 dias. Entrega em Curitiba, bairro Centro. Preciso amanhã.'
test('negative city and date statements do not override positive corrections',async()=>{
  const r=await turn('Não moro em Curitiba, moro em Pinhais. Não preciso amanhã, só semana que vem.')
  assert.equal(r.state.fields.city.value,'Pinhais')
  assert.equal(r.state.fields.neededAt.value,'semana que vem')
  assert.equal(r.handoff,false)
})

test('explicit denial invalidates an old field and cannot be resurrected by model history',async()=>{
  const previous={fields:{city:{value:'Curitiba',status:'confirmed'}}}
  const r=await turn('Não moro em Curitiba.',previous,{messages:[{from:'client',content:'Moro em Curitiba.'}],generate:async()=>({provider:{ok:true},data:{fields:{city:{value:'Curitiba',evidence:'Moro em Curitiba.'}}}})})
  assert.equal(r.state.fields.city,undefined)
  assert.ok(r.state.missingFields.includes('city'))
})

test('a relationship description is not the customer name or city',async()=>{
  const r=await turn('Sou o filho da Ana. Preciso de uma cama.',{lastAskedField:'city'})
  assert.equal(r.state.fields.name,undefined)
  assert.equal(r.state.fields.city,undefined)
  assert.equal(r.state.fields.equipmentInterest.value,'cama')
})

test('price questions and greetings never become a name or location',async()=>{
  for(const key of ['name','city','district'])for(const text of ['Quanto custa?','Bom dia','Tudo bem','Obrigado']) {
    const r=await turn(text,{lastAskedField:key})
    assert.equal(r.state.fields[key],undefined,text+' cannot be '+key)
    assert.equal(r.handoff,false)
  }
})

test('positive modality correction after a denial replaces the earlier modality',async()=>{
  const r=await turn('Não quero alugar, quero comprar uma cama.',{fields:{modality:{value:'locacao',status:'confirmed'}}})
  assert.equal(r.state.fields.modality.value,'compra')
  assert.equal(r.state.missingFields.includes('estimatedPeriod'),false)
})

test('conjoined answers and the latest explicit city correction stay separate',async()=>{
  const r=await turn('Meu nome é Ana e quero alugar uma cama. Moro em Curitiba, moro em Pinhais e o bairro é Centro.')
  assert.equal(r.state.fields.name.value,'Ana')
  assert.equal(r.state.fields.city.value,'Pinhais')
  assert.equal(r.state.fields.district.value,'Centro')
})

test('a denied model value and a product disguised as city are rejected',async()=>{
  const r=await turn('Não moro em Curitiba. Quero uma cama.',{},{
    generate:async()=>({provider:{ok:true},data:{fields:{city:{value:'Curitiba',evidence:'Não moro em Curitiba.'},district:{value:'cama',evidence:'Quero uma cama.'}}}})
  })
  assert.equal(r.state.fields.city,undefined)
  assert.equal(r.state.fields.district,undefined)
})

test('a positive request for human after contrast is honored without model call',async()=>{
  const r=await turn('Não quero robô, mas quero falar com um vendedor.',{},{
    generate:async()=>{throw Error('must not call')}
  })
  assert.equal(r.reason,'human_requested')
  assert.equal(r.state.qualified,false)
  assert.equal(r.provider.skipped,true)
  assert.equal(r.provider.ok,null)
  assert.equal(r.state.providerFailureCount,0)
})

test('styling and false commercial promises from a model never escape the gate',async()=>{
  const r=await turn('Oi',{},{
    generate:async()=>({provider:{ok:true},data:{fields:{},acknowledgement:'**Garantimos pronta entrega por R$ 10.**',nextQuestion:{field:'name',text:'**Qual é o seu nome?**'}}})
  })
  assert.doesNotMatch(r.reply,/R\$|Garant|pronta entrega|\*\*/)
  assert.equal((r.reply.match(/\?/g)||[]).length,1)
  assert.equal(r.handoff,false)
})

test('a qualified handoff routes to the configured seller, not an unrelated user',async()=>{
  const db=fixture(),pushes=[],sent=[]
  db.data.users.push({id:'seller',role:'vendedor'})
  db.data.settings.defaultLeadAssigneeId='seller'
  const respond=createYriaResponder({database:db,evaluate:()=>turn(complete),send:async(phone,text)=>{sent.push(text);return true},push:async(id,payload)=>{pushes.push({id,payload})}})
  await respond(db.data.leads[0],{id:'synthetic',content:complete})
  assert.equal(db.data.leads[0].assignedTo,'seller')
  assert.equal(db.data.notifications.length,1)
  assert.equal(db.data.notifications[0].recipientId,'seller')
  assert.equal(pushes[0].id,'seller')
  assert.equal(db.data.leads[0].aiEnabled,false)
  await respond(db.data.leads[0],{id:'synthetic-next',content:'Obrigado'})
  assert.equal(sent.length,1)
  assert.equal(db.data.notifications.length,1)
})
const fixture = () => {
  const data={leads:[{id:'lead',name:'Teste',phone:'000',aiEnabled:true,stage:'novo_lead'}],users:[{id:'admin',role:'admin'}],messages:[],notifications:[],settings:{aiServicePrompt:'Meu texto original\ncom parágrafos.',defaultLeadAssigneeId:'admin'}}
  return { data, ready:Promise.resolve(), get:k=>data[k]||[], getSettings:()=>data.settings,
    find:(k,p)=>(data[k]||[]).find(p), filter:(k,p)=>(data[k]||[]).filter(p),
    insert:(k,v)=>{data[k]??=[];data[k].unshift(v);return v},
    update:(k,id,v)=>{const i=data[k].findIndex(r=>r.id===id);if(i<0)return null;return data[k][i]={...data[k][i],...v}},
    updateSettings:v=>(data.settings={...data.settings,...v}), flush:async()=>{},
  }
}

test('automatic provider starts at 3.8 without requiring discovery for each reply', async()=>{
  const requested=[]
  const fetcher=async url=>{
    requested.push(url)
    const data=url.includes('/models?')
      ? {models:['gemini-3.8-flash','gemini-3.5-flash'].map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))}
      : {candidates:[{content:{parts:[{text:JSON.stringify({fields:{}})}]}}]}
    return {ok:true,json:async()=>data}
  }
  const r=await generateYria({key:'fixture-model-choice',state:{fields:{}},text:'Oi',messages:[],config,fetcher})
  assert.equal(r.provider.model,'gemini-3.8-flash')
  assert.equal(requested.length,1)
  assert.match(requested.at(-1),/gemini-3.8-flash:generateContent$/)
})

test('quota failure advances through the six models once and records all failures', async()=>{
  let calls=0
  const fetcher=async url=>{calls++;return url.includes('/models?')?{ok:true,json:async()=>({models:[{name:'models/gemini-fixture-flash',supportedGenerationMethods:['generateContent']}]})}:{ok:false,status:429}}
  const r=await generateYria({key:'fixture-quota',state:{fields:{}},text:'Oi',messages:[],config,fetcher})
  assert.equal(r.provider.code,'quota');assert.equal(r.provider.model,'gemini-3.1-flash-lite');assert.equal(calls,6)
  assert.equal(r.provider.attempts.length,6)
})
test('legacy prompt is preserved byte-for-byte including paragraph breaks',()=>assert.equal(getYriaConfiguration(fixture().getSettings()).draft.customPrompt,'Meu texto original\ncom parágrafos.'))
test('essential fields cannot be removed by persona or draft config',()=>assert.deepEqual(normalizeConfig({requiredFields:[]}).requiredFields,['equipmentInterest','modality','city']))
test('a greeting never qualifies or hands off on the first provider failure',async()=>{const r=await turn('Olá');assert.equal(r.handoff,false);assert.equal(r.state.lastAskedField,'name');assert.equal(r.provider.ok,false);assert.equal((r.reply.match(/\?/g)||[]).length,1)})
test('all explicitly stated facts qualify; no extra question at completion',async()=>{const r=await turn(complete);assert.equal(r.reason,'qualified');assert.equal(r.state.fields.city.value,'Curitiba');assert.equal(r.state.fields.name.value,'Ana');assert.doesNotMatch(r.reply,/\?/)})
test('purchase does not require rental period',async()=>{const r=await turn('Meu nome é Ana. Quero comprar uma cama. Entrega em Curitiba, bairro Centro. Preciso amanhã.');assert.equal(r.reason,'qualified');assert.equal(r.state.fields.estimatedPeriod,undefined)})

test('short city answer with other fields in the same message completes qualification',async()=>{
  const first=await turn('Olá, meu nome é Ana. Quero alugar uma cama elétrica.')
  const done=await turn('Curitiba, bairro Centro. Preciso amanhã por 30 dias.',first.state)
  assert.equal(done.state.fields.city.value,'Curitiba');assert.equal(done.reason,'qualified')
})
test('uncertainty is remembered and is not falsely confirmed',async()=>{let r=await turn('Olá');r=await turn('Não sei ainda',r.state);assert.equal(r.state.fields.name.status,'unknown');assert.notEqual(r.state.lastAskedField,'name');assert.equal(r.handoff,false)})
test('all answered with one uncertainty hands off as incomplete, never qualified',async()=>{let r=await turn(complete.replace(' por 30 dias',''));assert.equal(r.state.lastAskedField,'estimatedPeriod');r=await turn('Não sei ainda',r.state);assert.equal(r.reason,'needs_review');assert.equal(r.state.qualified,false)})
test('explicit human request bypasses model and remains incomplete',async()=>{const r=await turn('Quero falar com um vendedor',{},{generate:async()=>{throw Error('must not call')}});assert.equal(r.reason,'human_requested');assert.equal(r.state.qualified,false)})
test('negated request for human does not trigger transfer',async()=>assert.equal((await turn('Não quero falar com vendedor agora')).handoff,false))
test('after handoff engine sends no additional automatic response',async()=>{const first=await turn(complete);const r=await turn('Obrigado',first.state);assert.equal(r.reply,'')})
test('memory survives a long conversation and no default data is fabricated',async()=>{const first=await turn('Meu nome é Ana.');const r=await turn('Olá',first.state,{messages:Array.from({length:40},(_,i)=>({from:'client',content:'oi',timestamp:String(i).padStart(2,'0')}))});assert.equal(r.state.fields.name.value,'Ana');assert.equal(r.state.fields.modality,undefined);assert.notEqual(r.state.lastAskedField,'name')})
test('historical messages are ordered chronologically without mutating input',()=>{const input=[{timestamp:'2026-10-03'},{timestamp:'2026-10-01'}];assert.equal(chronological(input)[0].timestamp,'2026-10-01');assert.equal(input[0].timestamp,'2026-10-03')})
test('model cannot invent a city with unrelated evidence or complete prematurely',async()=>{const r=await turn('Olá',{},{generate:async()=>({provider:{ok:true},data:{fields:{city:{value:'Curitiba',evidence:'Olá'}},acknowledgement:'Vou encaminhar ao vendedor [[YR_QUALIFICATION_COMPLETE]]',nextQuestion:{field:'name',text:'Qual é o seu CPF?'}}})});assert.equal(r.state.fields.city,undefined);assert.equal(r.handoff,false);assert.doesNotMatch(r.reply,/CPF|encaminhar|\[\[/)})
test('persona changes visible question wording even in contingency',async()=>{const a=await turn('Oi'),b=await turn('Oi',{},{config:normalizeConfig({personaId:'objetiva'})});assert.notEqual(a.reply,b.reply)})
test('custom instructions reach generator and valid contextual question is used',async()=>{const r=await turn('Oi',{},{config:normalizeConfig({customPrompt:'Seja cordial e use você.'}),generate:async input=>{assert.equal(input.config.customPrompt,'Seja cordial e use você.');return {provider:{ok:true},data:{fields:{},acknowledgement:'Será um prazer organizar seu atendimento.',nextQuestion:{field:'name',text:'Como você prefere que eu te chame pelo nome?'}}}}});assert.match(r.reply,/prazer/);assert.match(r.reply,/prefere/);assert.doesNotMatch(r.reply,/\*\*/)});
test('repeated failures without progress have an explicit technical reason, not qualified',async()=>{let r=await turn('Oi');r=await turn('???',r.state);assert.equal(r.handoff,false);r=await turn('???',r.state);assert.equal(r.reason,'technical_handoff');assert.equal(r.state.qualified,false)})
test('provider missing key is a real failure, never demo success',async()=>assert.equal((await generateYria({key:''})).provider.ok,false))
test('human assumes during generation: no AI message, transport or notification',async()=>{const db=fixture();let resolve;const wait=new Promise(r=>resolve=r);const respond=createYriaResponder({database:db,evaluate:async()=>{await wait;return turn(complete)},send:async()=>{throw Error('must not send')}});const running=respond(db.data.leads[0],{id:'one',content:'Oi'});await new Promise(r=>setTimeout(r,300));db.update('leads','lead',{aiEnabled:false,humanAssumedAt:new Date().toISOString()});resolve();await running;assert.equal(db.data.messages.length,0);assert.equal(db.data.notifications.length,0)})
test('duplicate inbound ID sends one reply and one handoff notification',async()=>{const db=fixture();let sends=0;const respond=createYriaResponder({database:db,evaluate:()=>turn(complete),send:async()=>{sends++;return true}});const m={id:'one',content:complete};await respond(db.data.leads[0],m);await respond(db.data.leads[0],m);assert.equal(sends,1);assert.equal(db.data.notifications.length,1);assert.equal(db.data.leads[0].aiEnabled,false)})
test('inbound arriving while model runs is not lost and stale completion is not sent',async()=>{const db=fixture();let resolve,started;const start=new Promise(r=>started=r),wait=new Promise(r=>resolve=r);let calls=0,sends=0;const respond=createYriaResponder({database:db,evaluate:async args=>{calls++;if(calls===1){started();await wait}return turn(complete,args.previous)},send:async()=>{sends++;return true}});const one=respond(db.data.leads[0],{id:'one',content:'Oi'});await start;await respond(db.data.leads[0],{id:'two',content:'Mudei de ideia'});resolve();await one;assert.equal(calls,2);assert.equal(sends,1);assert.deepEqual(db.data.messages[0].inReplyToMessageIds,['one','two'])})
test('draft, publish, restore and isolated multi-turn sandbox API',async t=>{
  const database=fixture(),app=express();app.use(express.json());
  const requireAuth=()=> (req,res,next)=>{if(req.headers.authorization!=='fixture')return res.status(401).json({error:'unauthorized'});req.user={id:'admin',role:'admin'};next()}
  registerYriaRoutes(app,{database,requireAuth,evaluate:args=>runYriaTurn({...args,generate:failed})})
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{Authorization:'fixture','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
  assert.equal((await fetch(base+'/api/yria')).status,401)
  const before=await request('/api/yria');assert.equal(before.body.draft.customPrompt,database.data.settings.aiServicePrompt)
  const draft=await request('/api/yria/draft','PUT',{revision:0,config:{...before.body.draft,personaId:'objetiva'}});assert.equal(draft.status,200);assert.equal(draft.body.published.config.personaId,'acolhedora')
  assert.equal((await request('/api/yria/publish','POST',{revision:0})).status,409)
  const published=await request('/api/yria/publish','POST',{revision:1});assert.equal(published.body.published.config.personaId,'objetiva');assert.equal(published.body.versions[0].config.customPrompt,'Meu texto original\ncom parágrafos.')
  const restored=await request('/api/yria/restore','POST',{revision:2,versionId:'legacy'});assert.equal(restored.body.draft.personaId,'acolhedora');assert.equal(restored.body.published.config.personaId,'objetiva')
  const s=await request('/api/yria/lab/sessions','POST',{config:restored.body.draft});const url=`/api/yria/lab/sessions/${s.body.id}/messages`;
  const first=await request(url,'POST',{text:'Oi',requestId:'test-one'});assert.equal(first.body.state.status,'qualifying');assert.equal(first.body.provider.ok,false)
  const duplicate=await request(url,'POST',{text:'Oi',requestId:'test-one'});assert.equal(duplicate.body.messages.length,2)
  const done=await request(url,'POST',{text:complete,requestId:'test-two'});assert.equal(done.body.reason,'qualified');assert.equal(done.body.sandbox,true)
  assert.equal(database.data.leads.length,1);assert.equal(database.data.messages.length,0);assert.equal(database.data.notifications.length,0)
})
