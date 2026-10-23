import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, recoverQualification, runYriaTurn, qualificationSummary } from '../src/yriaCore.js'
import { generateYria } from '../src/yriaProvider.js'
import { FALLBACK_MODELS } from '../src/modelSequence.js'
import { createYriaResponder } from '../src/yriaResponder.js'

const showroom = [
  'Olá! Vim pelo showroom do Grupo YR Hospitalar.',
  'Equipamento: Cama manual 3 movimentos.',
  'Modalidade: Comprar.',
  'Local de uso: Clínica ou instituição.',
  'Cidade de entrega: Curitiba.',
  'Quantidade desejada: 1.',
  'Gostaria de confirmar modelo, disponibilidade, medidas e condições de entrega.',
].join('\n')
const failed = async () => ({provider:{ok:false,code:'quota',model:'gemini-3.1-flash-lite'}})
const run = (content, previous = {}, extra = {}) => runYriaTurn({previous,message:{id:'current',content},generate:failed,...extra})

test('showroom quote retains complete model, city, modality, place and explicit quantity even offline', async () => {
  const result = await run(showroom)
  assert.equal(result.state.fields.equipmentInterest.value,'Cama manual 3 movimentos')
  assert.equal(result.state.fields.city.value,'Curitiba')
  assert.equal(result.state.fields.modality.value,'compra')
  assert.equal(result.state.fields.usageLocation.value,'Clínica ou instituição')
  assert.equal(result.state.fields.quantity.value,'1')
  assert.equal(result.state.lastAskedField,'name')
  assert.match(result.reply,/Já registrei.*Cama manual 3 movimentos.*Curitiba/)
  assert.doesNotMatch(result.reply,/qual cidade/i)
  assert.equal(result.handoff,false)
})

test('single-line inputs retain labelled quote fields when the browser strips line breaks',async()=>{
  const result=await run('Teste técnico com cliente fictício.Nome: Cliente Teste.'+showroom.replace(/\n/g,''))
  assert.equal(result.state.fields.name.value,'Cliente Teste')
  assert.equal(result.state.fields.equipmentInterest.value,'Cama manual 3 movimentos')
  assert.equal(result.state.fields.city.value,'Curitiba')
  assert.equal(result.state.fields.usageLocation.value,'Clínica ou instituição')
  assert.equal(result.state.fields.quantity.value,'1')
  assert.equal(result.state.lastAskedField,'district')
})

test('reported conversation progresses without asking city again or treating used condition as an address', async () => {
  let result = await run(showroom)
  result = await run('Simone',result.state)
  assert.equal(result.state.lastAskedField,'district')
  assert.match(result.reply,/Prazer, Simone/)
  result = await run('Pode ser usada',result.state)
  assert.equal(result.state.fields.conditionPreference.value,'usada')
  assert.equal(result.state.fields.city.value,'Curitiba')
  assert.equal(result.state.fields.name.value,'Simone')
  assert.equal(result.state.fields.district,undefined)
  assert.match(result.reply,/aceita equipamento usado.*confirma o estado e a disponibilidade/)
  assert.doesNotMatch(result.reply,/temos|garantimos|pronta entrega/i)
  result = await run('Hauer',result.state)
  assert.equal(result.state.lastAskedField,'neededAt')
  result = await run('Para mês que vem\nNovembro',result.state)
  assert.equal(result.state.fields.neededAt.value,'Novembro')
  assert.equal(result.reason,'qualified')
  assert.doesNotMatch(result.reply,/Não consegui|triagem|qual cidade/i)
  assert.match(qualificationSummary(result.state),/Condição aceita: usada/)
  assert.match(qualificationSummary(result.state),/Local de uso: Clínica ou instituição/)
})

test('relative month is captured without fabricating a day or year', async () => {
  const result = await run('Para mês que vem',{lastAskedField:'neededAt'})
  assert.equal(result.state.fields.neededAt.value,'mês que vem')
  assert.doesNotMatch(result.state.fields.neededAt.value,/\d/)
  const month = await run('Novembro',{lastAskedField:'neededAt'})
  assert.equal(month.state.fields.neededAt.value,'Novembro')
  const correction = await run('Não preciso mês que vem, só em dezembro.',{fields:{neededAt:{value:'mês que vem',status:'confirmed'}}})
  assert.equal(correction.state.fields.neededAt.value,'dezembro')
})

test('used condition is never accepted as name, city or district even from model output', async () => {
  for (const key of ['name','city','district']) {
    const result = await run('Pode ser usada',{lastAskedField:key},{
      generate:async()=>({provider:{ok:true},data:{fields:{[key]:{value:'Pode ser usada',evidence:'Pode ser usada'}}}})
    })
    assert.equal(result.state.fields[key],undefined)
    assert.equal(result.state.fields.conditionPreference.value,'usada')
  }
})

test('recovery repairs the reported invalid city and restores the full showroom model from the same evidence', () => {
  const history = [
    {id:'showroom',from:'client',content:showroom},
    {id:'ask-name',from:'ai',content:'Como posso te chamar?'},
    {id:'name',from:'client',content:'Simone'},
    {id:'ask-city',from:'ai',content:'Em qual cidade será a entrega?'},
    {id:'condition',from:'client',content:'Pode ser usada'},
    {id:'ask-district',from:'ai',content:'Em qual bairro será a entrega?'},
    {id:'district',from:'client',content:'Hauer'},
    {id:'ask-date',from:'ai',content:'Para quando você precisa do equipamento?'},
    {id:'date-1',from:'client',content:'Para mês que vem'},
    {id:'date-2',from:'client',content:'Novembro'},
  ]
  const previous = {fields:{city:{value:'Pode ser usada',status:'confirmed',messageId:'condition'},equipmentInterest:{value:'Cama manual',status:'confirmed',messageId:'showroom'}}}
  const state = recoverQualification(previous,history)
  assert.equal(state.fields.city.value,'Curitiba')
  assert.equal(state.fields.equipmentInterest.value,'Cama manual 3 movimentos')
  assert.equal(state.fields.name.value,'Simone')
  assert.equal(state.fields.district.value,'Hauer')
  assert.equal(state.fields.neededAt.value,'Novembro')
  assert.equal(state.qualified,true)
})

test('fallback follows the team order after quota, missing models and invalid output', async () => {
  const requested = []
  const fetcher = async url => {
    const model = url.match(/models\/([^:]+):generateContent$/)?.[1]
    requested.push(model)
    if (requested.length === 1) return {ok:false,status:429}
    if (requested.length === 2) return {ok:false,status:404}
    if (requested.length === 3) return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'invalid JSON'}]}}]})}
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({fields:{}})}]}}]})}
  }
  const result = await generateYria({key:'fixture-fallback-sequence',state:{fields:{}},text:'Olá',messages:[],config:normalizeConfig(),fetcher})
  assert.deepEqual(requested,FALLBACK_MODELS.slice(0,4))
  assert.equal(result.provider.ok,true)
  assert.equal(result.provider.model,'gemini-3.5-flash')
  assert.deepEqual(result.provider.attempts.map(a=>a.code),['quota','model_unavailable','invalid_output','ok'])
})

test('credential failure does not hammer every fallback model; exact benchmark remains exact', async () => {
  let calls = 0
  const params = {key:'fixture-credential-failure',state:{fields:{}},text:'Olá',messages:[],config:normalizeConfig()}
  const auth = await generateYria({...params,fetcher:async()=>{calls++;return {ok:false,status:401}}})
  assert.equal(auth.provider.code,'credentials')
  assert.equal(calls,1)
  calls=0
  const benchmark = await generateYria({...params,forceModel:'gemini-fixture-model',fetcher:async()=>{calls++;return {ok:false,status:429}}})
  assert.equal(benchmark.provider.model,'gemini-fixture-model')
  assert.equal(calls,1)
})

test('an offline script reply is not mislabeled as a successful Gemini reply',async()=>{
  const data={leads:[{id:'test',phone:'000',aiEnabled:true,stage:'novo_lead'}],messages:[],users:[],notifications:[]}
  const database={get:key=>data[key]||[],getSettings:()=>({}),find:(key,p)=>data[key].find(p),filter:(key,p)=>data[key].filter(p),
    insert:(key,value)=>{data[key].push(value);return value},update:(key,id,patch)=>{const row=data[key].find(r=>r.id===id);Object.assign(row,patch);return row}}
  const respond=createYriaResponder({database,evaluate:args=>runYriaTurn({...args,generate:failed}),send:async()=>true})
  await respond(data.leads[0],{id:'synthetic',content:showroom})
  assert.equal(data.messages[0].modelUsed,'roteiro-seguro')
  assert.equal(data.messages[0].providerAttemptedModel,'gemini-3.1-flash-lite')
  assert.equal(data.messages[0].providerCode,'quota')
})
