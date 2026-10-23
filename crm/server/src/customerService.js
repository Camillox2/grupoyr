import multer from 'multer'
import { createHash } from 'node:crypto'
import { commitCommercialRecords } from './commercialCommit.js'
import { compressPhoto, fail, newId, short } from './inspections.js'
import { localDay, publishOperationalAlerts } from './clientOperations.js'

const statuses = new Set(['open', 'in_progress', 'scheduled', 'resolved'])
const types = new Set(['question', 'maintenance', 'payment', 'renewal', 'withdrawal'])
export const safeReceipt = row => ({id:row.id,invoiceId:row.invoiceId,contractNumber:row.contractNumber,fileName:row.fileName,mimeType:row.mimeType,size:row.size,reviewStatus:row.reviewStatus,createdAt:row.createdAt,requestId:row.requestId})
export function safeServiceRequest(row) {
  return {
    id: row.id, type: row.type, message: row.message, status: row.status,
    createdAt: row.createdAt, updatedAt: row.updatedAt, contractId: row.contractId,
    contractNumber: row.contractNumber, requestedDate: row.requestedDate,
    requestedMonths: row.requestedMonths, scheduledDate: row.scheduledDate,
    assignedName: row.assignedName, response: row.response, decision: row.decision || 'pending',
    receiptId: row.receiptId, invoiceId: row.invoiceId, revision: row.revision || 0,
    history: (row.history || [{at:row.createdAt,status:'open'}]).map(event => ({
      at:event.at,status:event.status,response:event.response,assignedName:event.assignedName,
      scheduledDate:event.scheduledDate,decision:event.decision,
    })),
  }
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
  new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value
const activity = (db, leadId) => {
  const old = db.find('customerActivity', r => r.id === leadId)
  return {collection:'customerActivity',expected:old || null,data:{
    id:leadId,revision:(old?.revision || 0)+1,updatedAt:new Date().toISOString(),
  }}
}
function limitRequests(db, leadId) {
  if (db.filter('serviceRequests',r=>r.leadId===leadId && Date.parse(r.createdAt)>Date.now()-86400000).length>=5)
    fail('Limite de 5 solicitações por dia. Entre em contato com a equipe.',429)
}
export function newServiceRequest(db, lead, input) {
  const type=input.type, message=short(input.message,1000),at=new Date().toISOString()
  if (!types.has(type) || message.length<5) fail('Selecione o assunto e descreva a solicitação.')
  limitRequests(db,lead.id)
  let contract=null,requestedDate='',requestedMonths=null
  if (['renewal','withdrawal'].includes(type)) {
    contract=db.find('contracts',c=>c.id===input.contractId && c.leadId===lead.id)
    if (!contract || contract.type!=='locacao' || contract.status!=='assinado')
      fail('Selecione uma locação assinada deste cliente.')
    requestedDate=String(input.requestedDate || '')
    if (!validDate(requestedDate) || requestedDate<localDay()) fail('Escolha uma data desejada válida, a partir de hoje.')
    if (type==='renewal') {
      requestedMonths=Number(input.requestedMonths)
      if (!Number.isInteger(requestedMonths) || requestedMonths<1 || requestedMonths>36)
        fail('Informe de 1 a 36 meses desejados para a renovação.')
    }
    if (db.find('serviceRequests',r=>r.leadId===lead.id && r.contractId===contract.id && r.type===type && r.status!=='resolved'))
      fail('Já existe um pedido desse tipo em andamento para este contrato.',409)
  }
  return {
    id:newId('request'),leadId:lead.id,type,message,status:'open',createdAt:at,
    revision:1,decision:'pending',contractId:contract?.id || null,
    contractNumber:contract?.number || '',requestedDate,requestedMonths,
    history:[{at,status:'open',decision:'pending'}],
  }
}

export async function changeServiceRequest(db, old, input, user) {
  if (Number(input.revision)!==(old.revision || 0)) fail('A solicitação mudou. Atualize antes de salvar.',409)
  const status=input.status,response=short(input.response,1000),at=new Date().toISOString()
  if (!statuses.has(status) || old.status==='resolved') fail('Esta solicitação não aceita essa alteração.',409)
  const assignee=input.assignedTo ? db.find('users',u=>u.id===input.assignedTo && ['admin','vendedor'].includes(u.role)) : null
  if (input.assignedTo && !assignee) fail('Selecione um responsável da equipe comercial.')
  if (status!=='open' && !response) fail('Escreva uma resposta visível ao cliente.')
  const next={...structuredClone(old),status,response,updatedAt:at,revision:(old.revision || 0)+1,
    assignedTo:assignee?.id || old.assignedTo || user.id,
    assignedName:assignee?.name || old.assignedName || user.name || 'Equipe YR'}
  const changes=[]
  if (input.scheduledDate && (status==='scheduled' || old.scheduledDate)) {
    if (!validDate(input.scheduledDate) || input.scheduledDate<localDay()) fail('Informe uma data de agendamento válida, a partir de hoje.')
    next.scheduledDate=input.scheduledDate
  }
  const approval=['renewal','withdrawal'].includes(old.type)
  if (approval && input.decision && input.decision!=='pending') {
    if (old.decision && old.decision!=='pending') fail('Este pedido já teve uma decisão registrada.',409)
    if (!['approved','declined'].includes(input.decision) || input.confirmed!==true || !response)
      fail('Confirme a decisão e escreva a resposta ao cliente.')
    next.decision=input.decision;next.decidedAt=at;next.decidedBy=user.id
    if (input.decision==='approved') {
      const contract=db.find('contracts',c=>c.id===old.contractId && c.leadId===old.leadId && c.status==='assinado' && c.type==='locacao')
      if (!contract || !next.scheduledDate || status!=='scheduled') fail('Confira a locação e informe o dia para aprovar e agendar.')
      const event={
        title:short((old.type==='withdrawal'?'Retirada aprovada · ':'Formalizar renovação · ')+contract.number,100),
        type:old.type==='withdrawal'?'retirada':'compromisso',date:next.scheduledDate,
        leadId:old.leadId,contractId:contract.id,equipmentId:contract.equipmentIds?.length===1?contract.equipmentIds[0]:null,
        notes:short(response,600),status:'scheduled',assignedTo:next.assignedTo,
        startTime:null,endTime:null,endDate:null,invoiceId:null,
        id:newId('event'),createdAt:at,createdBy:user.id,serviceRequestId:old.id,
      }
      next.calendarEventId=event.id
      changes.push({collection:'calendarEvents',expected:null,data:event})
      // Compare the contract snapshot too; never renew, end, charge or release stock here.
      changes.push({collection:'contracts',expected:contract,data:contract})
    } else if (status!=='resolved') fail('Um pedido não aprovado deve ser concluído com a resposta da equipe.')
  }
  if (approval && next.decision==='pending' && ['scheduled','resolved'].includes(status))
    fail('Registre aprovação ou recusa antes de agendar ou concluir este pedido.')
  if (status==='scheduled' && !next.scheduledDate) fail('Informe o dia agendado.')
  if (old.receiptId && status==='resolved') {
    const receipt=db.find('paymentReceipts',r=>r.id===old.receiptId)
    if (!receipt || !['accepted','rejected'].includes(input.receiptReview)) fail('Registre a conferência do documento. Isso não confirma o pagamento.')
    changes.push({collection:'paymentReceipts',expected:receipt,data:{
      ...receipt,reviewStatus:input.receiptReview,reviewedAt:at,reviewedBy:user.id,
    }})
  }
  if (old.calendarEventId) {
    const event=db.find('calendarEvents',e=>e.id===old.calendarEventId && e.serviceRequestId===old.id)
    if (!event || event.status==='cancelled') fail('O compromisso da agenda foi alterado. Confira o agendamento antes de atualizar.',409)
    changes.push({collection:'calendarEvents',expected:event,data:{...event,date:next.scheduledDate || event.date,assignedTo:next.assignedTo,notes:response,status:status==='resolved'?'done':event.status,updatedAt:at}})
  }
  if (status==='resolved') {next.resolvedAt=at;next.resolvedBy=user.id}
  next.history=[...(old.history || [{at:old.createdAt,status:'open'}]),{
    at,status,response,assignedName:next.assignedName,scheduledDate:next.scheduledDate,
    decision:next.decision,by:user.id,
  }]
  changes.push({collection:'serviceRequests',expected:old,data:next})
  await commitCommercialRecords(db,changes)
  return next
}

export async function prepareReceipt(file) {
  if (!file?.buffer?.length) fail('Selecione um comprovante em foto ou PDF.')
  if (file.buffer.length>8*1024*1024) fail('Envie uma imagem de até 8 MB ou PDF de até 5 MB.')
  const header=file.buffer.subarray(0,1024).toString('latin1')
  if (/^%PDF-(1\.[0-9]|2\.0)/.test(header)) {
    if (file.buffer.length>5*1024*1024 || !file.buffer.subarray(-2048).includes(Buffer.from('%%EOF')))
      fail('Envie um PDF válido de até 5 MB.')
    return {data:file.buffer,mimeType:'application/pdf',extension:'pdf'}
  }
  const image=await compressPhoto(file.buffer)
  return {data:image.data,mimeType:'image/webp',extension:'webp'}
}

export function registerCustomerServiceRoutes(app,ctx) {
  const {database:db,sales,wrap,publicGuard,portal,emit,push}=ctx
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:4}}).single('receipt')
  const notify=row=>{
    emit('customer:updated',{id:row.id})
    void publishOperationalAlerts(db,emit,push).catch(()=>console.warn('[YR] Confira as notificações de pós-venda.'))
  }
  const serialize=row=>({...row,clientName:db.find('leads',l=>l.id===row.leadId)?.name || 'Cliente'})
  app.post('/api/client-portal/:token/requests',publicGuard,wrap(async(req,res)=>{
    const lead=portal(req),row=newServiceRequest(db,lead,req.body)
    await commitCommercialRecords(db,[activity(db,lead.id),{collection:'serviceRequests',expected:null,data:row}])
    notify(row);res.status(201).json(safeServiceRequest(row))
  }))
  app.post('/api/client-portal/:token/invoices/:invoiceId/receipts',publicGuard,wrap(async(req,res)=>{
    const lead=portal(req)
    const invoice=db.find('invoices',i=>i.id===req.params.invoiceId && i.leadId===lead.id)
    if (!invoice) fail('Cobrança não encontrada.',404)
    if (!['pendente','atrasada'].includes(invoice.status)) fail('Esta cobrança não está em aberto.',409)
    limitRequests(db,lead.id)
    if (db.filter('paymentReceipts',r=>r.invoiceId===invoice.id && r.reviewStatus==='pending').length>=3)
      fail('Já existem 3 comprovantes aguardando conferência para esta cobrança.',409)
    await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(Object.assign(e,{status:422,message:'Envie um arquivo de até 8 MB.'})):resolve()))
    if (req.body.accepted!=='true') fail('Confirme que o arquivo é um comprovante, sem dados clínicos.')
    const prepared=await prepareReceipt(req.file),hash=createHash('sha256').update(prepared.data).digest('hex')
    const id='receipt_'+createHash('sha256').update(invoice.id+':'+hash).digest('hex').slice(0,32)
    if (db.find('paymentReceipts',r=>r.id===id)) fail('Este comprovante já foi enviado para esta cobrança.',409)
    limitRequests(db,lead.id)
    if (db.filter('paymentReceipts',r=>r.invoiceId===invoice.id && r.reviewStatus==='pending').length>=3)
      fail('Já existem 3 comprovantes aguardando conferência para esta cobrança.',409)
    const at=new Date().toISOString(),row={
      id,leadId:lead.id,invoiceId:invoice.id,contractNumber:invoice.contractNumber,
      fileName:'comprovante.'+prepared.extension,mimeType:prepared.mimeType,size:prepared.data.length,
      hash,reviewStatus:'pending',createdAt:at,requestId:'request_'+id,
      ...(!db.pool?{localData:prepared.data.toString('base64')}:{})
    }
    const request={id:row.requestId,leadId:lead.id,type:'payment',message:short(req.body.notes,500) || 'Comprovante enviado para conferência da cobrança '+(invoice.contractNumber || invoice.id),
      status:'open',createdAt:at,revision:1,receiptId:id,invoiceId:invoice.id,history:[{at,status:'open'}]}
    await commitCommercialRecords(db,[activity(db,lead.id),
      {collection:'invoices',expected:invoice,data:invoice},
      {collection:'paymentReceipts',expected:null,data:row},
      {collection:'serviceRequests',expected:null,data:request}],
      {files:[{id,ownerId:lead.id,kind:'payment-receipt',mimeType:prepared.mimeType,fileName:row.fileName,data:prepared.data}]})
    notify(request);res.status(201).json(safeReceipt(row))
  }))
  const receiptFile=async(req,res,leadId)=>{
    const row=db.find('paymentReceipts',r=>r.id===req.params.receiptId && (!leadId || r.leadId===leadId))
    if (!row) fail('Comprovante não encontrado.',404)
    const file=db.pool?await db.getBinaryFile(row.id,{ownerId:row.leadId,kind:'payment-receipt'}):{data:Buffer.from(row.localData || '','base64')}
    if (!file?.data?.length) fail('Arquivo indisponível.',404)
    res.set('X-Content-Type-Options','nosniff').set('Referrer-Policy','no-referrer')
      .attachment(row.fileName).type(row.mimeType).send(file.data)
  }
  app.get('/api/client-portal/:token/receipts/:receiptId',publicGuard,wrap((req,res)=>receiptFile(req,res,portal(req).id)))
  app.get('/api/client-operations/receipts/:receiptId',sales,wrap((req,res)=>receiptFile(req,res)))
  app.get('/api/client-operations',sales,wrap(async(_req,res)=>res.json({
    alerts:ctx.operationalAlerts(db),entries:db.get('bankEntries'),contracts:ctx.financialByContract(db),
    invoices:db.get('invoices'),requests:db.get('serviceRequests').map(serialize),
    receipts:db.get('paymentReceipts').map(safeReceipt),
    users:db.get('users').filter(u=>['admin','vendedor'].includes(u.role)).map(u=>({id:u.id,name:u.name || 'Equipe YR'})),
    appointments:db.get('calendarEvents').filter(e=>e.serviceRequestId).map(e=>({...e,clientName:db.find('leads',l=>l.id===e.leadId)?.name || 'Cliente'})),
  })))
  app.put('/api/client-operations/requests/:id',sales,wrap(async(req,res)=>{
    const old=db.find('serviceRequests',r=>r.id===req.params.id)
    if (!old) fail('Solicitação não encontrada.',404)
    const row=await changeServiceRequest(db,old,req.body,req.user)
    notify(row);res.json(serialize(row))
  }))
  app.post('/api/client-operations/requests/:id/resolve',sales,wrap(async(req,res)=>{
    const old=db.find('serviceRequests',r=>r.id===req.params.id)
    if (!old) fail('Solicitação não encontrada.',404)
    const row=await changeServiceRequest(db,old,{revision:old.revision || 0,status:'resolved',response:'Solicitação concluída pela equipe.'},req.user)
    notify(row);res.json(serialize(row))
  }))
}
