import { createHash,randomBytes } from 'node:crypto'
import { commitCommercialRecords } from './commercialCommit.js'
import { getYriaConfiguration } from './yriaCore.js'
import { validTaxId,quoteIdentity } from './yriaCheckout.js'
import { quoteFor } from './yriaSales.js'
import { resolveOrderFreight } from './freightQuote.js'
import { addressLine } from './leadDetails.js'
import { contractBillingPlan, pickupFreightDate } from './contractFreight.js'
import { aiControlRevision, yriaReplyAllowed } from './yriaControl.js'
const brl=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const copy=v=>structuredClone(v)
function addMonths(date,n){
  const d=new Date(date+'T12:00:00Z'),day=d.getUTCDate()
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n)
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()
  d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)
}
export function automationReadiness(settings={}){
  const c=settings.company||{},issues=[]
  if(!c.name||!validTaxId(c.cnpj)||String(c.cnpj).replace(/[.\/-]/g,'').length!==14)issues.push('Razão social e CNPJ válido da empresa')
  if(String(c.address||'').length<10||!/\d/.test(c.address||''))issues.push('Endereço completo da empresa, com número')
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email||''))issues.push('E-mail da empresa')
  if(!(settings.freightRates||[]).length&&!(settings.freightProvider?.enabled&&settings.freightProvider?.approvedService&&(settings.freightProvider?.token||process.env.MELHOR_ENVIO_TOKEN)&&settings.freightProvider?.sandbox===false))issues.push('Tabela de frete ou API de produção autorizada')
  return {ready:!issues.length,issues}
}
export function createAutomaticContractService({database,getPublicUrl,emit=()=>{},quoteFreight=resolveOrderFreight,now=()=>new Date()}){
  let serial=Promise.resolve()
  const exclusive=fn=>{const task=serial.then(fn,fn);serial=task.catch(()=>{});return task}
  const fulfill=({leadId,automation,state,inReplyToMessageId,inReplyToMessageIds=[]})=>exclusive(async()=>{
    await database.ready
    const settings=database.getSettings(),config=getYriaConfiguration(settings).published.config
    if(config.automaticContractsEnabled!==true||config.assistedSalesEnabled!==true)throw Error('Geração automática desativada.')
    const readiness=automationReadiness(settings)
    if(!readiness.ready)throw Error('Configuração pendente: '+readiness.issues.join('; ')+'.')
    const base=String(getPublicUrl()||'').replace(/\/+$/,'')
    if(!/^https:\/\/[^/\s]+(?::\d+)?$/.test(base))throw Error('Endereço público seguro do CRM indisponível.')
    const lead=database.find('leads',l=>l.id===leadId)
    if(!lead||!lead.phone)throw Error('Contato indisponível.')
    const controlRevision=aiControlRevision(lead)
    if(!automation?.attemptId||!automation.customer||!automation.quote)throw Error('Confirmação incompleta.')
    const operation=createHash('sha256').update(leadId+':'+automation.attemptId).digest('hex').slice(0,24),id='ctr_auto_'+operation,messageId='msg_contract_'+operation
    const found=database.find('contracts',c=>c.id===id)
    if(found){
      if(!yriaReplyAllowed(database,leadId,controlRevision,'awaiting_signature'))throw Error('Atendimento já assumido ou pausado.')
      if(found.leadId!==leadId||found.status!=='pendente_assinatura')throw Error('Contrato indisponível.')
      const message=database.find('messages',m=>m.id===messageId)
      if(!message)throw Error('Contrato já existe; confira o envio com um vendedor.')
      return{contract:found,message,reply:message.content,state:database.find('leads',l=>l.id===leadId).qualificationData,reused:true}
    }
    if(!yriaReplyAllowed(database,leadId,controlRevision))throw Error('Atendimento já assumido ou pausado.')
    const confirmationAge=now()-new Date(automation.confirmedAt)
    if(!Number.isFinite(confirmationAge)||confirmationAge<0||confirmationAge>5*60000)throw Error('Confirmação vencida.')
    if(database.find('contracts',c=>c.leadId===leadId&&c.status==='pendente_assinatura'))throw Error('Este cliente já tem contrato aguardando assinatura. O vendedor deve conferir antes de gerar outro.')
    const customer=automation.customer,q=automation.quote
    if(q.freightBillingVersion!==3)throw Error('As condições de cobrança do frete mudaram. Confirme uma nova cotação antes de gerar o contrato.')
    if(!validTaxId(customer.taxId)||String(customer.access).replace(/[.! ]/g,'')!=='terreo'||!customer.fullName||!customer.email||!customer.street||!customer.number||!customer.city||!customer.state||!/^\d{8}$/.test(customer.cep)||!/^\d{4}-\d{2}-\d{2}$/.test(customer.deliveryDate)||customer.deliveryDate<now().toISOString().slice(0,10)||!Number.isInteger(q.quantity)||q.quantity<1||q.quantity>10)throw Error('Dados do cliente incompletos.')
    const equipment=database.find('equipments',e=>e.id===q.equipmentIds[0])
    if(!equipment)throw Error('Equipamento não está mais disponível.')
    const freight=await quoteFreight({equipment,units:q.equipmentIds.slice(0,q.quantity).map(id=>database.find('equipments',e=>e.id===id)),quantity:q.quantity,customer,modality:q.modality,settings})
    if(!freight||freight.sandbox)throw Error('Frete de produção indisponível.')
    const current=quoteFor(state,database.get('equipments'),q.quantity,settings.freightRates||[],freight)
    if(current.error||quoteIdentity(current.quote)!==automation.fingerprint)throw Error('Estoque, preço ou frete mudou. Um vendedor precisa recotar antes de gerar o contrato.')
    // Check again after a potentially slow carrier request.
    const latest=database.find('leads',l=>l.id===leadId)
    if(!yriaReplyAllowed(database,leadId,controlRevision)||getYriaConfiguration(database.getSettings()).published.config.automaticContractsEnabled!==true)throw Error('Atendimento ou configuração mudou durante a conferência.')
    const chosen=q.equipmentIds.slice(0,q.quantity).map(eqId=>database.find('equipments',e=>e.id===eqId))
    if(chosen.some(e=>!e||e.status!=='disponivel'||e.reservationContractId))throw Error('Estoque não está mais disponível.')
    const createdAt=now().toISOString(),reservationExpiresAt=new Date(now().getTime()+24*3600000).toISOString(),number='CTR-'+now().getUTCFullYear()+'-AUTO-'+operation.slice(0,10).toUpperCase()
    const addressData={cep:customer.cep,street:customer.street,number:customer.number,complement:customer.complement,district:customer.district,city:customer.city,state:customer.state}
    const monthlyValue=q.unitCents*q.quantity/100
    const contract={id,number,leadId,clientName:customer.fullName,clientCpf:customer.taxId,clientEmail:customer.email,clientPhone:lead.phone,address:addressLine(addressData),type:q.modality==='locacao'?'locacao':'venda',equipmentIds:chosen.map(e=>e.id),equipmentNames:chosen.map(e=>e.name+' (Patr. '+e.serialNumber+')').join(', '),startDate:customer.deliveryDate,endDate:q.modality==='locacao'?addMonths(customer.deliveryDate,q.months):customer.deliveryDate,monthlyValue,rentalMonths:q.modality==='locacao'?q.months:null,customClauses:'Quantidade: '+q.quantity+'. Valor unitário: '+brl(q.unitCents)+(q.modality==='locacao'?' por mês.':'.')+' Frete entrega: '+brl(freight.deliveryCents)+'. Retirada: '+brl(freight.pickupCents)+'. Total previsto: '+brl(q.totalCents)+'. Frete: '+freight.basis+'. Acesso declarado: térreo. Data solicitada pelo cliente; disponibilidade e execução da entrega dependem da logística. Reserva por até 24 horas, sem confirmar pagamento.',status:'pendente_assinatura',signedAt:null,signerIp:null,signatureDataUrl:null,documentHash:null,signingToken:randomBytes(32).toString('base64url'),createdAt,automatic:true,automationAttemptId:automation.attemptId,reservationExpiresAt,freightQuote:freight,quoteSnapshot:q,paymentStatus:'pendente'}
    const nextState={...state,status:'awaiting_signature',checkout:{...state.checkout,contractId:id,contractNumber:number}}
    contract.companySnapshot=copy(settings.company)
    contract.freightDetailsVersion=1
    contract.deliveryFreight=freight.deliveryCents/100
    contract.pickupFreight=freight.pickupCents/100
    contract.freightBillingVersion=3
    if(freight.pickupCents>0)contract.pickupFreightDueDate=pickupFreightDate(contract)
    contract.billingSchedule=contractBillingPlan(contract)
    const updatedLead={...latest,name:customer.fullName,cpf:customer.taxId,email:customer.email,addressData,address:contract.address,access:'terreo',rentalMonths:q.modality==='locacao'?q.months:0,deliveryDate:customer.deliveryDate,deliveryStatus:'solicitada',quoteItems:[{product:q.product,productCode:q.productCode,modality:q.modality,qty:q.quantity,unitPrice:q.unitCents/100}],deliveryFreight:freight.deliveryCents/100,pickupFreight:freight.pickupCents/100,pickupFreightDueDate:contract.pickupFreightDueDate||'',freight:(freight.deliveryCents+freight.pickupCents)/100,value:monthlyValue,stage:'contrato_gerado',aiEnabled:false,aiHandoffReason:'awaiting_signature',qualificationData:nextState,notes:'Contrato '+number+' gerado automaticamente após confirmação explícita. Assinatura, pagamento e logística pendentes.'}
    const reply='Seu contrato '+number+' foi gerado com os dados e valores que você confirmou. Confira o documento e, se estiver de acordo, assine pelo link:\n'+base+'/assinar/'+encodeURIComponent(contract.signingToken)+'\nOs itens ficam reservados por até 24 horas enquanto aguardam assinatura. Pagamento e entrega ainda não estão confirmados. Se precisar corrigir algo, o responsável continuará por aqui.'
    const message={id:messageId,leadId,from:'ai',type:'text',kind:'contract_link',content:reply,modelUsed:'automacao-validada',inReplyToMessageId,inReplyToMessageIds,deliveryStatus:'prepared',timestamp:createdAt}
    const changes=[{collection:'leads',expected:copy(latest),data:updatedLead},{collection:'contracts',expected:null,data:contract},{collection:'messages',expected:null,data:message}]
    for(const e of chosen)changes.push({collection:'equipments',expected:copy(e),data:{...e,status:'reservado',reservationContractId:id,reservationExpiresAt,currentLeadId:leadId,currentClientName:customer.fullName}})
    for(const charge of contract.billingSchedule)changes.push({collection:'invoices',expected:null,data:{id:'inv_auto_'+operation+'_'+(charge.installment-1),contractNumber:number,clientName:customer.fullName,leadId,amount:charge.amount,dueDate:charge.dueDate,status:'pendente',paidAt:null,kind:charge.kind,billingDetails:{...charge},freightBillingVersion:3,automatic:true}})
    await commitCommercialRecords(database,changes)
    emit('contract:new',contract);emit('lead:updated',updatedLead)
    for(const e of chosen)emit('equipment:updated',database.find('equipments',v=>v.id===e.id))
    return{contract,message,reply,state:nextState,reused:false}
  })
  const delivery=({messageId,contractId,status})=>exclusive(async()=>{
    const m=database.find('messages',v=>v.id===messageId),c=database.find('contracts',v=>v.id===contractId)
    if(!m||!c)throw Error('Registro de envio não encontrado.')
    if(!['sending','sent','pending_connection','delivery_unknown','cancelled'].includes(status))throw Error('Estado de entrega inválido.')
    if(status==='sending'&&m.deliveryStatus!=='prepared')throw Error('Envio já iniciado; confira a entrega antes de reenviar manualmente.')
    if(status==='cancelled'&&!['prepared','sending'].includes(m.deliveryStatus))throw Error('Transição de envio inválida.')
    if(!['sending','cancelled'].includes(status)&&m.deliveryStatus!=='sending')throw Error('Transição de envio inválida.')
    const msg={...m,deliveryStatus:status}
    const changes=[{collection:'messages',expected:copy(m),data:msg}]
    if(status==='sent')changes.push({collection:'contracts',expected:copy(c),data:{...c,linkSentAt:now().toISOString(),linkSentBy:'yria'}})
    await commitCommercialRecords(database,changes);emit('message:updated',msg)
    return msg
  })
  const expire=()=>exclusive(async()=>{
    const expired=database.filter('contracts',c=>c.automatic&&c.status==='pendente_assinatura'&&c.reservationExpiresAt&&c.reservationExpiresAt<now().toISOString())
    for(const c of expired){
      const changes=[{collection:'contracts',expected:copy(c),data:{...c,status:'cancelado',statusReason:'Prazo de reserva automática expirado sem assinatura.',statusChangedAt:now().toISOString()}}]
      const lead=database.find('leads',l=>l.id===c.leadId)
      if(lead?.qualificationData?.checkout?.contractId===c.id)changes.push({collection:'leads',expected:copy(lead),data:{...lead,stage:'proposta_enviada',aiEnabled:false,aiHandoffReason:'reservation_expired',qualificationData:{...lead.qualificationData,status:'needs_review'},notes:'Reserva do contrato '+c.number+' expirada. O vendedor deve recotar.'}})
      for(const e of database.filter('equipments',e=>e.reservationContractId===c.id&&e.status==='reservado'))changes.push({collection:'equipments',expected:copy(e),data:{...e,status:'disponivel',reservationContractId:null,reservationExpiresAt:null,currentLeadId:null,currentClientName:null}})
      for(const i of database.filter('invoices',i=>i.contractNumber===c.number&&['pendente','atrasada'].includes(i.status)))changes.push({collection:'invoices',expected:copy(i),data:{...i,status:'cancelada',cancelledAt:now().toISOString()}})
      await commitCommercialRecords(database,changes);emit('contract:updated',database.find('contracts',v=>v.id===c.id))
      for(const r of changes.filter(r=>r.collection==='equipments'))emit('equipment:updated',r.data)
    }
    return expired.length
  })
  return{fulfill,delivery,expire}
}
