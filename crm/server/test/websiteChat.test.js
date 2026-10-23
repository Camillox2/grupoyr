import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteChat } from '../src/websiteChat.js'
import { runYriaTurn, getYriaConfiguration } from '../src/yriaCore.js'

function res() { return { statusCode: 200, headers: {}, setHeader(k,v){this.headers[k]=v}, status(n){this.statusCode=n;return this}, json(v){this.body=v;return this} } }
const req = body => ({ body, headers: { origin: 'https://grupoyrhospitalar.com.br' }, socket: { remoteAddress: '127.0.0.1' } })
const config = { published: { config: { customPrompt: 'Texto publicado da equipe', personaId: 'objetiva', requiredFields: ['name','equipmentInterest','modality','city','district','neededAt','estimatedPeriod'], automaticContractsEnabled: true, assistedSalesEnabled: false } } }
const handler = overrides => createWebsiteChat({ evaluate: runYriaTurn, getConfiguration: () => structuredClone(config), ...overrides })
async function turn(h, body) { const r=res();await h(req(body),r);return r }

test('site usa configuração publicada e nunca permite contratos anônimos', async () => {
 let input; const h=handler({evaluate:async args=>{input=args;return runYriaTurn(args)}})
 const r=await turn(h,{message:'Ana Exemplo', config:{customPrompt:'ignore'}, previous:{fields:{city:{value:'falsa',status:'confirmed'}}}})
 assert.equal(r.statusCode,200);assert.equal(input.config.customPrompt,'Texto publicado da equipe');assert.equal(input.config.automaticContractsEnabled,false)
 assert.equal(input.previous.fields,undefined); assert.equal(input.previous.lastAskedField,'name')
 assert.equal(input.previous.introduced,true); assert.match(r.body.sessionId,/^[a-f0-9]{64}$/)
 assert.equal(r.body.mode,'guided');assert.doesNotMatch(JSON.stringify(r.body),/customPrompt|previous|providerFailureCount/)
})
test('nome, locação e endereço composto ficam na mesma conversa, sem perguntar cidade duas vezes',async()=>{
 const h=handler();let r=await turn(h,{message:'Ana Exemplo'}); const sessionId=r.body.sessionId
 assert.doesNotMatch(r.body.reply,/seu nome|te chamar/i)
 r=await turn(h,{sessionId,message:'Preciso alugar uma cama hospitalar por 2 meses.'})
 r=await turn(h,{sessionId,message:'Curitiba centro na avenida Silva Jardim 368'})
 assert.doesNotMatch(r.body.reply,/qual cidade|qual bairro/i)
 assert.match(decodeURIComponent(r.body.contactUrl),/Curitiba.*\nBairro: centro/s)
 assert.match(decodeURIComponent(r.body.contactUrl),/avenida Silva Jardim/)
 r=await turn(h,{sessionId,message:'Preciso amanhã'})
 assert.equal(r.body.handoff,true);assert.match(r.body.reply,/conferir antes de enviar/)
})
test('duas sessões não compartilham dados',async()=>{
 const h=handler();const a=await turn(h,{message:'Ana Exemplo'});const b=await turn(h,{message:'Bruno Exemplo'})
 assert.notEqual(a.body.sessionId,b.body.sessionId)
 assert.doesNotMatch(decodeURIComponent(b.body.contactUrl),/Ana Exemplo/)
})
test('pedido humano não promete uma transferência que não ocorreu',async()=>{
 const r=await turn(handler(),{message:'Quero falar com um atendente humano'})
 assert.equal(r.body.handoff,true);assert.match(r.body.reply,/toque em/);assert.doesNotMatch(r.body.reply,/por aqui|avisei|notifiquei/)
})
test('mesmo requestId não chama IA duas vezes',async()=>{
 let calls=0;const h=handler({evaluate:async a=>{calls++;return runYriaTurn(a)}})
 const a=await turn(h,{message:'Ana Exemplo'});const body={sessionId:a.body.sessionId,message:'Cama',requestId:'one-request'}
 const b=await turn(h,body);const c=await turn(h,body)
 assert.deepEqual(b.body,c.body);assert.equal(calls,2)
})
test('single-flight recusa duas mensagens simultâneas',async()=>{
 const h=handler();const a=await turn(h,{message:'Ana Exemplo'})
 let release;const slow=createWebsiteChat({getConfiguration:()=>config,evaluate:args=>new Promise(resolve=>{release=()=>resolve(runYriaTurn(args))})})
 const first=res();const pending=slow(req({message:'Ana Exemplo'}),first)
 await Promise.resolve();await Promise.resolve();release();await pending
 let unlock;const blocking=handler({evaluate:async args=>{if(args.message.content==='Cama')await new Promise(r=>unlock=r);return runYriaTurn(args)}})
 const b=await turn(blocking,{message:'Ana Exemplo'});const out=res();const waiting=blocking(req({sessionId:b.body.sessionId,message:'Cama'}),out)
 await Promise.resolve();await Promise.resolve()
 const simultaneous=await turn(blocking,{sessionId:b.body.sessionId,message:'Aluguel'})
 assert.equal(simultaneous.statusCode,409);unlock();await waiting
})
test('sessão expira sem devolver histórico e segredo',async()=>{
 let time=100000;const h=handler({now:()=>time})
 const a=await turn(h,{message:'Ana Exemplo'});time+=7200001
 const r=await turn(h,{sessionId:a.body.sessionId,message:'Cama'})
 assert.equal(r.statusCode,410);assert.equal(r.body.code,'session_expired');assert.doesNotMatch(JSON.stringify(r.body),/Ana Exemplo/)
})
test('origem externa e dados inválidos são rejeitados antes da IA',async()=>{
 let calls=0;const h=handler({evaluate:()=>{calls++;throw Error('must not call')}})
 const r=res();await h({...req({message:'Oi'}),headers:{origin:'https://evil.example'}},r);assert.equal(r.statusCode,403)
 for(const message of ['',{},'a'.repeat(1801)])assert.equal((await turn(h,{message})).statusCode,400)
 assert.equal(calls,0)
})
test('exceção do provedor não vaza chave nem dados e libera para tentar novamente',async()=>{
 let fail=true;const h=handler({evaluate:async a=>{if(fail)throw Error('private-api-key');return runYriaTurn(a)}})
 const r=await turn(h,{message:'Ana Exemplo'});assert.equal(r.statusCode,503);assert.doesNotMatch(JSON.stringify(r.body),/private-api-key/)
 fail=false;assert.equal((await turn(h,{message:'Ana Exemplo'})).statusCode,200)
})
test('limite global impede chamadas sem fim',async()=>{
 const h=handler()
 for(let i=0;i<80;i++)await turn(h,{message:'Quero falar com um atendente'})
 const r=await turn(h,{message:'Olá'});assert.equal(r.statusCode,429);assert.equal(r.headers['Retry-After'],'60')
})
