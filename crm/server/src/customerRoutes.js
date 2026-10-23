import multer from 'multer'
import { commitCommercialRecords } from './commercialCommit.js'
import { PHOTO_LIMIT, newId, short, fail, digest, createInspection, safeInspection, issueAccess, validAccess, addInspectionPhoto, readInspectionPhoto, persistInspection, compareInspectionPhotos } from './inspections.js'
import { operationalAlerts, publishOperationalAlerts, newBankEntry, reconcileEntry, financialByContract, runYriaRegression } from './clientOperations.js'
import { getYriaConfiguration } from './yriaCore.js'
import { registerCustomerServiceRoutes, safeReceipt, safeServiceRequest } from './customerService.js'
import { inspectionReport } from './inspectionReport.js'

export function registerCustomerRoutes(app, { database, requireAuth, renderContract, emit = () => {}, push = async()=>{}, evaluate, origin = () => '', compare = compareInspectionPhotos }) {
  const auth=requireAuth(), sales=requireAuth(['admin','vendedor']), admin=requireAuth(['admin'])
  const busy=new Set(), buckets=new Map()
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:5}}).single('photo')
  const wrap=fn=>async(req,res)=>{try{await database.ready;res.setHeader('Cache-Control','no-store');await fn(req,res)}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Não foi possível concluir. Atualize e tente novamente.'})}}
  const publicGuard=(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive')
    const key=digest(String(req.params.token)+':'+req.socket.remoteAddress),now=Date.now()
    if(buckets.size>2000) for(const[k,v]of buckets)if(now-v.at>60000)buckets.delete(k)
    const item=buckets.get(key)||{at:now,count:0};if(now-item.at>60000){item.at=now;item.count=0}buckets.set(key,item)
    if(++item.count>60||buckets.size>3000)return res.status(429).json({error:'Aguarde um minuto antes de tentar novamente.'})
    next()
  }
  const parsePhoto=(req,res,next)=>upload(req,res,e=>e?res.status(422).json({error:'Envie uma única imagem de até 8 MB.'}):next())
  const inspect=id=>{const r=database.find('inspections',r=>r.id===id);if(!r)fail('Vistoria não encontrada.',404);return r}
  const publicInspection=req=>{const r=database.get('inspections').find(r=>validAccess(r.access,req.params.token));if(!r)fail('Link inválido, revogado ou expirado.',404);return r}
  const portal=req=>{const grant=database.get('clientLinks').find(r=>validAccess(r.access,req.params.token));if(!grant)fail('Link inválido, revogado ou expirado.',404);const lead=database.find('leads',l=>l.id===grant.leadId);if(!lead)fail('Cliente indisponível.',404);return lead}
  const publicView=r=>({id:r.id,clientName:r.clientName,equipmentName:r.equipmentName,serialNumber:r.serialNumber,phase:r.phase,status:r.status,revision:r.revision,photos:safeInspection(r).photos.map(({uploadedBy,...p})=>p),completedAt:r.completedAt||null,limit:PHOTO_LIMIT,expiresAt:r.access?.expiresAt})
  const link=path=>{const base=String(origin()||'').replace(/\/$/,'');if(!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))fail('Configure a URL pública HTTPS do CRM.',503);return base+path}
  // Existing Socket.IO transport may have anonymous viewers. Do not broadcast customer data.
  const changed=row=>emit('inspection:updated',{id:row.id})
  const complete=async(row,body,user)=>{
    if(row.status!=='draft')fail('Esta vistoria já foi concluída.',409)
    if(!row.photos.length)fail('Adicione ao menos uma foto antes de concluir.')
    if(body.accepted!==true||Number(body.revision)!==row.revision)fail('Confira as fotos atuais e marque a confirmação antes de concluir.',409)
    const name=short(body.name,120);if(name.length<3)fail('Informe o nome de quem conferiu a vistoria.')
    const next={...structuredClone(row),status:'completed',revision:row.revision+1,notes:short(body.notes),completedAt:new Date().toISOString(),completion:{name,by:user,accepted:true}}
    await persistInspection(database,row,next);changed(next)
    if(next.autoAnalyze)void analyzeRow(next.id,{confirmed:true}).catch(()=>console.warn('[YR] Comparação automática não concluída; confira a vistoria.'))
    return next
  }
  app.get('/api/inspections',auth,wrap(async(req,res)=>res.json(database.get('inspections').filter(r=>!req.query.leadId||r.leadId===req.query.leadId).map(safeInspection))))
  const report=async(row,res)=>res.set('X-Content-Type-Options','nosniff').set('Referrer-Policy','no-referrer')
    .attachment('vistoria-'+row.id+'.pdf').type('application/pdf').send(await inspectionReport(database,row))
  app.get('/api/inspections/:id/report.pdf',auth,wrap((req,res)=>report(inspect(req.params.id),res)))
  app.post('/api/inspections',auth,wrap(async(req,res)=>{const row=createInspection(database,req.body,req.user);await persistInspection(database,null,row);changed(row);res.status(201).json(safeInspection(row))}))
  app.post('/api/inspections/:id/link',sales,wrap(async(req,res)=>{const row=inspect(req.params.id);if(row.status!=='draft')fail('Somente vistorias em andamento aceitam novas fotos.');const issued=issueAccess();const url=link('/vistoria/'+issued.token);const next={...row,access:issued.access,revision:row.revision+1};await persistInspection(database,row,next);res.json({url,expiresAt:issued.access.expiresAt,inspection:safeInspection(next)})}))
  app.delete('/api/inspections/:id/link',sales,wrap(async(req,res)=>{const row=inspect(req.params.id);const next={...row,access:null,revision:row.revision+1};await persistInspection(database,row,next);res.json(safeInspection(next))}))
  app.post('/api/inspections/:id/photos',auth,parsePhoto,wrap(async(req,res)=>{if(!req.file)fail('Selecione uma foto.');const row=await addInspectionPhoto(database,inspect(req.params.id),req.file.buffer,req.user.id,req.body.caption);changed(row);res.status(201).json(safeInspection(row))}))
  app.get('/api/inspections/:id/photos/:photoId',auth,wrap(async(req,res)=>{res.type('image/webp').set('X-Content-Type-Options','nosniff').send(await readInspectionPhoto(database,inspect(req.params.id),req.params.photoId))}))
  app.post('/api/inspections/:id/complete',auth,wrap(async(req,res)=>res.json(safeInspection(await complete(inspect(req.params.id),req.body,req.user.id)))))
  const analyzeRow=async(id,body)=>{
    const row=inspect(id),before=row.baselineId?inspect(row.baselineId):null
    if(row.phase!=='pickup'||row.status!=='completed'||!before||!before.photos.length||!row.photos.length)fail('Conclua a entrega e a retirada do mesmo patrimônio antes de comparar.')
    if(body.confirmed!==true)fail('Confirme o envio das fotos ao Gemini para análise.')
    if(busy.has(row.id)||row.analysis?.status==='running'&&Date.now()-Date.parse(row.analysis.startedAt)<120000)fail('Análise em andamento.',409)
    if(row.analysis?.status==='completed'&&!body.retry)return row
    busy.add(row.id)
    const running={...row,analysis:{status:'running',startedAt:new Date().toISOString()},revision:row.revision+1}
    try{
      await persistInspection(database,row,running)
      let analysis
      try{analysis=await compare(database,before,row)}catch(e){const failed={...running,analysis:{status:'failed',message:e.status?e.message:'Não foi possível analisar. Fotos preservadas.'},revision:running.revision+1};await persistInspection(database,running,failed);changed(failed);throw e}
      const done={...running,analysis,revision:running.revision+1};await persistInspection(database,running,done);changed(done);return done
    }finally{busy.delete(row.id)}
  }
  app.post('/api/inspections/:id/analyze',sales,wrap(async(req,res)=>res.json(safeInspection(await analyzeRow(req.params.id,req.body)))))
  app.post('/api/inspections/:id/review',sales,wrap(async(req,res)=>{const row=inspect(req.params.id);if(row.analysis?.status!=='completed')fail('Não há análise concluída.');if(!['confirmed','dismissed','inconclusive'].includes(req.body.decision)||short(req.body.notes).length<3)fail('Selecione a conclusão e registre a revisão humana.');const next={...row,revision:row.revision+1,analysis:{...row.analysis,humanReview:{decision:req.body.decision,notes:short(req.body.notes),by:req.user.id,at:new Date().toISOString()}}};await persistInspection(database,row,next);res.json(safeInspection(next))}))
  app.get('/api/public-inspections/:token',publicGuard,wrap(async(req,res)=>res.json(publicView(publicInspection(req)))))
  app.get('/api/public-inspections/:token/report.pdf',publicGuard,wrap((req,res)=>report(publicInspection(req),res)))
  app.get('/api/public-inspections/:token/photos/:photoId',publicGuard,wrap(async(req,res)=>res.type('image/webp').set('X-Content-Type-Options','nosniff').send(await readInspectionPhoto(database,publicInspection(req),req.params.photoId))))
  app.post('/api/public-inspections/:token/photos',publicGuard,wrap(async(req,res)=>{publicInspection(req);await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(Object.assign(e,{status:422,message:'Envie uma foto de até 8 MB.'})):resolve()));if(!req.file||req.body.accepted!=='true')fail('Confirme a orientação de privacidade e selecione uma foto.');const row=await addInspectionPhoto(database,publicInspection(req),req.file.buffer,'customer',req.body.caption);changed(row);res.status(201).json(publicView(row))}))
  app.post('/api/public-inspections/:token/complete',publicGuard,wrap(async(req,res)=>{const row=await complete(publicInspection(req),req.body,'customer');res.json({...publicView(row),message:'Vistoria recebida. As fotos estão preservadas no CRM.'})}))

  app.post('/api/clients/register',sales,wrap(async(req,res)=>{const lead=database.find('leads',l=>l.id===req.body.leadId);if(!lead||short(lead.name).length<3)fail('Selecione um lead com nome cadastrado.');const next={...lead,clientRegisteredAt:lead.clientRegisteredAt||new Date().toISOString(),clientRegisteredBy:req.user.id};await commitCommercialRecords(database,[{collection:'leads',expected:lead,data:next}]);emit('lead:updated',next);res.json(next)}))
  app.post('/api/clients/:leadId/portal-link',sales,wrap(async(req,res)=>{
    const lead=database.find('leads',l=>l.id===req.params.leadId);if(!lead)fail('Cliente não encontrado.',404)
    const issued=issueAccess(),url=link('/cliente/'+issued.token),old=database.find('clientLinks',r=>r.id===lead.id)
    await commitCommercialRecords(database,[{collection:'clientLinks',expected:old||null,data:{id:lead.id,leadId:lead.id,access:issued.access,createdBy:req.user.id}}]);res.json({url,expiresAt:issued.access.expiresAt})
  }))
  app.delete('/api/clients/:leadId/portal-link',sales,wrap(async(req,res)=>{const old=database.find('clientLinks',r=>r.id===req.params.leadId);if(old)await commitCommercialRecords(database,[{collection:'clientLinks',expected:old,data:{...old,access:null}}]);res.json({revoked:true})}))
  app.get('/api/client-portal/:token',publicGuard,wrap(async(req,res)=>{
    const lead=portal(req)
    const contracts=database.get('contracts').filter(c=>c.leadId===lead.id).map(c=>({id:c.id,number:c.number,type:c.type,status:c.status,startDate:c.startDate,endDate:c.endDate,equipmentNames:c.equipmentNames}))
    const invoices=database.get('invoices').filter(i=>i.leadId===lead.id).map(i=>({id:i.id,contractNumber:i.contractNumber,kind:['frete_retirada','mensalidade'].includes(i.kind)?i.kind:undefined,amount:i.amount,dueDate:i.dueDate,status:i.status,paidAt:i.paidAt}))
    const requests=database.get('serviceRequests').filter(r=>r.leadId===lead.id).map(safeServiceRequest)
    const receipts=database.get('paymentReceipts').filter(r=>r.leadId===lead.id).map(safeReceipt)
    res.json({client:{name:lead.name},contracts,invoices,requests,receipts,inspections:database.get('inspections').filter(r=>r.leadId===lead.id).map(r=>({...publicView(r),expiresAt:undefined})),notice:'Link pessoal: não compartilhe. Não envie dados clínicos ou fotos de pessoas. Pagamentos só são confirmados após conferência da equipe.'})
  }))
  app.get('/api/client-portal/:token/contracts/:id/html',publicGuard,wrap(async(req,res)=>{const lead=portal(req),c=database.find('contracts',c=>c.id===req.params.id&&c.leadId===lead.id);if(!c)fail('Documento não encontrado.',404);res.type('html').send(renderContract(c))}))
  app.get('/api/client-portal/:token/inspections/:id/photos/:photoId',publicGuard,wrap(async(req,res)=>{const lead=portal(req),r=inspect(req.params.id);if(r.leadId!==lead.id)fail('Foto não encontrada.',404);res.type('image/webp').send(await readInspectionPhoto(database,r,req.params.photoId))}))
  app.get('/api/client-portal/:token/inspections/:id/report.pdf',publicGuard,wrap((req,res)=>{const lead=portal(req),row=inspect(req.params.id);if(row.leadId!==lead.id)fail('Vistoria não encontrada.',404);return report(row,res)}))
  registerCustomerServiceRoutes(app,{database,auth,sales,wrap,publicGuard,portal,emit,push,operationalAlerts,financialByContract})
  app.post('/api/client-operations/entries',sales,wrap(async(req,res)=>{const entry=newBankEntry(req.body,req.user);if(database.find('bankEntries',r=>r.id===entry.id))fail('Esta transação já foi registrada.',409);await commitCommercialRecords(database,[{collection:'bankEntries',expected:null,data:entry}]);res.status(201).json(entry)}))
  app.post('/api/client-operations/entries/:id/reconcile',sales,wrap(async(req,res)=>{if(req.body.confirmed!==true)fail('Confirme a conferência do pagamento.');res.json(await reconcileEntry(database,req.params.id,req.body.invoiceId,req.user));emit('finance:updated',{})}))
  app.get('/api/yria/regression',admin,wrap(async(_req,res)=>res.json(database.get('yriaRegressionRuns').slice(0,10))))
  app.post('/api/yria/regression',admin,wrap(async(req,res)=>{
    if(busy.has('regression'))fail('Aguarde a bateria atual.',409)
    const last=database.get('yriaRegressionRuns')[0];if(last&&Date.now()-Date.parse(last.at)<30000)fail('Aguarde 30 segundos entre baterias.',429)
    const online=req.body.online===true
    if(online&&req.body.confirmed!==true)fail('Confirme o uso da cota Gemini.')
    busy.add('regression')
    try{const run=await runYriaRegression(getYriaConfiguration(database.getSettings()).published.config,evaluate,online,{catalog:database.get('equipments')});await commitCommercialRecords(database,[{collection:'yriaRegressionRuns',expected:null,data:run}]);res.json(run)}finally{busy.delete('regression')}
  }))
  const check=()=>void database.ready.then(()=>publishOperationalAlerts(database,emit,push)).catch(()=>console.warn('[YR] Não foi possível conferir alertas operacionais.'))
  const interval=setInterval(check,60000);interval.unref()
  return {check,stop:()=>clearInterval(interval)}
}
