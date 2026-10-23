import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { registerFunnelRoutes, funnelImpact, isInFunnel, canManageFunnel } from '../src/funnel.js'

const fixture=()=>{
  const data={leads:[{id:'lead',name:'Teste',assignedTo:'owner',aiEnabled:true,stage:'finalizado',value:800}],contracts:[],invoices:[],messages:[{id:'m',leadId:'lead',content:'Histórico fictício'}],clients:[{id:'c'}],leadAttachments:[{id:'a',leadId:'lead'}],equipments:[],calendarEvents:[],contractExpenses:[]}
  return {data,ready:Promise.resolve(),get:k=>data[k]||[],filter:(k,p)=>(data[k]||[]).filter(p),find:(k,p)=>(data[k]||[]).find(p),update:(k,id,changes)=>{const i=data[k].findIndex(v=>v.id===id);return data[k][i]={...data[k][i],...changes}},flush:async()=>{},delete:()=>{throw Error('Hard delete forbidden')}}
}
async function setup(t,db=fixture()){
  const app=express(),events=[]
  app.use(express.json())
  const requireAuth=()=> (req,res,next)=>{
    const actor=req.headers.authorization
    if(!actor)return res.status(401).json({error:'unauthorized'})
    req.user={id:actor,role:actor==='admin'?'admin':'vendedor',name:'Equipe de teste'}
    next()
  }
  registerFunnelRoutes(app,{database:db,requireAuth,emit:(name,payload)=>events.push({name,payload})})
  const server=app.listen(0,'127.0.0.1')
  await new Promise(r=>server.once('listening',r));t.after(()=>server.close())
  const request=async(path,body,actor='admin')=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/leads/lead/${path}`,{method:body?'POST':'GET',headers:{...(actor?{Authorization:actor}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    return {status:r.status,body:await r.json()}
  }
  return {db,events,request}
}
test('funnel permissions allow administrator, owner and unassigned records only',()=>{
  assert.equal(canManageFunnel({id:'owner',role:'vendedor'},{assignedTo:'owner'}),true)
  assert.equal(canManageFunnel({id:'other',role:'vendedor'},{assignedTo:'owner'}),false)
  assert.equal(canManageFunnel({id:'other',role:'vendedor'},{assignedTo:''}),true)
})
test('reversible removal keeps documents, finance, client, attachments and messages untouched',async t=>{
  const {db,events,request}=await setup(t)
  const preserved=structuredClone({messages:db.data.messages,clients:db.data.clients,leadAttachments:db.data.leadAttachments})
  const result=await request('funnel-archive',{revision:'',reason:'Venda lançada por engano'})
  assert.equal(result.status,200);assert.equal(isInFunnel(result.body.lead),false)
  assert.equal(result.body.lead.aiEnabled,false);assert.equal(result.body.lead.stage,'finalizado')
  assert.equal(result.body.lead.funnelArchive.by,'admin');assert.equal(result.body.lead.funnelArchive.reason,'Venda lançada por engano')
  assert.deepEqual({messages:db.data.messages,clients:db.data.clients,leadAttachments:db.data.leadAttachments},preserved)
  assert.equal(events.length,1);assert.equal(events[0].name,'lead:updated')
  assert.equal(db.get('leads').filter(isInFunnel).reduce((s,l)=>s+l.value,0),0)
})
test('restore returns original stage and amount without restarting AI',async t=>{
  const {db,request}=await setup(t)
  const archived=await request('funnel-archive',{revision:'',reason:'Duplicado'})
  const restored=await request('funnel-restore',{revision:archived.body.lead.funnelRevision})
  assert.equal(restored.status,200);assert.equal(isInFunnel(restored.body.lead),true)
  assert.equal(restored.body.lead.stage,'finalizado');assert.equal(restored.body.lead.value,800)
  assert.equal(restored.body.lead.aiEnabled,false);assert.equal(db.get('leads').filter(isInFunnel).length,1)
})
test('linked contracts and paid invoices require acknowledgement and are never cancelled',async t=>{
  const db=fixture()
  db.data.contracts=[{id:'contract',leadId:'lead',number:'YR-001',status:'assinado'}]
  db.data.invoices=[{id:'invoice',contractNumber:'YR-001',status:'paga',amount:800}]
  db.data.equipments=[{id:'eq',currentLeadId:'lead',status:'alugado'}]
  db.data.calendarEvents=[{id:'event',contractId:'contract',status:'scheduled'}]
  db.data.contractExpenses=[{id:'expense',contractId:'contract',amount:50}]
  const saved=structuredClone({contracts:db.data.contracts,invoices:db.data.invoices,equipments:db.data.equipments,calendarEvents:db.data.calendarEvents,contractExpenses:db.data.contractExpenses})
  const {request}=await setup(t,db)
  const impact=await request('funnel-impact')
  assert.equal(impact.body.hasLinkedRecords,true);assert.equal(impact.body.eventCount,1);assert.equal(impact.body.expenseCount,1)
  const blocked=await request('funnel-archive',{revision:'',reason:'Erro'})
  assert.equal(blocked.status,409);assert.equal(isInFunnel(db.data.leads[0]),true)
  assert.equal((await request('funnel-archive',{revision:'',reason:'Erro',acknowledgeLinked:true})).status,200)
  assert.deepEqual({contracts:db.data.contracts,invoices:db.data.invoices,equipments:db.data.equipments,calendarEvents:db.data.calendarEvents,contractExpenses:db.data.contractExpenses},saved)
})
test('authentication and ownership are enforced on mutation and preflight',async t=>{
  const {request}=await setup(t)
  assert.equal((await request('funnel-impact',undefined,'')).status,401)
  assert.equal((await request('funnel-impact',undefined,'other')).status,403)
  assert.equal((await request('funnel-archive',{reason:'Erro',revision:''},'other')).status,403)
  assert.equal((await request('funnel-restore',{revision:''},'other')).status,403)
  assert.equal((await request('funnel-archive',{reason:'Erro',revision:''},'owner')).status,200)
})
test('reason, missing record and stale restore are validated',async t=>{
  const {db,request}=await setup(t)
  assert.equal((await request('funnel-archive',{reason:' ',revision:''})).status,400)
  assert.equal((await request('funnel-archive',{reason:'Erro',revision:'stale'})).status,409)
  const removed=await request('funnel-archive',{reason:'Erro',revision:''})
  assert.equal((await request('funnel-restore',{revision:''})).status,409)
  assert.equal(isInFunnel(db.data.leads[0]),false)
  assert.equal((await request('funnel-restore',{revision:removed.body.lead.funnelRevision})).status,200)
  db.data.leads=[]
  assert.equal((await request('funnel-impact')).status,404)
})
test('repeated archive and restore requests are idempotent',async t=>{
  const {request,events}=await setup(t)
  const one=await request('funnel-archive',{reason:'Erro',revision:''})
  const two=await request('funnel-archive',{reason:'Erro',revision:''})
  assert.equal(two.body.lead.funnelRevision,one.body.lead.funnelRevision);assert.equal(events.length,1)
  const restored=await request('funnel-restore',{revision:one.body.lead.funnelRevision})
  const repeated=await request('funnel-restore',{revision:one.body.lead.funnelRevision})
  assert.equal(repeated.body.lead.funnelRevision,restored.body.lead.funnelRevision);assert.equal(events.length,2)
})
test('database persistence failure never reports success or emits removal',async t=>{
  const db=fixture()
  db.pool={query:async()=>({rows:[{revision:'not-written'}]})}
  const {request,events}=await setup(t,db)
  assert.equal((await request('funnel-archive',{reason:'Erro',revision:''})).status,503)
  assert.equal(events.length,0)
  assert.equal(isInFunnel(db.data.leads[0]),true)
  assert.equal(db.data.leads[0].aiEnabled,false)
})
