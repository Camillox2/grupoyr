import test from 'node:test'
import assert from 'node:assert/strict'
import { activeHistoryRecovery, recoveryAllowsMessage, createHistoryRecovery } from '../src/whatsappRecovery.js'
const now = Date.parse('2026-10-13T20:00:00Z')
const record = () => ({id:'qa-recovery',authorized:true,status:'requested',actorId:'qa-operator',from:'2026-10-13T03:00:00Z',until:'2026-10-13T20:00:00Z',expiresAt:'2026-10-13T20:30:00Z'})
test('only explicit non-expired bounded requests accept real timestamps inside the window',()=>{
  const scope=activeHistoryRecovery(record(),now)
  assert.ok(scope)
  for(const messageTimestamp of [Date.parse(record().from)/1000,now/1000])assert.equal(recoveryAllowsMessage({messageTimestamp},scope),true)
  for(const messageTimestamp of [undefined,0,'invalid',Date.parse(record().from)/1000-1,now/1000+1])assert.equal(recoveryAllowsMessage({messageTimestamp},scope),false)
  assert.equal(recoveryAllowsMessage({messageTimestamp:now/1000,key:{remoteJid:'550000000000@s.whatsapp.net'}},{...scope,ownJids:['550000000000:1@s.whatsapp.net']}),false)
  for(const patch of [{authorized:false},{id:''},{status:'partial'},{expiresAt:'2026-10-13T19:00:00Z'},{until:'2026-10-14T20:00:00Z'},{from:'2026-10-10T03:00:00Z'}])assert.equal(activeHistoryRecovery({...record(),...patch},now),null)
})
test('bounded resend is consumed before network, deduplicates and never sends a customer message',async()=>{
  let saved=record(),time=now,calls=[],release
  const wait=new Promise(resolve=>{release=resolve})
  const recovery=createHistoryRecovery({read:()=>saved,write:value=>saved=value,now:()=>time})
  const socket={requestPlaceholderResend:async key=>{calls.push(key.id);await wait;return'fixture'},sendMessage:()=>{throw Error('customer send forbidden')}}
  const notifications=['1','2','2','3','4'].map(id=>({key:{id}}))
  const running=recovery.request(socket,notifications)
  assert.equal(saved.status,'requesting');assert.equal(await recovery.request(socket,notifications),false)
  release();await running
  assert.deepEqual(calls,['2','3','4']);assert.equal(saved.requestedNotifications,3);assert.equal(saved.status,'waiting_phone')
  const restarted=createHistoryRecovery({read:()=>saved,write:value=>saved=value,now:()=>time})
  assert.equal(await restarted.request(socket,notifications),false)
  time+=90001;assert.equal(recovery.finish(),true);assert.equal(saved.status,'no_phone_response')
  assert.equal(recovery.scope(),null)
})
test('phone packets and actual imported counts are reported as partial, never full success',async()=>{
  let saved=record(),time=now
  const recovery=createHistoryRecovery({read:()=>saved,write:value=>saved=value,now:()=>time})
  await recovery.request({requestPlaceholderResend:async()=> 'fixture'},[{key:{id:'1'}}])
  recovery.packet(10);recovery.counts(2,5)
  assert.equal(saved.importedContacts,2);assert.equal(saved.importedMessages,5);assert.equal(saved.receivedMessages,10)
  time+=90001;recovery.finish();assert.equal(saved.status,'partial');assert.equal(recovery.scope(),null)
})

test('failed control persistence never requests phone replay or allows unknown contacts',async()=>{
  const recovery=createHistoryRecovery({read:record,write:()=>{throw Error('fixture disk failure')},now:()=>now})
  assert.equal(await recovery.request({requestPlaceholderResend:()=>{throw Error('must not call')}},[{key:{id:'1'}}]),false)
  assert.equal(recovery.scope(),null)
})
