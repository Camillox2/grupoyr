import { commitCommercialRecords } from './commercialCommit.js'
import { newId, short, fail, digest } from './inspections.js'
import { runYriaTurn } from './yriaCore.js'

export const localDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(now)
const dayNumber = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? Date.parse(value + 'T12:00:00Z') / 86400000 : NaN
export function operationalAlerts(database, now = new Date()) {
  const today = dayNumber(localDay(now)), alerts = []
  const add = (kind, id, date, title, leadId, detail) => alerts.push({ id: `${kind}:${id}:${date}`, kind, date, title, leadId: leadId || null, detail })
  for (const c of database.get('contracts')) {
    const remaining = dayNumber(c.endDate) - today
    if (c.type === 'locacao' && c.status === 'assinado' && remaining >= -7 && remaining <= 7) add('renewal', c.id, c.endDate, remaining < 0 ? 'Locação vencida: organizar retirada ou renovação' : 'Locação próxima do término', c.leadId, `${c.number} · ${c.clientName} · ${c.endDate}`)
  }
  for (const i of database.get('invoices')) {
    const c = database.get('contracts').find(c => c.number === i.contractNumber)
    if (['pendente','atrasada'].includes(i.status) && dayNumber(i.dueDate) < today && (!c || c.status === 'assinado')) add('overdue', i.id, i.dueDate, 'Pagamento vencido', i.leadId, `${i.clientName} · ${Number(i.amount || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · ${i.dueDate}`)
  }
  for (const e of database.get('calendarEvents')) {
    const days = dayNumber(e.date) - today
    if (['scheduled','pending'].includes(e.status) && days >= 0 && days <= 2 && ['entrega','retirada','manutencao','cobranca'].includes(e.type)) add(e.type, e.id, e.date, e.title, e.leadId, `${e.date} ${e.startTime || ''} · ${e.notes || ''}`)
  }
  for (const e of database.get('equipments')) {
    const days = dayNumber(e.nextMaintenanceAt) - today
    if (days <= 7 && days >= -30 && e.status !== 'vendido') add('maintenance', e.id, e.nextMaintenanceAt, 'Manutenção preventiva', null, `${e.name} · ${e.serialNumber} · ${e.nextMaintenanceAt}`)
  }
  for (const r of database.get('serviceRequests')) if (r.status !== 'resolved') add('request', r.id, r.createdAt.slice(0,10), 'Solicitação do cliente', r.leadId, r.message)
  return alerts.sort((a,b) => a.date.localeCompare(b.date))
}
export async function publishOperationalAlerts(database, emit, push, now = new Date()) {
  for (const alert of operationalAlerts(database, now)) {
    const lead = database.find('leads', l => l.id === alert.leadId)
    const recipients = database.get('users').filter(u => u.role === 'admin' || u.id === lead?.assignedTo)
    for (const user of recipients) {
      const id = 'operation_' + digest(alert.id + ':' + user.id).slice(0,32)
      if (database.find('notifications', n => n.id === id)) continue
      const item = { id, recipientId: user.id, leadId: alert.leadId, kind: 'operation_alert', title: alert.title, message: short(alert.detail), createdAt: now.toISOString(), readAt: null }
      await commitCommercialRecords(database, [{collection:'notifications',expected:null,data:item}])
      emit('notification:new',{id,recipientId:user.id})
      void push(user.id,{title:item.title,body:item.message,url:alert.leadId?'/?leadId='+encodeURIComponent(alert.leadId):'/',tag:id}).catch(()=>{})
    }
  }
}
export function financialByContract(database) {
  return database.get('contracts').map(c => {
    const invoices = database.get('invoices').filter(i => i.contractNumber === c.number)
    const received = invoices.filter(i => i.status === 'paga').reduce((s,i) => s + Math.round(Number(i.amount || 0)*100),0)
    const costs = database.get('contractExpenses').filter(e => e.contractId === c.id).reduce((s,e) => s + Math.round(Number(e.amount || 0)*100),0)
    const pending = invoices.filter(i => ['pendente','atrasada'].includes(i.status)).reduce((s,i) => s + Math.round(Number(i.amount || 0)*100),0)
    return {id:c.id,number:c.number,clientName:c.clientName,status:c.status,receivedCents:received,pendingCents:pending,costCents:costs,netCents:received-costs}
  })
}
export function newBankEntry(input, user) {
  const reference = short(input.reference,120), source = short(input.source,80), amountCents = Number(input.amountCents), date = short(input.date,10)
  if (!reference || !source || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 10000000000 || !Number.isFinite(dayNumber(date)) || new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date) fail('Informe banco/origem, identificador único, data válida e valor positivo.')
  return {id:'bank_'+digest(source.toLowerCase()+':'+reference).slice(0,32),source,reference,amountCents,date,description:short(input.description,300),status:'pending',createdAt:new Date().toISOString(),createdBy:user.id}
}
export async function reconcileEntry(database, entryId, invoiceId, user) {
  const entry = database.find('bankEntries',e=>e.id===entryId), invoice = database.find('invoices',i=>i.id===invoiceId)
  if (!entry || !invoice) fail('Movimentação ou cobrança não encontrada.',404)
  if (entry.status !== 'pending' || !['pendente','atrasada'].includes(invoice.status)) fail('Esta movimentação ou cobrança já foi conciliada/cancelada.',409)
  if (entry.amountCents !== Math.round(Number(invoice.amount)*100)) fail('Os valores são diferentes. Esta conciliação aceita somente pagamento integral.')
  const c = database.get('contracts').find(c=>c.number===invoice.contractNumber)
  if (c && c.status !== 'assinado') fail('Confirme a situação do contrato antes de conciliar.')
  const at = new Date().toISOString()
  const audit = {id:newId('reconciliation'),entryId,invoiceId,amountCents:entry.amountCents,by:user.id,at}
  await commitCommercialRecords(database,[{collection:'bankEntries',expected:entry,data:{...entry,status:'reconciled',invoiceId,reconciledAt:at,reconciledBy:user.id}},{collection:'invoices',expected:invoice,data:{...invoice,status:'paga',paidAt:entry.date+'T12:00:00.000Z',reconciliationId:audit.id}},{collection:'reconciliations',expected:null,data:audit}])
  return audit
}

export async function runYriaRegression(config, evaluate, online = false, {catalog=[]} = {}) {
  const registeredPrices=new Set(catalog.flatMap(p=>[p.salePrice,p.monthlyPrice]).map(v=>Math.round(Number(v)*100)).filter(v=>Number.isSafeInteger(v)&&v>0))
  const hasInventedPrice=reply=>[...String(reply).matchAll(/R\$\s*([\d.]+,\d{2})/g)].some(m=>!registeredPrices.has(Math.round(Number(m[1].replace(/\./g,'').replace(',','.'))*100)))
  const cases = [
    {name:'Apresentação e pergunta única',messages:['Oi'],check:r=>/^Olá! Sou a YRIA/.test(r.reply)&&(r.reply.match(/\?/g)||[]).length===1},
    {name:'Nome, modalidade e endereço composto sem repetição',messages:['Oi','Vitor Camillo','Cama','Aluguel','Curitiba centro na avenida silva jardim 368'],check:r=>r.state.fields.city?.value==='Curitiba'&&r.state.fields.district?.value.toLowerCase()==='centro'&&r.state.fields.number?.value==='368'&&r.state.fields.modality?.value==='locacao'&&!/qual cidade|qual bairro/i.test(r.reply)},
    {name:'Não inventar preço, prazo ou estoque',messages:['Oi','Qual o preço? Tem cama disponível agora?'],check:r=>!hasInventedPrice(r.reply)&&!(/estoque confirmado|pronta entrega|frete gr[aá]tis|frete gratuito/i.test(r.reply))},
    {name:'Texto simples sem asteriscos',messages:['Oi','Quero alugar cama em Curitiba'],check:r=>!/\*\*/.test(r.reply)},
    {name:'Pedido de humano interrompe a qualificação',messages:['Oi','Quero falar com um atendente humano'],check:r=>r.handoff===true||r.state.status==='human_requested'},
  ]
  const results=[]
  let greeting
  for(const scenario of cases){
    let state={},messages=[],result,providerOk=true,providerCalls=0,model=null,providerFailures=[]
    for(const [index,text] of scenario.messages.entries()){
      // These scenarios share an identical greeting. Reuse the isolated snapshot
      // so the same "Oi" does not consume the Gemini RPM allowance five times.
      if(online&&index===0&&greeting){
        result=structuredClone(greeting.result);state=result.state;messages=structuredClone(greeting.messages)
        if(result.provider?.ok!==true){providerOk=false;providerFailures.push(short(result.provider?.code||'provider_error',80))}
        continue
      }
      const message={id:newId('regression'),from:'client',content:text,timestamp:new Date().toISOString()}
      result=online?await evaluate({previous:state,messages,message,config:{...config,assistedSalesEnabled:false,automaticContractsEnabled:false},sandbox:true,source:'regression'}):await runYriaTurn({previous:state,messages,message,config:{...config,assistedSalesEnabled:false,automaticContractsEnabled:false},generate:async()=>({provider:{ok:false,code:'offline_regression'}})})
      state=result.state
      if(online&&!result.provider?.skipped){providerCalls++;providerOk=providerOk&&result.provider?.ok===true;model=result.provider?.model||model;if(result.provider?.ok!==true)providerFailures.push(short(result.provider?.code||'provider_error',80))}
      messages.push(message,{id:`reply_${index}`,from:'ai',content:result.reply||''})
      if(online&&index===0)greeting=structuredClone({result,messages})
    }
    results.push({name:scenario.name,passed:scenario.check(result),providerOk:online?(providerOk?(providerCalls?true:null):false):null,providerCalls,providerFailures:[...new Set(providerFailures)],reply:result.reply,model})
  }
  return {id:newId('regression'),at:new Date().toISOString(),mode:online?'online':'offline',passed:results.every(r=>r.passed),providerVerified:online&&results.some(r=>r.providerOk===true)&&results.every(r=>r.providerOk!==false),cases:results,notice:online?'Simulações isoladas. Não enviam WhatsApp nem criam clientes, contratos ou cobranças. Consomem cota Gemini. Encaminhamentos humanos não exigem nova chamada ao provedor.':'Testes do roteiro e preenchimento local, sem consumir Gemini. Não validam respostas do modelo real.'}
}
