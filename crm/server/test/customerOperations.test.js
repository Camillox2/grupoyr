import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import sharp from 'sharp'
import { createInspection, addInspectionPhoto, compressPhoto, issueAccess, validAccess, safeInspection, persistInspection } from '../src/inspections.js'
import { operationalAlerts, publishOperationalAlerts, newBankEntry, reconcileEntry, runYriaRegression } from '../src/clientOperations.js'
import { registerCustomerRoutes } from '../src/customerRoutes.js'
const fixture=()=>{
 const data={leads:[{id:'lead-a',name:'Cliente Teste A',phone:'554100000000',notes:'PRIVATE',assignedTo:'seller'},{id:'lead-b',name:'Cliente Teste B'}],equipments:[{id:'eq',name:'Cama',serialNumber:'YR-001'}],contracts:[{id:'ca',leadId:'lead-a',number:'CA',status:'assinado',type:'locacao',equipmentIds:['eq'],endDate:'2026-10-12'}],invoices:[{id:'ia',leadId:'lead-a',contractNumber:'CA',status:'pendente',amount:100,dueDate:'2026-10-07'}],users:[{id:'admin',role:'admin'},{id:'seller',role:'vendedor'}],settings:{},inspections:[]}
 return{data,ready:Promise.resolve(),get:c=>data[c]||[],getSettings:()=>data.settings,find:(c,f)=>(data[c]||[]).find(f),filter:(c,f)=>(data[c]||[]).filter(f),flush:async()=>{},save:()=>true}
}
const photo=()=>sharp({create:{width:400,height:300,channels:3,background:'#336699'}}).jpeg().toBuffer()
const user={id:'admin',name:'Responsável',role:'admin'}
test('photo converts to bounded WebP without metadata and rejects non-images',async()=>{const result=await compressPhoto(await photo());const meta=await sharp(result.data).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.ok(result.data.length<=350000);await assert.rejects(()=>compressPhoto(Buffer.from('<svg>bad</svg>')),/JPG|fotografia/);await assert.rejects(()=>compressPhoto(Buffer.alloc(9*1024*1024)),/8 MB/)} )
test('inspection validates lead, equipment, contract ownership and matching baseline',()=>{const db=fixture();assert.throws(()=>createInspection(db,{leadId:'lead-b',contractId:'ca',equipmentId:'eq',phase:'delivery'},user),/não pertence/);const before=createInspection(db,{leadId:'lead-a',contractId:'ca',equipmentId:'eq',phase:'delivery'},user);db.data.inspections.push({...before,status:'completed'});const after=createInspection(db,{leadId:'lead-a',contractId:'ca',equipmentId:'eq',phase:'pickup'},user);assert.equal(after.baselineId,before.id);const unrelated=createInspection(db,{leadId:'lead-b',equipmentId:'eq',phase:'pickup'},user);assert.equal(unrelated.baselineId,null)})
test('10 photos maximum, immutable completion, stale write and private payload',async()=>{const db=fixture();let row=createInspection(db,{leadId:'lead-a',equipmentId:'eq',phase:'delivery'},user);await persistInspection(db,null,row);const buffer=await photo();for(let i=0;i<10;i++)row=await addInspectionPhoto(db,row,buffer,'customer','Roda');assert.equal(row.photos.length,10);assert.equal(safeInspection(row).photos[0].localData,undefined);await assert.rejects(()=>addInspectionPhoto(db,row,buffer,'customer','Extra'),/10 fotos/);await assert.rejects(()=>persistInspection(db,{...row,revision:0},{...row,revision:20}),/alterados/);await assert.rejects(()=>addInspectionPhoto(db,{...row,status:'completed'},buffer,'customer','Extra'),/concluída/)} )
test('links are hashed, scoped and expire; revoked access is rejected',()=>{const now=new Date('2026-10-09T12:00:00Z'),grant=issueAccess(now);assert.equal(grant.token.length,43);assert.notEqual(grant.token,grant.access.hash);assert.ok(validAccess(grant.access,grant.token,now));assert.equal(validAccess(grant.access,'bad',now),false);assert.equal(validAccess(null,grant.token,now),false);assert.equal(validAccess(grant.access,grant.token,new Date('2026-10-17')),false)})
test('reconciliation is exact, atomic and cannot reuse transaction or cancelled invoice',async()=>{const db=fixture();const entry=newBankEntry({source:'banco',reference:'test-ref',amountCents:10000,date:'2026-10-09'},user);db.data.bankEntries=[entry];const result=await reconcileEntry(db,entry.id,'ia',user);assert.equal(db.data.invoices[0].status,'paga');assert.equal(db.data.bankEntries[0].status,'reconciled');assert.equal(db.data.reconciliations[0].id,result.id);await assert.rejects(()=>reconcileEntry(db,entry.id,'ia',user),/já foi/);assert.throws(()=>newBankEntry({source:'b',reference:'a',amountCents:123,date:'2026-02-31'},user),/válida/);const other=fixture();other.data.bankEntries=[{...entry,amountCents:12000}];await assert.rejects(()=>reconcileEntry(other,entry.id,'ia',user),/diferentes/);assert.equal(other.data.invoices[0].status,'pendente')})
test('alert dates use Brazil timezone and notifications are deduplicated',async()=>{const db=fixture(),now=new Date('2026-10-09T01:00:00Z');const alerts=operationalAlerts(db,now);assert.ok(alerts.some(a=>a.kind==='renewal'));assert.ok(alerts.some(a=>a.kind==='overdue'));let emitted=0;await publishOperationalAlerts(db,()=>emitted++,async()=>{},now);const count=db.data.notifications.length;await publishOperationalAlerts(db,()=>emitted++,async()=>{},now);assert.equal(db.data.notifications.length,count);assert.equal(emitted,count)})
test('offline YRIA regression has no database, provider or transport writes',async()=>{const result=await runYriaRegression({},()=>{throw Error('Must not call provider')});assert.equal(result.mode,'offline');assert.equal(result.cases.length,5);assert.ok(result.cases.every(c=>c.providerOk===null));assert.equal(result.providerVerified,false);assert.ok(result.passed,JSON.stringify(result.cases))})
test('online regression distinguishes expected human handoff from provider failure',async()=>{
 const {runYriaTurn}=await import('../src/yriaCore.js')
 const evaluate=provider=>input=>runYriaTurn({...input,generate:async()=>({provider,data:{fields:{}}})})
 const good=await runYriaRegression({},evaluate({ok:true,model:'fixture-model'}),true);assert.equal(good.providerVerified,true);assert.ok(good.passed);assert.equal(good.cases.at(-1).providerOk,null);assert.equal(good.cases.at(-1).providerCalls,0);assert.equal(good.cases.reduce((n,c)=>n+c.providerCalls,0),7)
 const failed=await runYriaRegression({},evaluate({ok:false,code:'quota'}),true);assert.equal(failed.providerVerified,false);assert.ok(failed.cases.some(c=>c.providerOk===false))
})
test('regression accepts registered catalog prices but rejects invented amounts',async()=>{
 const {runYriaTurn}=await import('../src/yriaCore.js')
 const evaluate=amount=>async input=>{const r=await runYriaTurn({...input,generate:async()=>({provider:{ok:true,model:'fixture-model'},data:{fields:{}}})});return input.message.content.includes('Qual o preço?')?{...r,reply:amount+' Sujeito à confirmação de estoque pela equipe. Você prefere comprar ou alugar?'}:r}
 const registered=await runYriaRegression({},evaluate('R$ 5.800,00'),true,{catalog:[{salePrice:5800,monthlyPrice:450}]});assert.equal(registered.cases[2].passed,true)
 const invented=await runYriaRegression({},evaluate('R$ 5.900,00'),true,{catalog:[{salePrice:5800,monthlyPrice:450}]});assert.equal(invented.cases[2].passed,false)
})
test('pickup can analyze automatically and provider failure preserves photos',async t=>{
 const db=fixture(),app=express();app.use(express.json())
 const requireAuth=()=> (req,_res,next)=>{req.user=user;next()}
 let calls=0,shouldFail=false
 const service=registerCustomerRoutes(app,{database:db,requireAuth,compare:async(_db,b,a)=>{calls++;assert.equal(b.phase,'delivery');assert.equal(a.phase,'pickup');if(shouldFail)throw Object.assign(new Error('Cota indisponível'),{status:503});return {status:'completed',summary:'Conferir presencialmente',findings:[]}}})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.stop();server.close()})
 const buffer=await photo();let before=createInspection(db,{leadId:'lead-a',equipmentId:'eq',phase:'delivery'},user);await persistInspection(db,null,before);before=await addInspectionPhoto(db,before,buffer,user.id);await persistInspection(db,before,{...before,status:'completed'})
 const base=`http://127.0.0.1:${server.address().port}`
 for(const failed of [false,true]){
   shouldFail=failed
   let after=createInspection(db,{leadId:'lead-a',equipmentId:'eq',phase:'pickup',autoAnalyze:true},user);await persistInspection(db,null,after);after=await addInspectionPhoto(db,after,buffer,user.id)
   const response=await fetch(base+'/api/inspections/'+after.id+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:true,name:user.name,revision:after.revision})});assert.equal(response.status,200)
   let saved
   for(let i=0;i<50;i++){saved=db.find('inspections',r=>r.id===after.id);if(['completed','failed'].includes(saved.analysis?.status))break;await new Promise(r=>setTimeout(r,10))}
   assert.equal(saved.analysis?.status,failed?'failed':'completed');assert.equal(saved.photos.length,1);assert.equal(saved.status,'completed')
 }
 assert.equal(calls,2)
})
test('HTTP customer/staff access, public upload limits, privacy and portal ownership',async t=>{
 const db=fixture(),app=express();app.use(express.json())
 db.data.invoices[0].kind='mensalidade'
 db.data.invoices.push({id:'pickup-a',leadId:'lead-a',contractNumber:'CA',kind:'frete_retirada',amount:130,dueDate:'2026-12-10',status:'pendente',billingDetails:{private:'internal'}},{id:'other-customer',leadId:'lead-b',kind:'frete_retirada',amount:999,dueDate:'2026-12-10',status:'pendente'})
 const requireAuth=(roles=[]) => (req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.status(401).json({error:'auth'});req.user={...user,role:req.headers['x-test-role']||'admin'};if(roles.length&&!roles.includes(req.user.role))return res.status(403).json({error:'role'});next()}
 const service=registerCustomerRoutes(app,{database:db,requireAuth,renderContract:c=>c.id,origin:()=> 'https://crm.example.test'})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.stop();server.close()})
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer test','Content-Type':'application/json'}
 assert.equal((await fetch(base+'/api/inspections')).status,401)
 const created=await fetch(base+'/api/inspections',{method:'POST',headers,body:JSON.stringify({leadId:'lead-a',equipmentId:'eq',phase:'delivery'})});assert.equal(created.status,201);const row=await created.json()
 const linked=await fetch(base+'/api/inspections/'+row.id+'/link',{method:'POST',headers,body:'{}'});const issued=await linked.json();const token=issued.url.split('/').at(-1)
 const pub=await fetch(base+'/api/public-inspections/'+token);assert.equal(pub.headers.get('cache-control'),'no-store');const safe=await pub.json();assert.equal(safe.access,undefined);assert.equal(safe.leadId,undefined)
 const p=await fetch(base+'/api/clients/lead-a/portal-link',{method:'POST',headers,body:'{}'});const pt=(await p.json()).url.split('/').at(-1);const result=await(await fetch(base+'/api/client-portal/'+pt)).json();assert.equal(result.client.notes,undefined);assert.equal(result.contracts.length,1);assert.equal((await fetch(base+'/api/client-portal/'+pt+'/contracts/not-mine/html')).status,404)
 assert.equal(result.invoices.length,2);assert.equal(result.invoices.find(i=>i.id==='ia').kind,'mensalidade');const pickup=result.invoices.find(i=>i.id==='pickup-a');assert.equal(pickup.kind,'frete_retirada');assert.equal(pickup.amount,130);assert.equal(pickup.dueDate,'2026-12-10');assert.equal(pickup.billingDetails,undefined)
 assert.equal((await fetch(base+'/api/client-operations',{headers:{...headers,'x-test-role':'tecnico'}})).status,403)
 const fd=new FormData();fd.append('photo',new Blob([await photo()],{type:'image/jpeg'}),'test.jpg');fd.append('accepted','true');const uploaded=await fetch(base+'/api/public-inspections/'+token+'/photos',{method:'POST',body:fd});assert.equal(uploaded.status,201);const saved=await uploaded.json();assert.equal(saved.photos.length,1);assert.equal(saved.photos[0].localData,undefined)
 assert.equal((await fetch(base+'/api/public-inspections/'+token+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:false,name:'Cliente Teste A',revision:saved.revision})})).status,409)
 await fetch(base+'/api/inspections/'+row.id+'/link',{method:'DELETE',headers});assert.equal((await fetch(base+'/api/public-inspections/'+token)).status,404)
})
