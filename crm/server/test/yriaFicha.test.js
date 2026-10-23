import test from 'node:test'
import assert from 'node:assert/strict'
import { runYriaTurn, recoverQualification, qualificationSummary } from '../src/yriaCore.js'
import { qualificationLeadPatch, rebuildLeadQualification } from '../src/yriaLeadFacts.js'
import { createYriaResponder } from '../src/yriaResponder.js'
import { qualificationLabel, qualificationValue, mergeSheetDraft } from '../../client/src/lib/qualification.ts'
import { sanitizeLeadDetails } from '../src/leadDetails.js'
const failed = async () => ({ provider:{ok:false,code:'timeout',model:'contingencia'} })
const plain = (content,previous={}) => runYriaTurn({message:{id:'current',content},previous,generate:failed})
const transcript = [
 ['client','Oi'],['ai','Olá! Seja muito bem-vindo ao Grupo YR Hospitalar. Para começarmos, qual é o seu nome?'],
 ['client','Vitor camillo'],['ai','Qual equipamento você está procurando?'],
 ['client','Cama'],['ai','Você tem interesse em comprar ou gostaria de alugar a cama?'],
 ['client','Aluguel'],['ai','Em qual cidade será a entrega?'],
 ['client','Curitiba centro na avenida silva jardim 368'],['ai','Em qual cidade será a entrega?'],
 ['client','Curitiba'],['ai','Para quando você precisa do equipamento?'],
 ['client','Amanhã'],['ai','Por quanto tempo você pretende realizar a locação?'],
 ['client','1 mes'],
].map(([from,content],i)=>({id:'history-'+i,from,content,timestamp:new Date(Date.UTC(2026,9,8,1,14,i)).toISOString()}))

test('exact mobile report: compound city/address answer fills four fields and advances, even offline',async()=>{
 let state={},reply
 for(const content of ['Oi','Vitor camillo','Cama','Aluguel','Curitiba centro na avenida silva jardim 368']){
  const r=await plain(content,state);state=r.state;reply=r.reply
 }
 assert.equal(state.fields.name.value,'Vitor camillo')
 assert.equal(state.fields.modality.value,'locacao')
 assert.equal(state.fields.city.value,'Curitiba')
 assert.equal(state.fields.district.value,'centro')
 assert.equal(state.fields.street.value,'avenida silva jardim')
 assert.equal(state.fields.number.value,'368')
 assert.equal(state.lastAskedField,'neededAt')
 assert.doesNotMatch(reply,/qual cidade|qual bairro/i)
 assert.equal(state.fields.state,undefined)
 assert.equal(state.fields.cep,undefined)
})
test('multiple-word city and explicit bairro remain separate from address',async()=>{
 const r=await plain('Entrega em São José dos Pinhais, bairro Centro. Rua João da Silva 42',{lastAskedField:'city'})
 assert.equal(r.state.fields.city.value,'São José dos Pinhais')
 assert.equal(r.state.fields.district.value,'Centro')
 assert.equal(r.state.fields.street.value,'Rua João da Silva')
 assert.equal(r.state.fields.number.value,'42')
})
test('first turn always identifies YRIA even when model greeting omits it, then never repeats',async()=>{
 const generate=async()=>({provider:{ok:true,model:'fixture'},data:{fields:{},acknowledgement:'Seja muito bem-vindo ao Grupo YR Hospitalar.',nextQuestion:{field:'name',text:'Qual é o seu nome?'}}})
 const a=await runYriaTurn({message:{content:'Oi'},generate})
 assert.match(a.reply,/^Olá! Sou a YRIA, do atendimento do Grupo YR Hospitalar\./)
 assert.equal((a.reply.match(/\?/g)||[]).length,1)
 const b=await runYriaTurn({previous:a.state,message:{content:'Vitor camillo'},generate})
 assert.doesNotMatch(b.reply,/Sou a YRIA/)
 assert.equal(b.state.fields.name.value,'Vitor camillo')
})
test('neutral introduction does not append a model-generated virtual-assistant greeting',async()=>{
 const generate=async()=>({provider:{ok:true,model:'fixture'},data:{fields:{},acknowledgement:'Sou sua assistente virtual.',nextQuestion:{field:'name',text:'Qual é o seu nome?'}}})
 const result=await runYriaTurn({message:{content:'Oi'},generate})
 assert.match(result.reply,/^Olá! Sou a YRIA, do atendimento do Grupo YR Hospitalar\./)
 assert.doesNotMatch(result.reply,/assistente virtual|atendente virtual/i)
 assert.equal((result.reply.match(/\?/g)||[]).length,1)
})
test('legacy conversation recovers all explicit facts and address without sending or assuming prices',()=>{
 const lead={id:'test',qualificationData:{},aiEnabled:false,humanAssumedAt:'keep',addressData:{complement:'Informação manual'}}
 const result=rebuildLeadQualification(lead,transcript)
 assert.equal(result.qualificationData.fields.city.value,'Curitiba')
 assert.equal(result.name,'Vitor camillo')
 assert.equal(result.modality,'locacao')
 assert.equal(result.rentalMonths,1)
 assert.equal(result.addressData.street,'avenida silva jardim')
 assert.equal(result.addressData.number,'368')
 assert.equal(result.addressData.complement,'Informação manual')
 assert.equal(result.addressData.state,undefined)
 assert.equal(result.value,undefined);assert.equal(result.quoteItems,undefined);assert.equal(result.freight,undefined)
 assert.equal(result.aiEnabled,undefined);assert.equal(result.humanAssumedAt,undefined)
 assert.match(result.aiSummary,/Rua ou avenida: avenida silva jardim/)
 assert.match(result.aiSummary,/Compra ou locação: Locação/)
})
test('rebuilding preserves manual customer details and active checkout state',()=>{
 const state={fields:{},checkout:{step:'taxId',customer:{fullName:'Contratante Legal'}},status:'collecting_contract_data'}
 const lead={qualificationData:state,addressData:{street:'Rua conferida',number:'100'},rentalMonths:3}
 const result=rebuildLeadQualification(lead,transcript)
 assert.equal(result.addressData.street,'Rua conferida')
 assert.equal(result.addressData.number,'100')
 assert.equal(result.rentalMonths,undefined)
 assert.equal(result.qualificationData.checkout.customer.fullName,'Contratante Legal')
 assert.equal(result.qualificationData.status,'collecting_contract_data')
})
test('historic denials and agent suggestions never become customer facts',()=>{
 const messages=[
 {from:'agent',content:'Seu nome é Alice. Entrega em Curitiba, bairro Centro.'},
 {from:'client',content:'Moro em Curitiba.'},
 {from:'client',content:'Não moro em Curitiba, moro em Pinhais.'},
 ]
 const state=recoverQualification({},messages)
 assert.equal(state.fields.city.value,'Pinhais')
 assert.equal(state.fields.name,undefined)
 assert.equal(state.fields.district,undefined)
 assert.doesNotMatch(qualificationSummary(state),/equipmentInterest|neededAt|estimatedPeriod/)
})
test('lead patch fills access and rental period but does not generate quote defaults',()=>{
 const state={fields:{access:{status:'confirmed',value:'Térreo'},estimatedPeriod:{status:'confirmed',value:'2 meses'},equipmentInterest:{status:'confirmed',value:'Cama'}}}
 const p=qualificationLeadPatch({addressData:{city:'Curitiba'}},state)
 assert.equal(p.access,'terreo');assert.equal(p.rentalMonths,2);assert.equal(p.equipmentInterest,'Cama')
 assert.equal(p.quoteItems,undefined);assert.equal(p.value,undefined)
})
test('sheet reads nested qualification and translates every pending field',()=>{
 const data={fields:{equipmentInterest:{status:'confirmed',value:'Cama'},city:{status:'unknown',value:''}}}
 assert.equal(qualificationValue(data,'equipmentInterest'),'Cama')
 assert.equal(qualificationValue(data,'city'),'')
 assert.equal(qualificationValue({city:'Pinhais'},'city'),'Pinhais')
 assert.equal(qualificationLabel('name'),'Nome')
 assert.equal(qualificationLabel('equipmentInterest'),'Equipamento')
 assert.equal(qualificationLabel('neededAt'),'Quando precisa')
 assert.equal(qualificationLabel('internal_unknown_key'),'Informação adicional')
})
test('sheet receives new AI address without losing seller edits, and does not mutate props',()=>{
 const current={email:'seller@example.test',freight:'',addressData:{city:'',street:'Rua manual',number:''}}
 const incoming={email:'',freight:'80',addressData:{city:'Curitiba',street:'Avenida da IA',number:'368'}}
 const merged=mergeSheetDraft(current,incoming,new Set(['email','addressData.street']))
 assert.equal(merged.email,'seller@example.test');assert.equal(merged.addressData.street,'Rua manual')
 assert.equal(merged.addressData.city,'Curitiba');assert.equal(merged.addressData.number,'368')
 assert.equal(incoming.addressData.street,'Avenida da IA');assert.equal(current.addressData.city,'')
 const saved=sanitizeLeadDetails({...incoming,...{email:'seller@example.test'},addressData:{...incoming.addressData,...{number:'370'}}})
 assert.equal(saved.addressData.city,'Curitiba');assert.equal(saved.addressData.street,'Avenida da IA');assert.equal(saved.addressData.number,'370')
})
test('responder persists customer address and emits updated lead before next reply',async()=>{
 const data={leads:[{id:'lead',name:'Contato',phone:'000',aiEnabled:true,stage:'novo_lead',qualificationData:{turn:4,introduced:true,lastAskedField:'city',fields:{name:{status:'confirmed',value:'Vitor camillo'},equipmentInterest:{status:'confirmed',value:'Cama'},modality:{status:'confirmed',value:'locacao'}}}}],users:[],messages:[],notifications:[]}
 const database={get:k=>data[k]||[],find:(k,p)=>(data[k]||[]).find(p),filter:(k,p)=>(data[k]||[]).filter(p),getSettings:()=>({}),update:(k,id,v)=>{const i=data[k].findIndex(x=>x.id===id);return data[k][i]={...data[k][i],...v}},insert:(k,v)=>{data[k]??=[];data[k].push(v);return v}}
 const events=[],sent=[]
 const respond=createYriaResponder({database,evaluate:a=>runYriaTurn({...a,generate:failed}),emit:(k,v)=>events.push([k,v]),send:async(p,t)=>{sent.push(t);return true}})
 await respond(data.leads[0],{id:'address',content:'Curitiba centro na avenida silva jardim 368'})
 const lead=data.leads[0]
 assert.equal(lead.addressData.city,'Curitiba');assert.equal(lead.addressData.street,'avenida silva jardim');assert.equal(lead.addressData.number,'368')
 assert.match(lead.address,/368/);assert.equal(sent.length,1);assert.doesNotMatch(sent[0],/qual cidade/i)
 assert.ok(events.some(([k,v])=>k==='lead:updated'&&v.addressData.number==='368'))
})
