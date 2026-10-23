import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaileysMessageIngestor, decodeWhatsAppSource, parseWhatsAppMessage, recordWhatsAppCall, serializeWhatsAppMessage } from '../src/whatsappMessages.js'

const timestamp = '2026-10-09T12:00:00.000Z'
const jid = '5511999990000@s.whatsapp.net'
const packet = (message, extras = {}) => ({ key: { id: 'wa_test_1', remoteJid: jid, fromMe: false }, messageTimestamp: Date.parse(timestamp) / 1000, message, ...extras })
const lead = { id: 'lead_test', name: 'Cliente de teste', phone: '5511999990000', whatsappJid: jid, aiEnabled: true, conversationStatus: 'open', lastInboundAt: '2026-10-09T11:00:00.000Z', lastInteraction: '2026-10-09T11:00:00.000Z' }

function fixture({ leads = [lead], messages = [], failDownload = false } = {}) {
  const data = structuredClone({ leads, messages, users: [{ id: 'admin_test', role: 'admin' }] })
  const database = {
    get: key => data[key] || [], getSettings: () => ({}),
    find: (key, match) => (data[key] || []).find(match),
    insert: (key, item) => { data[key].unshift(item); return item },
    update: (key, id, values) => { const index = data[key].findIndex(item => item.id === id); if (index < 0) return null; data[key][index] = { ...data[key][index], ...values }; return data[key][index] },
  }
  const events = []; const responses = []; const downloaded = []
  const ownMessageIds = new Set()
  const ingest = createBaileysMessageIngestor({ database, ownMessageIds,
    emit: (event, value) => events.push({ event, value }), respond: async (...args) => responses.push(args),
    download: async raw => { downloaded.push(raw); if (failDownload) throw new Error('offline'); return Buffer.from('media-fixture') },
    storeMedia: async () => ({ mediaBinaryFileId: 'binary_test' }), resolvePhone: async () => jid,
  })
  return { database, data, events, responses, downloaded, ingest, ownMessageIds }
}

test('unwraps current WhatsApp media wrappers and recognizes documents, stickers and GIFs', () => {
  assert.equal(parseWhatsAppMessage(packet({ viewOnceMessageV2Extension: { message: { imageMessage: { url: 'test', caption: 'foto' } } } })).type, 'image')
  assert.equal(parseWhatsAppMessage(packet({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'cotacao.pdf', mimetype: 'application/pdf' } } } })).fileName, 'cotacao.pdf')
  const sticker = parseWhatsAppMessage(packet({ associatedChildMessage: { message: { stickerMessage: { isAnimated: true } } } }))
  assert.equal(sticker.type, 'sticker'); assert.equal(sticker.mediaIsAnimated, true)
  assert.equal(parseWhatsAppMessage(packet({ videoMessage: { gifPlayback: true } })).mediaIsGif, true)
  assert.equal(parseWhatsAppMessage(packet({ ptvMessage: { url: 'test' } })).type, 'video')
})

test('ignores control packets and reactions instead of inventing [Arquivo] messages', async () => {
  const f = fixture()
  for (const message of [{ protocolMessage: { type: 5 } }, { reactionMessage: { text: '👍' } }, { senderKeyDistributionMessage: {} }, {}]) assert.equal(await f.ingest(packet(message)), null)
  assert.equal(f.data.messages.length, 0); assert.equal(f.responses.length, 0)
})

test('syncs a seller reply from the linked phone, pauses AI and preserves customer name and inbound time', async () => {
  const f = fixture()
  const saved = await f.ingest(packet({ conversation: 'Resposta do vendedor 😊' }, { key: { id: 'seller_1', remoteJid: jid, fromMe: true }, pushName: 'Nome do vendedor' }))
  assert.equal(saved.from, 'agent'); assert.equal(saved.sentVia, 'whatsapp_business')
  assert.equal(f.data.leads[0].name, lead.name); assert.equal(f.data.leads[0].lastInboundAt, lead.lastInboundAt)
  assert.equal(f.data.leads[0].aiEnabled, false); assert.equal(f.responses.length, 0)
})

test('imports the linked-device envelope used in recovered phone messages', async () => {
  const f = fixture()
  const saved = await f.ingest(packet({ deviceSentMessage: { destinationJid: jid, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'Resposta recuperada do telefone' } } } } } }, { key: { id: 'wrapped_phone_reply', remoteJid: jid, fromMe: true } }))
  assert.equal(saved.from, 'agent')
  assert.equal(saved.content, 'Resposta recuperada do telefone')
  assert.equal(f.data.messages.length, 1)
  assert.equal(f.responses.length, 0)
})

test('imports a known LID contact even when the phone mapping repository is unavailable', async () => {
  const f = fixture({ leads: [{ ...lead, whatsappLid: '222222@lid' }] })
  const ingest = createBaileysMessageIngestor({ database: f.database, download: async () => null, storeMedia: async () => null,
    resolvePhone: async () => { throw new Error('mapping unavailable') },
  })
  const saved = await ingest(packet({ conversation: 'Resposta do vendedor pelo LID' }, { key: { id: 'lid_mapping_offline', remoteJid: '222222@lid', fromMe: true } }))
  assert.equal(saved.leadId, lead.id)
  assert.equal(saved.from, 'agent')
  assert.equal(f.data.leads.length, 1)
  assert.equal(f.data.leads[0].phone, lead.phone)
})

test('enriches a legacy text record with the original phone key without duplication or AI reply', async () => {
  const f = fixture({ messages: [{ id: 'legacy_text', sourceMessageId: 'wa_test_1', leadId: lead.id, from: 'client', type: 'text', content: 'Resposta antiga', timestamp }] })
  const saved = await f.ingest(packet({ conversation: 'Resposta antiga' }, { key: { id: 'wa_test_1', remoteJid: jid, fromMe: true } }), { historical: true, live: false })
  assert.equal(saved.id, 'legacy_text')
  assert.equal(saved.from, 'agent')
  assert.equal(saved.whatsappKey.id, 'wa_test_1')
  assert.equal(decodeWhatsAppSource(saved.whatsappSource).key.fromMe, true)
  assert.equal(f.data.messages.length, 1)
  assert.equal(f.responses.length, 0)
  await f.ingest(packet({ conversation: 'Resposta antiga' }, { key: { id: 'wa_test_1', remoteJid: jid, fromMe: true } }))
  assert.equal(f.data.messages.length, 1)
  assert.equal(f.events.filter(event => event.event === 'message:updated').length, 1)
})

test('stores media once and does not send another AI reply when WhatsApp repeats a packet', async () => {
  const f = fixture()
  const raw = packet({ audioMessage: { url: 'fixture', mimetype: 'audio/ogg;codecs=opus', mediaKey: Buffer.from('key') } })
  const saved = await f.ingest(raw); await f.ingest(raw)
  assert.equal(saved.type, 'audio'); assert.equal(saved.mediaBinaryFileId, 'binary_test')
  assert.equal(f.data.messages.length, 1); assert.equal(f.responses.length, 1); assert.equal(f.downloaded.length, 1)
  assert.deepEqual(decodeWhatsAppSource(saved.whatsappSource).message.audioMessage.mediaKey, Buffer.from('key'))
})

test('keeps a protected recoverable media source when the download fails', async () => {
  const f = fixture({ failDownload: true })
  const saved = await f.ingest(packet({ imageMessage: { url: 'fixture', mediaKey: Buffer.from('private-key') } }))
  const client = serializeWhatsAppMessage(saved)
  assert.equal(saved.mediaStatus, 'pending'); assert.match(client.mediaUrl, /\/media$/)
  for (const privateKey of ['whatsappSource', 'whatsappKey', 'mediaBinaryFileId', 'mediaStorageKey']) assert.equal(privateKey in client, false)
})

test('recovers an old [Arquivo] record into a sticker without changing its CRM id', async () => {
  const f = fixture({ messages: [{ id: 'legacy_1', leadId: lead.id, sourceMessageId: 'wa_test_1', from: 'client', type: 'text', content: '[Arquivo]', timestamp }] })
  const saved = await f.ingest(packet({ stickerMessage: { url: 'fixture', isAnimated: true } }), { historical: true, live: false })
  assert.equal(saved.id, 'legacy_1'); assert.equal(saved.type, 'sticker'); assert.equal(f.data.messages.length, 1)
  assert.equal(saved.mediaBinaryFileId, 'binary_test'); assert.equal(f.responses.length, 0)
  assert.equal(f.events[0].event, 'message:updated')
})

test('historical sync imports existing conversations without reopening them or triggering AI', async () => {
  const f = fixture({ leads: [{ ...lead, conversationStatus: 'closed' }] })
  await f.ingest(packet({ conversation: 'Mensagem antiga' }), { historical: true, live: false })
  assert.equal(f.data.messages.length, 1); assert.equal(f.data.leads[0].conversationStatus, 'closed'); assert.equal(f.responses.length, 0)
  const unknown = packet({ conversation: 'Contato pessoal desconhecido' }, { key: { id: 'unknown', remoteJid: '5521999990001@s.whatsapp.net', fromMe: false } })
  assert.equal(await f.ingest(unknown, { historical: true }), null); assert.equal(f.data.leads.length, 1)
})

test('explicit historical recovery creates missing contacts paused, preserves dates and never replies',async()=>{
  const f=fixture({leads:[]}),historyImport={id:'qa-history',actorId:'qa-operator',from:Date.parse(timestamp)-1000,until:Date.parse(timestamp)+1000}
  const raw=packet({conversation:'Mensagem do período sem conexão'},{pushName:'Contato fictício recuperado'})
  await f.ingest(raw,{historical:true,live:false,historyImport});await f.ingest(raw,{historical:true,live:false,historyImport})
  assert.equal(f.data.leads.length,1);assert.equal(f.data.messages.length,1);assert.equal(f.responses.length,0)
  assert.equal(f.data.leads[0].aiEnabled,false);assert.ok(f.data.leads[0].aiManualPausedAt)
  assert.equal(f.data.leads[0].historyRecoveryId,'qa-history');assert.equal(f.data.messages[0].historyRecoveryId,'qa-history')
  assert.equal(f.data.leads[0].createdAt,timestamp);assert.equal(f.data.messages[0].timestamp,timestamp)
  assert.equal(f.data.leads[0].value,0);assert.equal(f.data.leads[0].name,'Contato fictício recuperado')
  await f.ingest(packet({conversation:'Nova mensagem ao vivo'},{key:{id:'fresh',remoteJid:jid,fromMe:false}}))
  assert.equal(f.responses.length,0)
})

test('scoped recovery excludes unknown messages outside the interval, malformed dates and groups',async()=>{
  const f=fixture({leads:[]}),historyImport={id:'qa-history',actorId:'qa',from:Date.parse(timestamp),until:Date.parse(timestamp)+1000}
  for(const patch of [{messageTimestamp:Date.parse(timestamp)/1000-1},{messageTimestamp:undefined},{messageTimestamp:0},{key:{id:'group',remoteJid:'123@g.us'}}])assert.equal(await f.ingest(packet({conversation:'No import'},patch),{historical:true,historyImport}),null)
  assert.equal(f.data.leads.length,0)
})

test('recovery media defers download but retains protected source for later retrieval',async()=>{
  const f=fixture({leads:[]}),historyImport={id:'qa-history',from:Date.parse(timestamp)-1000,until:Date.parse(timestamp)+1000}
  const saved=await f.ingest(packet({imageMessage:{url:'fixture',caption:'Foto fictícia'}}),{historical:true,historyImport,deferMedia:true})
  assert.equal(f.downloaded.length,0);assert.equal(saved.mediaStatus,'pending');assert.ok(saved.whatsappSource)
  assert.equal(serializeWhatsAppMessage(saved).whatsappSource,undefined)
  assert.ok(serializeWhatsAppMessage(saved).mediaUrl);assert.equal(f.responses.length,0)
})

test('recovered customer pushName replaces only a generic name, never the seller name',async()=>{
  const f=fixture({leads:[]}),historyImport={id:'qa-history',from:Date.parse(timestamp)-1000,until:Date.parse(timestamp)+1000}
  await f.ingest(packet({conversation:'Resposta antiga do vendedor'},{pushName:'Vendedor',key:{id:'seller-first',remoteJid:jid,fromMe:true}}),{historical:true,historyImport})
  assert.equal(f.data.leads[0].name,'Contato WhatsApp')
  await f.ingest(packet({conversation:'Mensagem antiga do cliente'},{pushName:'Cliente fictício recuperado',key:{id:'client-name',remoteJid:jid,fromMe:false}}),{historical:true,historyImport})
  assert.equal(f.data.leads[0].name,'Cliente fictício recuperado');assert.equal(f.responses.length,0)
})

test('matches a LID to the customer phone and never treats the seller pushName as the customer name', async () => {
  const f = fixture()
  await f.ingest(packet({ conversation: 'Oi' }, { key: { id: 'lid_1', remoteJid: '123456@lid', fromMe: true }, pushName: 'Vendedor' }))
  assert.equal(f.data.leads.length, 1); assert.equal(f.data.leads[0].whatsappLid, '123456@lid'); assert.equal(f.data.leads[0].name, lead.name)
})

test('ignores group/status messages and local CRM send echoes', async () => {
  const f = fixture(); f.ownMessageIds.add('own_1')
  for (const key of [{ id: 'g', remoteJid: '123@g.us' }, { id: 's', remoteJid: 'status@broadcast' }, { id: 'own_1', remoteJid: jid, fromMe: true }]) assert.equal(await f.ingest(packet({ conversation: 'texto' }, { key })), null)
  assert.equal(f.data.messages.length, 0)
})

test('links a legacy CRM/AI send to its WhatsApp id instead of duplicating it', async () => {
  const f = fixture({ messages: [{ id: 'ai_1', leadId: lead.id, from: 'ai', type: 'text', content: 'Resposta', timestamp }] })
  const saved = await f.ingest(packet({ conversation: 'Resposta' }, { key: { id: 'echo_1', remoteJid: jid, fromMe: true } }), { historical: true })
  assert.equal(saved.id, 'ai_1'); assert.equal(saved.from, 'ai'); assert.equal(saved.sourceMessageId, 'echo_1'); assert.equal(f.data.messages.length, 1)
})

test('logs calls with a single updatable record and does not downgrade accepted/ended calls', () => {
  const f = fixture()
  const call = { id: 'call_fixture', from: jid, date: new Date(timestamp), isVideo: true }
  recordWhatsAppCall(f.database, { ...call, status: 'offer' }); recordWhatsAppCall(f.database, { ...call, status: 'accept' })
  recordWhatsAppCall(f.database, { ...call, status: 'ringing' }); assert.equal(f.data.messages[0].callStatus, 'accept')
  recordWhatsAppCall(f.database, { ...call, status: 'terminate' }); recordWhatsAppCall(f.database, { ...call, status: 'offer' })
  assert.equal(f.data.messages.length, 1); assert.equal(f.data.messages[0].callStatus, 'terminate'); assert.match(f.data.messages[0].content, /vídeo encerrada/)
})
