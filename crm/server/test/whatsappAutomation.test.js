import test from 'node:test'
import assert from 'node:assert/strict'
import { LEGACY_AUTOMATIC_REPLY, externalAutomaticReplyKind, isExternalAutomaticPacket, isHumanAgentMessage } from '../src/whatsappAutomation.js'
import { planExternalAutomationRepairs, repairExternalAutomationReplies } from '../src/whatsappAutomationRepair.js'
import { createBaileysMessageIngestor, parseWhatsAppMessage, serializeWhatsAppMessage } from '../src/whatsappMessages.js'
import { conversationMetrics } from '../src/conversationMetrics.js'
import { createYriaResponder } from '../src/yriaResponder.js'
import { runYriaTurn } from '../src/yriaCore.js'

const enteredAt = '2026-10-12T19:48:39.000Z', firstAutomaticAt = '2026-10-12T19:48:41.000Z', lastAutomaticAt = '2026-10-12T19:49:50.000Z'
const now = new Date('2026-10-12T20:10:00.000Z'), jid = '554100000000@s.whatsapp.net'
const lead = { id: 'qa-auto', name: 'Contato fictício', phone: '554100000000', whatsappJid: jid, stage: 'novo_lead', aiEnabled: false, humanAssumedAt: lastAutomaticAt, createdAt: enteredAt, modality: 'locacao', equipmentInterest: 'A definir' }
const automaticMessage = (id = 'qa-auto-1', timestamp = firstAutomaticAt) => ({ id, leadId: lead.id, from: 'agent', type: 'text', content: LEGACY_AUTOMATIC_REPLY, sourceMessageId: 'wa-' + id, sentVia: 'whatsapp_business', deliveryStatus: 'sent', timestamp, whatsappKey: { fromMe: true } })
const showroom = 'Olá! Vim pelo showroom do Grupo YR Hospitalar.\nEquipamento: Cama manual 3 movimentos.\nModalidade: Comprar.\nCidade de entrega: São José dos Pinhais.\nGostaria de confirmar modelo e condições de entrega.'
const messages = [
  { id: 'qa-in-1', leadId: lead.id, from: 'client', type: 'text', content: showroom, timestamp: enteredAt },
  automaticMessage(),
  { id: 'qa-in-2', leadId: lead.id, from: 'client', type: 'text', content: 'Boa tarde quais os valores das camas manual com 3 ou 2 movimentos', timestamp: lastAutomaticAt },
  automaticMessage('qa-auto-2', lastAutomaticAt),
]
function fixture(overrides = {}) {
  const db = { data: structuredClone({ leads: [lead], messages, contracts: [], users: [], settings: {}, integrationCorrections: [], ...overrides }), ready: Promise.resolve(),
    get(key) { return this.data[key] || [] }, getSettings() { return this.data.settings },
    find(key, fn) { return this.get(key).find(fn) }, filter(key, fn) { return this.get(key).filter(fn) },
    update(key, id, patch) { const index = this.get(key).findIndex(item => item.id === id); this.data[key][index] = { ...this.data[key][index], ...patch }; return this.data[key][index] },
    insert(key, value) { this.data[key] ??= []; this.data[key].push(value); return value },
    save(next) { if (next) this.data = next; return true }, async flush() {},
  }
  return db
}
const packet = (text, id, fromMe = true) => ({ key: { id, remoteJid: jid, fromMe }, messageTimestamp: Date.parse(lastAutomaticAt) / 1000, message: { extendedTextMessage: { text } } })

test('only the verified external legacy fallback is classified; customer and explicitly attributed human copies are not', () => {
  assert.equal(externalAutomaticReplyKind(automaticMessage()), 'legacy_fallback')
  assert.equal(externalAutomaticReplyKind({ ...automaticMessage(), content: '  ' + LEGACY_AUTOMATIC_REPLY.replaceAll(' ', '\n') + '  ' }), 'legacy_fallback')
  for (const patch of [{ from: 'client' }, { from: 'ai' }, { type: 'image' }, { sourceMessageId: '' }, { sentVia: 'crm' }, { sentBy: 'qa-seller' }, { whatsappKey: { fromMe: false } }, { content: 'Olá! Sou da equipe YR. Como posso ajudar?' }]) assert.equal(externalAutomaticReplyKind({ ...automaticMessage(), ...patch }), '')
  assert.equal(isHumanAgentMessage(automaticMessage()), false)
  assert.equal(isHumanAgentMessage({ ...automaticMessage(), content: 'Posso conferir os valores para você.' }), true)
})

test('immediate queue pause guard ignores the verified automatic packet, not an actual seller or inbound message', () => {
  const raw = packet(LEGACY_AUTOMATIC_REPLY, 'qa-packet')
  assert.equal(isExternalAutomaticPacket(raw, parseWhatsAppMessage(raw)), true)
  assert.equal(isExternalAutomaticPacket({ ...raw, key: { ...raw.key, fromMe: false } }, parseWhatsAppMessage(raw)), false)
  const seller = packet('Bom dia, sou a vendedora e vou seguir seu atendimento.', 'qa-seller')
  assert.equal(isExternalAutomaticPacket(seller, parseWhatsAppMessage(seller)), false)
})

test('SLA ignores both old untagged and newly tagged external automation; real human sends still finish waiting', () => {
  const first = conversationMetrics([lead], messages, undefined, now.getTime()).leads[lead.id].sla
  assert.equal(first.pendingSince, enteredAt); assert.equal(first.lastResponseSeconds, null); assert.equal(first.lastHumanReplyAt, null)
  const tagged = messages.map(message => message.from === 'agent' ? { ...message, isAutomated: true, automaticReplyKind: 'legacy_fallback' } : message)
  assert.deepEqual(conversationMetrics([lead], tagged, undefined, now.getTime()).leads[lead.id].sla, first)
  const seller = { ...automaticMessage('qa-human', '2026-10-12T20:00:00.000Z'), content: 'Vou confirmar o modelo e os valores para você.' }
  const answered = conversationMetrics([lead], [...messages, seller], undefined, now.getTime()).leads[lead.id].sla
  assert.equal(answered.pendingSince, null); assert.equal(answered.lastResponseSeconds, 681)
})

test('atomic repair restores only the false pause, recovers evidenced showroom fields, retains history and is idempotent', async () => {
  const db = fixture(), before = structuredClone(db.data)
  assert.equal(planExternalAutomationRepairs(db, now)[0].resumed, true)
  assert.deepEqual(await repairExternalAutomationReplies(db, { now }), { resumed: 1, reclassified: 2 })
  const repaired = db.get('leads')[0]
  assert.equal(repaired.aiEnabled, true); assert.equal(repaired.humanAssumedAt, null)
  assert.equal(repaired.modality, 'compra'); assert.equal(repaired.equipmentInterest, 'Cama manual 3 movimentos')
  assert.equal(repaired.addressData.city, 'São José dos Pinhais'); assert.equal(repaired.createdAt, enteredAt)
  assert.equal(repaired.qualificationData.fields.name, undefined) // profile name is not a customer declaration
  assert.deepEqual(db.get('messages').map(m => m.content), before.messages.map(m => m.content))
  assert.deepEqual(db.get('integrationCorrections')[0].leadBefore, before.leads[0])
  assert.deepEqual(db.get('contracts'), before.contracts)
  assert.deepEqual(await repairExternalAutomationReplies(db, { now }), { resumed: 0, reclassified: 0 })
})

test('manual pauses, any real seller intervention, closed/archived leads, signed workflow and existing contracts are never re-enabled', async () => {
  const states = [
    { humanAssumedAt: '2026-10-12T19:50:00.123Z' }, { humanAssumedBy: 'qa-human' }, { aiHandoffReason: 'qualified' },
    { conversationStatus: 'closed' }, { archivedAt: enteredAt }, { stage: 'contrato_gerado' },
    { qualificationData: { status: 'technical_handoff' } }, { aiManualPausedAt: enteredAt },
  ]
  for (const patch of states) {
    const db = fixture({ leads: [{ ...lead, ...patch }] })
    assert.equal((await repairExternalAutomationReplies(db, { now })).resumed, 0)
    assert.equal(db.get('leads')[0].aiEnabled, false)
  }
  for (const extra of [{ messages: [...messages, { ...automaticMessage('real-seller'), content: 'Combinado, vou enviar a proposta.' }] }, { contracts: [{ id: 'qa-contract', leadId: lead.id, status: 'signed' }] }]) {
    const db = fixture(extra)
    assert.equal((await repairExternalAutomationReplies(db, { now })).resumed, 0)
    assert.equal(db.get('leads')[0].aiEnabled, false)
  }
})

test('a customer quoting the old greeting cannot trigger a repair or bypass a seller pause', async () => {
  const db = fixture({ messages: messages.map(message => message.from === 'agent' ? { ...message, from: 'client', whatsappKey: { fromMe: false } } : message) })
  assert.deepEqual(await repairExternalAutomationReplies(db, { now }), { resumed: 0, reclassified: 0 })
  assert.equal(db.get('leads')[0].aiEnabled, false)
})

test('failed durable repair leaves lead, message metadata and recoverable audit unchanged', async () => {
  const db = fixture(), before = structuredClone(db.data)
  db.save = () => false
  await assert.rejects(repairExternalAutomationReplies(db, { now }), /persistir os dados/)
  assert.deepEqual(db.data, before)
})

test('new automatic sends are retained and labelled without pausing AI; the next client reaches the responder once', async () => {
  const db = fixture({ leads: [{ ...lead, aiEnabled: true, humanAssumedAt: null }], messages: [] }), responses = []
  const ingest = createBaileysMessageIngestor({ database: db, respond: async (...args) => responses.push(args) })
  const raw = packet(LEGACY_AUTOMATIC_REPLY, 'qa-live-auto')
  const saved = await ingest(raw)
  assert.equal(saved.from, 'agent'); assert.equal(saved.isAutomated, true); assert.equal(saved.automaticReplyKind, 'legacy_fallback')
  assert.equal(serializeWhatsAppMessage(saved).automaticReplyKind, 'legacy_fallback')
  assert.equal(db.get('leads')[0].aiEnabled, true); assert.equal(db.get('leads')[0].humanAssumedAt, null)
  await ingest(raw)
  await ingest(packet('Preciso comprar uma cama manual.', 'qa-live-client', false))
  assert.equal(responses.length, 1); assert.equal(db.get('messages').length, 2)
  await ingest(packet('Aqui é a vendedora. Vou seguir sua cotação.', 'qa-live-seller'))
  assert.equal(db.get('leads')[0].aiEnabled, false); assert.ok(db.get('leads')[0].humanAssumedAt)
})

test('historical automation never reopens closed conversations or resumes a manually paused AI', async () => {
  const db = fixture({ leads: [{ ...lead, conversationStatus: 'closed' }], messages: [] })
  const ingest = createBaileysMessageIngestor({ database: db, respond: () => assert.fail('history must not respond') })
  await ingest(packet(LEGACY_AUTOMATIC_REPLY, 'qa-history-auto'), { historical: true, live: false })
  assert.equal(db.get('leads')[0].conversationStatus, 'closed'); assert.equal(db.get('leads')[0].aiEnabled, false)
})

test('repaired conversation progresses and does not repeat the legacy fallback or ask the already supplied city', async () => {
  const db = fixture(); await repairExternalAutomationReplies(db, { now })
  let result = await runYriaTurn({ previous: db.get('leads')[0].qualificationData, messages: db.get('messages'), message: { id: 'qa-next', content: 'Meu nome é Ana Teste.' }, generate: async () => ({ provider: { ok: false, code: 'timeout' } }) })
  assert.equal(result.state.fields.modality.value, 'compra'); assert.equal(result.state.fields.city.value, 'São José dos Pinhais')
  assert.equal(result.state.lastAskedField, 'district'); assert.doesNotMatch(result.reply, /Como podemos ajudar hoje|qual cidade/i)
  result = await runYriaTurn({ previous: result.state, message: { id: 'qa-district', content: 'Centro' }, generate: async () => ({ provider: { ok: false, code: 'timeout' } }) })
  assert.equal(result.state.lastAskedField, 'neededAt'); assert.doesNotMatch(result.reply, /Sou a YRIA|Como podemos ajudar hoje|qual cidade/i)
})

test('external greeting during an in-flight YRIA response does not impersonate seller takeover', async () => {
  const db = fixture({ leads: [{ ...lead, aiEnabled: true, humanAssumedAt: null }], messages: [], notifications: [] })
  let release
  const waiting = new Promise(resolve => { release = resolve }), sends = []
  const respond = createYriaResponder({ database: db, evaluate: async () => {
    await waiting
    return runYriaTurn({ message: { id: 'qa-in-flight', content: showroom }, generate: async () => ({ provider: { ok: false, code: 'timeout' } }) })
  }, send: async (_phone, text) => { sends.push(text); return true } })
  const running = respond(db.get('leads')[0], { id: 'qa-in-flight', content: showroom })
  await new Promise(resolve => setTimeout(resolve, 280))
  const ingest = createBaileysMessageIngestor({ database: db })
  await ingest(packet(LEGACY_AUTOMATIC_REPLY, 'qa-concurrent-auto'))
  release(); await running
  assert.equal(sends.length, 1); assert.doesNotMatch(sends[0], /Como podemos ajudar hoje/)
  assert.equal(db.get('leads')[0].aiEnabled, true)
})
