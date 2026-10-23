import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import sharp from 'sharp'
import {newServiceRequest,changeServiceRequest,prepareReceipt,safeServiceRequest,safeReceipt} from '../src/customerService.js'
import {registerCustomerRoutes} from '../src/customerRoutes.js'
import {commitCommercialRecords} from '../src/commercialCommit.js'
import {issueAccess,createInspection,persistInspection,addInspectionPhoto} from '../src/inspections.js'
import {inspectionReport} from '../src/inspectionReport.js'
import {localDay} from '../src/clientOperations.js'
const user={id:'admin',name:'Responsável',role:'admin'}
const fixture=()=>{
 const data={leads:[{id:'a',name:'Cliente A',notes:'PRIVATE',phone:'554100000000'},{id:'b',name:'Cliente B'}],users:[user,{id:'seller',name:'Vendedor',role:'vendedor'}],contracts:[{id:'ca',leadId:'a',number:'CA-01',type:'locacao',status:'assinado',equipmentIds:['eq'],startDate:'2026-10-01',endDate:'2026-10-31'}],invoices:[{id:'ia',leadId:'a',amount:100,status:'pendente',contractNumber:'CA-01'}],equipments:[{id:'eq',name:'Cama',serialNumber:'YR-001',status:'alugado'}],settings:{},inspections:[]}
 return {data,ready:Promise.resolve(),get:c=>data[c]||[],getSettings:()=>data.settings,find:(c,f)=>(data[c]||[]).find(f),filter:(c,f)=>(data[c]||[]).filter(f),save:()=>true,flush:async()=>{}}
}
const photo=()=>sharp({create:{width:600,height:400,channels:3,background:'#337799'}}).jpeg().toBuffer()
test('requests enforce rental ownership, explicit dates, valid periods, duplicate ongoing and daily limits',()=>{
 const db=fixture(),lead=db.data.leads[0],input={type:'renewal',message:'Renovar por favor',contractId:'ca',requestedDate:localDay(),requestedMonths:3}
 assert.throws(()=>newServiceRequest(db,db.data.leads[1],input),/deste cliente/)
 assert.throws(()=>newServiceRequest(db,lead,{...input,requestedDate:'2026-02-31'}),/válida/)
 assert.throws(()=>newServiceRequest(db,lead,{...input,requestedMonths:37}),/36/)
 const row=newServiceRequest(db,lead,input);assert.equal(row.status,'open');db.data.serviceRequests=[row]
 assert.throws(()=>newServiceRequest(db,lead,input),/andamento/)
 db.data.serviceRequests=Array.from({length:5},(_,i)=>({...row,id:'r'+i,type:'question'}))
 assert.throws(()=>newServiceRequest(db,lead,{type:'question',message:'Uma dúvida'}),/5 solicitações/)
})
test('approval creates one assigned calendar event, requires confirmation, never changes rental/invoice/stock; subsequent conclusion completes event',async()=>{
 const db=fixture(),snap=structuredClone({contracts:db.data.contracts,invoices:db.data.invoices,equipments:db.data.equipments})
 const row=newServiceRequest(db,db.data.leads[0],{type:'withdrawal',message:'Gostaria de retirar',contractId:'ca',requestedDate:localDay()});db.data.serviceRequests=[row]
 const input={revision:1,status:'scheduled',scheduledDate:localDay(),assignedTo:'seller',response:'Retirada agendada com a equipe.',decision:'approved',confirmed:true}
 await assert.rejects(()=>changeServiceRequest(db,row,{...input,confirmed:false},user),/Confirme/)
 await assert.rejects(()=>changeServiceRequest(db,row,{...input,decision:'pending'},user),/aprovação/)
 const next=await changeServiceRequest(db,row,input,user);assert.equal(db.data.calendarEvents.length,1);assert.equal(db.data.calendarEvents[0].assignedTo,'seller')
 assert.deepEqual({contracts:db.data.contracts,invoices:db.data.invoices,equipments:db.data.equipments},snap)
 await assert.rejects(()=>changeServiceRequest(db,next,input,user),/mudou/)
 await assert.rejects(()=>changeServiceRequest(db,next,{...input,revision:2},user),/decisão/)
 const done=await changeServiceRequest(db,next,{revision:2,status:'resolved',response:'Retirada realizada.'},user)
 assert.equal(db.data.calendarEvents[0].status,'done');assert.equal(done.history.length,3);assert.equal(db.data.calendarEvents.length,1)
})
test('declined rental request has visible history but no calendar event or contractual mutation',async()=>{
 const db=fixture(),row=newServiceRequest(db,db.data.leads[0],{type:'renewal',message:'Renovar por favor',contractId:'ca',requestedDate:localDay(),requestedMonths:2});db.data.serviceRequests=[row]
 const next=await changeServiceRequest(db,row,{revision:1,status:'resolved',response:'Precisamos avaliar a disponibilidade.',decision:'declined',confirmed:true},user)
 assert.equal(next.decision,'declined');assert.equal(db.get('calendarEvents').length,0);assert.equal(db.data.contracts[0].endDate,'2026-10-31')
 await assert.rejects(()=>changeServiceRequest(db,next,{revision:2,status:'open'},user),/alteração/)
})
test('receipt document review cannot mark invoice paid and customer payload excludes private IDs/binaries',async()=>{
 const db=fixture(),row={id:'r',leadId:'a',type:'payment',message:'Comprovante',revision:1,status:'open',receiptId:'p',createdAt:new Date().toISOString(),history:[]}
 db.data.serviceRequests=[row];db.data.paymentReceipts=[{id:'p',invoiceId:'ia',leadId:'a',hash:'PRIVATE',localData:'PRIVATE',reviewStatus:'pending'}]
 await assert.rejects(()=>changeServiceRequest(db,row,{revision:1,status:'resolved',response:'Documento recebido.'},user),/conferência/)
 const next=await changeServiceRequest(db,row,{revision:1,status:'resolved',response:'Documento conferido, aguardando extrato.',receiptReview:'accepted'},user)
 assert.equal(db.data.invoices[0].status,'pendente');assert.equal(db.data.paymentReceipts[0].reviewStatus,'accepted')
 assert.equal(safeServiceRequest(next).history.at(-1).by,undefined)
 for(const key of ['leadId','localData','hash','reviewedBy'])assert.equal(safeReceipt(db.data.paymentReceipts[0])[key],undefined)
})
test('receipt images are WebP and PDFs are bounded downloads; rejects SVG and malformed/oversized files',async()=>{
 const image=await prepareReceipt({buffer:await photo()});assert.equal(image.mimeType,'image/webp');assert.ok(image.data.length<=350000);assert.equal((await sharp(image.data).metadata()).exif,undefined)
 const pdf=await prepareReceipt({buffer:Buffer.from('%PDF-1.7\nQA\n%%EOF')});assert.equal(pdf.mimeType,'application/pdf')
 await assert.rejects(()=>prepareReceipt({buffer:Buffer.from('%PDF-1.7 bad')}),/PDF válido/)
 await assert.rejects(()=>prepareReceipt({buffer:Buffer.from('<svg>bad</svg>')}),/JPG|fotografia/)
 await assert.rejects(()=>prepareReceipt({buffer:Buffer.alloc(9*1024*1024)}),/8 MB/)
})
test('SQL binary and receipt metadata roll back together; failed persistence never installs a success',async()=>{
 const db=fixture(),calls=[];db.pool={connect:async()=>({query:async(sql)=>{calls.push(sql);if(sql.startsWith('SELECT data'))return{rows:[]};if(sql.startsWith('INSERT INTO crm_records'))throw Error('fixture SQL failure');return{rows:[]}},release(){}})}
 await assert.rejects(()=>commitCommercialRecords(db,[{collection:'paymentReceipts',expected:null,data:{id:'p'}}],{files:[{id:'p',ownerId:'a',kind:'payment-receipt',mimeType:'image/webp',fileName:'p.webp',data:Buffer.from('QA')}]}),/SQL failure/)
 assert.ok(calls.some(s=>s.startsWith('INSERT INTO crm_binary_files')));assert.equal(calls.at(-1),'ROLLBACK');assert.equal(db.get('paymentReceipts').length,0)
 const local=fixture();local.save=()=>false;await assert.rejects(()=>commitCommercialRecords(local,[{collection:'paymentReceipts',expected:null,data:{id:'p'}}]),/persistir/);assert.equal(local.get('paymentReceipts').length,0)
})
test('HTTP receipts enforce ownership, private attachments, duplicate prevention, role and expiry; never auto-pay',async t=>{
 const db=fixture(),app=express();app.use(express.json())
 const requireAuth=(roles=[]) => (req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.sendStatus(401);req.user={...user,role:req.headers['x-role']||'admin'};if(roles.length&&!roles.includes(req.user.role))return res.sendStatus(403);next()}
 const service=registerCustomerRoutes(app,{database:db,requireAuth,origin:()=> 'https://example.invalid'})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.stop();server.close()})
 const base='http://127.0.0.1:'+server.address().port,a=issueAccess(),b=issueAccess();db.data.clientLinks=[{id:'a',leadId:'a',access:a.access},{id:'b',leadId:'b',access:b.access}]
 const send=async(token,invoice='ia')=>{const fd=new FormData();fd.append('receipt',new Blob([await photo()],{type:'image/jpeg'}),'foto.jpg');fd.append('accepted','true');return fetch(base+'/api/client-portal/'+token+'/invoices/'+invoice+'/receipts',{method:'POST',body:fd})}
 assert.equal((await send(b.token)).status,404)
 const response=await send(a.token);assert.equal(response.status,201);const receipt=await response.json();assert.equal(receipt.localData,undefined)
 assert.equal(db.data.invoices[0].status,'pendente');assert.equal(db.get('serviceRequests').length,1)
 assert.equal((await send(a.token)).status,409)
 const file=await fetch(base+'/api/client-portal/'+a.token+'/receipts/'+receipt.id);assert.equal(file.status,200);assert.equal(file.headers.get('cache-control'),'no-store');assert.ok(file.headers.get('content-disposition').startsWith('attachment'))
 assert.equal((await fetch(base+'/api/client-portal/'+b.token+'/receipts/'+receipt.id)).status,404)
 assert.equal((await fetch(base+'/api/client-operations/receipts/'+receipt.id)).status,401)
 assert.equal((await fetch(base+'/api/client-operations/receipts/'+receipt.id,{headers:{Authorization:'Bearer test','x-role':'tecnico'}})).status,403)
 db.data.clientLinks[0].access=null;assert.equal((await fetch(base+'/api/client-portal/'+a.token+'/receipts/'+receipt.id)).status,404)
})
test('inspection PDF is scoped to equipment/customer baseline and portal ownership; unfinished PDF is explicit',async t=>{
 const db=fixture(),app=express();app.use(express.json());const requireAuth=()=> (req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.sendStatus(401);req.user=user;next()}
 const service=registerCustomerRoutes(app,{database:db,requireAuth});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.stop();server.close()})
 let row=createInspection(db,{leadId:'a',contractId:'ca',equipmentId:'eq',phase:'delivery'},user);await persistInspection(db,null,row);row=await addInspectionPhoto(db,row,await photo(),user.id,'Estrutura')
 const buffer=await inspectionReport(db,row);assert.equal(buffer.subarray(0,5).toString(),'%PDF-')
 const grant=issueAccess();db.data.clientLinks=[{id:'b',leadId:'b',access:grant.access}]
 const base='http://127.0.0.1:'+server.address().port
 assert.equal((await fetch(base+'/api/inspections/'+row.id+'/report.pdf')).status,401)
 assert.equal((await fetch(base+'/api/client-portal/'+grant.token+'/inspections/'+row.id+'/report.pdf')).status,404)
 const response=await fetch(base+'/api/inspections/'+row.id+'/report.pdf',{headers:{Authorization:'Bearer test'}});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('cache-control'),'no-store')
})

