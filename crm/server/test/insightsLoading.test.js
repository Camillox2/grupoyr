import test from 'node:test'
import assert from 'node:assert/strict'
import { requestInsights } from '../../client/src/lib/insightsRequest.ts'

const ok = data => new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}})
const options = fetcher => ({fetcher, timeoutMs:100, retryDelayMs:1})

test('insights: first load sends the current session and bypasses HTTP cache', async () => {
  const controller = new AbortController()
  let calls=0
  const result=await requestInsights('test-session',30,controller.signal,options(async(url,init)=>{
    calls++
    assert.equal(url,'/api/insights?days=30')
    assert.equal(init.headers.Authorization,'Bearer test-session')
    assert.equal(init.cache,'no-store')
    return ok({days:30})
  }))
  assert.deepEqual(result,{days:30})
  assert.equal(calls,1)
})

test('insights: transient connection failure recovers without a page reload', async () => {
  let calls=0
  const result=await requestInsights('test',7,new AbortController().signal,options(async()=>{
    if(++calls===1)throw new TypeError('Failed to fetch')
    return ok({days:7})
  }))
  assert.deepEqual(result,{days:7})
  assert.equal(calls,2)
})

test('insights: gateway failure retries once; permanent errors are bounded', async () => {
  let calls=0
  await assert.rejects(requestInsights('test',30,new AbortController().signal,options(async()=>{
    calls++;return new Response('',{status:503})
  })),/Não foi possível carregar/)
  assert.equal(calls,2)
})

test('insights: expired session and denied admin access are never retried', async () => {
  for(const status of [401,403]){
    let calls=0
    await assert.rejects(requestInsights('test',30,new AbortController().signal,options(async()=>{
      calls++;return new Response('',{status})
    })),status===401?/sessão expirou/:/administradores/)
    assert.equal(calls,1)
  }
})

test('insights: stalled request times out instead of leaving an empty screen forever', async () => {
  let calls=0
  await assert.rejects(requestInsights('test',30,new AbortController().signal,{
    timeoutMs:5,retryDelayMs:1,fetcher:(_url,{signal})=>{
      calls++
      return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))
    },
  }),/demorou mais/)
  assert.equal(calls,2)
})

test('insights: changing period cancels the previous request without retrying', async () => {
  const controller=new AbortController()
  let calls=0
  const request=requestInsights('test',90,controller.signal,options((_url,{signal})=>{
    calls++
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))
  }))
  controller.abort()
  await assert.rejects(request,{name:'AbortError'})
  assert.equal(calls,1)
})

test('insights: even a late response cannot overwrite the new period after cancellation', async () => {
  const controller=new AbortController()
  let release
  const request=requestInsights('test',7,controller.signal,options(()=>new Promise(resolve=>{release=resolve})))
  controller.abort()
  release(ok({days:7}))
  await assert.rejects(request,{name:'AbortError'})
})

test('insights: abort during retry backoff prevents another request', async () => {
  const controller=new AbortController()
  let calls=0
  const request=requestInsights('test',30,controller.signal,{...options(async()=>{
    calls++;setTimeout(()=>controller.abort(),1);throw new TypeError('offline')
  }),retryDelayMs:50})
  await assert.rejects(request,{name:'AbortError'})
  assert.equal(calls,1)
})
