import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeMessageNode } from '@whiskeysockets/baileys'
import { createWhatsAppIngress } from '../src/whatsappIngress.js'

const user = { id: '5511999990001:3@s.whatsapp.net', lid: '111111:3@lid' }
const node = {
  tag: 'message', attrs: { id: 'phone_echo', from: '111111:0@lid', recipient: '222222@lid',
    sender_pn: '5511999990001@s.whatsapp.net', recipient_pn: '5511999990002@s.whatsapp.net', addressing_mode: 'lid', t: '1791543600' },
  content: [],
}

test('routes the phone echo to the recipient PN rather than the business sender PN', () => {
  const ingress = createWhatsAppIngress()
  ingress.observeNode(node, user)
  const { fullMessage } = decodeMessageNode(node, user.id, user.lid)
  assert.equal(fullMessage.key.remoteJidAlt, node.attrs.sender_pn)
  const raw = { ...fullMessage, message: { conversation: 'fixture seller reply' } }
  const result = ingress.normalize(raw)
  assert.equal(result.key.fromMe, true)
  assert.equal(result.key.remoteJid, node.attrs.recipient)
  assert.equal(result.key.remoteJidAlt, node.attrs.recipient_pn)
  assert.equal(raw.key.remoteJidAlt, node.attrs.sender_pn)
})

test('does not attach the business phone as the customer when recipient PN is absent', () => {
  const ingress = createWhatsAppIngress()
  ingress.observeNode({ ...node, attrs: { ...node.attrs, recipient_pn: undefined } }, user)
  const { fullMessage } = decodeMessageNode(node, user.id, user.lid)
  assert.equal(ingress.normalize(fullMessage).key.remoteJidAlt, undefined)
})

test('preserves incoming customer addressing and original source objects', () => {
  const ingress = createWhatsAppIngress()
  const incoming = { key: { id: 'in', remoteJid: '222222@lid', remoteJidAlt: '5511999990002@s.whatsapp.net', fromMe: false } }
  assert.equal(ingress.normalize(incoming), incoming)
})

test('exposes only aggregate stages and timestamps, with no message content or identity', () => {
  const ingress = createWhatsAppIngress({ now: () => '2026-10-09T23:00:00.000Z' })
  ingress.start()
  ingress.observeNode(node, user)
  const { fullMessage } = decodeMessageNode(node, user.id, user.lid)
  ingress.upsert(fullMessage)
  ingress.outcome(fullMessage, 'stored')
  ingress.protocolLog([{ error: { message: 'PRIVATE_SECRET' }, key: fullMessage.key }, 'failed to decrypt message'])
  ingress.protocolLog([{ secret: 'PRIVATE_SECRET' }, 'unknown library log'])
  const snapshot = ingress.snapshot()
  assert.equal(snapshot.counts.transport_outgoing, 1)
  assert.equal(snapshot.counts.event_outgoing, 1)
  assert.equal(snapshot.counts.outgoing_stored, 1)
  assert.equal(snapshot.counts.decrypt_failed, 1)
  for (const privateValue of ['PRIVATE_SECRET', user.id, user.lid, node.attrs.id, node.attrs.recipient_pn]) assert.equal(JSON.stringify(snapshot).includes(privateValue), false)
  snapshot.counts.outgoing_stored = 900
  assert.equal(ingress.snapshot().counts.outgoing_stored, 1)
})
