import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import sharp from 'sharp'
import { conversationMetrics, normalizeConversationSla, registerConversationRoutes } from '../src/conversationMetrics.js'
import { createContactPhotoService, safeProfileUrl } from '../src/contactPhotos.js'
import { chatDayKey, chatDayLabel, leadMatchesDay, conversationSlaLabel, chatListTime, chatDateTime } from '../../client/src/lib/chatTimeline.ts'
const lead = { id: 'qa', name: 'Contato fictício', phone: '554100000000', createdAt: '2026-10-11T12:00:00Z' }
const message = (id, from, time, extra = {}) => ({ id, leadId: lead.id, from, timestamp: '2026-10-11T' + time + ':00Z', ...extra })
const now = Date.parse('2026-10-11T12:30:00Z')
test('SLA is 15 minutes; bots, failed drafts, history order and repeat customer messages do not reset human wait', () => {
  const messages = [message('b', 'client', '12:10'), message('a', 'client', '12:01'), message('c', 'ai', '12:11'), message('d', 'agent', '12:15', { deliveryStatus: 'failed' })]
  const before = structuredClone(messages)
  const result = conversationMetrics([lead], messages, undefined, now).leads.qa
  assert.equal(result.sla.goalMinutes, 15); assert.equal(result.sla.pendingSince, '2026-10-11T12:01:00.000Z')
  assert.equal(conversationSlaLabel(result, now).tone, 'late'); assert.deepEqual(messages, before)
  const replied = conversationMetrics([lead], [...messages, message('e', 'agent', '12:20', { deliveryStatus: 'sent' })], undefined, now).leads.qa
  assert.equal(replied.sla.pendingSince, null); assert.equal(replied.sla.lastResponseSeconds, 19 * 60)
  const pending = conversationMetrics([lead], [...messages, message('e', 'agent', '12:20', { deliveryStatus: 'pending_connection' })], undefined, now).leads.qa
  assert.ok(pending.sla.pendingSince)
})
test('closed and reopened conversations, future/invalid messages and independent clients', () => {
  const rows = [message('a', 'client', '12:01'), message('invalid', 'client', 'bad'), message('future', 'client', '23:00')]
  assert.equal(conversationMetrics([{ ...lead, conversationStatus: 'closed' }], rows, undefined, now).leads.qa.sla.pendingSince, null)
  assert.equal(conversationMetrics([{ ...lead, reopenedAt: '2026-10-11T12:15:00Z' }], rows, undefined, now).leads.qa.sla.pendingSince, null)
  assert.equal(conversationMetrics([lead, { ...lead, id: 'other' }], rows, undefined, now).leads.other.sla.pendingSince, null)
  assert.throws(() => normalizeConversationSla({ goalMinutes: -1 })); assert.throws(() => normalizeConversationSla({ goalMinutes: '15' }))
  assert.equal(normalizeConversationSla({ goalMinutes: 10 }).goalMinutes, 10)
})
test('São Paulo calendar filters and day separators do not use the last message date or UTC midnight', () => {
  const midnight = Date.parse('2026-10-12T01:00:00Z')
  assert.equal(chatDayKey('2026-10-12T01:00:00Z'), '2026-10-11')
  assert.match(chatDayLabel('2026-10-12T01:00:00Z', midnight), /Hoje.*11\/10\/2026/)
  assert.match(chatDayLabel('2026-10-11T01:00:00Z', midnight), /Ontem.*10\/10\/2026/)
  assert.equal(leadMatchesDay('2026-10-12T01:00:00Z', 'today', midnight), true)
  assert.equal(leadMatchesDay('invalid', 'today', midnight), false)
  assert.equal(leadMatchesDay('invalid', 'all', midnight), true)
  assert.equal(chatListTime('2026-10-11T01:00:00Z', midnight), 'Ontem')
})
test('photo lookup respects privacy, caches and deduplicates, compresses WebP without metadata', async () => {
  let lookups = 0
  const raw = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2168b4' } }).jpeg().toBuffer()
  const service = createContactPhotoService({ getConnection: () => ({ provider: 'baileys', status: 'connected', sessionId: 'qa', socket: { profilePictureUrl: async () => { lookups++; return 'https://pps.whatsapp.net/photo.jpg' } } }), download: async () => raw })
  const [one, two] = await Promise.all([service.get(lead), service.get(lead)])
  assert.deepEqual(one, two); assert.equal(lookups, 1)
  assert.equal((await sharp(one).metadata()).format, 'webp'); assert.ok(one.length < 100 * 1024)
  await service.get(lead); assert.equal(lookups, 1)
  for (const url of ['http://pps.whatsapp.net/a', 'https://whatsapp.net.evil.test/a', 'https://localhost/a', 'https://u:p@pps.whatsapp.net/a']) assert.throws(() => safeProfileUrl(url))
  const denied = createContactPhotoService({ getConnection: () => ({ provider: 'baileys', status: 'connected', socket: { profilePictureUrl: async () => { throw Error('privacy') } } }) })
  assert.equal(await denied.get(lead), null)
  assert.equal(await createContactPhotoService({ getConnection: () => ({ provider: 'meta', status: 'connected' }) }).get(lead), null)
})
test('date-only entry keeps the calendar day without inventing an entry hour, invalid calendar days stay unknown', () => {
  const metric = conversationMetrics([{ ...lead, createdAt: '2026-10-11' }], [], undefined, now).leads.qa
  assert.equal(metric.enteredAt, '2026-10-11'); assert.equal(chatDateTime(metric.enteredAt), '11/10/2026')
  assert.equal(chatDayKey('2026-10-11'), '2026-10-11'); assert.equal(chatDayKey('2026-02-31'), '')
  assert.equal(conversationMetrics([{ ...lead, createdAt: '2026-02-31' }], [], undefined, now).leads.qa.enteredAt, null)
})
test('hung photo requests stop at deadline, never block messages; URLs outside WhatsApp are not downloaded', async () => {
  let downloads = 0
  const connection = source => ({ provider: 'baileys', status: 'connected', socket: { profilePictureUrl: () => source } })
  const hung = createContactPhotoService({ getConnection: () => connection(new Promise(() => {})), timeoutMs: 15 })
  assert.equal(await hung.get(lead), null)
  const blocked = createContactPhotoService({ getConnection: () => connection(Promise.resolve('https://evil.test/p')), download: async () => { downloads++; return Buffer.alloc(1) } })
  assert.equal(await blocked.get(lead), null); assert.equal(downloads, 0)
})
test('metrics and pictures require authentication, missing/private photo returns no image and no URL', async t => {
  const app = express(), database = { get: key => key === 'leads' ? [lead] : [], find: (key, fn) => key === 'leads' ? [lead].find(fn) : null, getSettings: () => ({}) }
  const requireAuth = () => (req, res, next) => req.headers.authorization === 'fixture' ? next() : res.status(401).end()
  registerConversationRoutes(app, { database, requireAuth, photos: { get: async () => null }, now: () => now })
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close())
  const origin = 'http://127.0.0.1:' + server.address().port
  for (const path of ['/api/conversations/metrics', '/api/leads/qa/avatar']) assert.equal((await fetch(origin + path)).status, 401)
  assert.equal((await fetch(origin + '/api/leads/qa/avatar', { headers: { Authorization: 'fixture' } })).status, 204)
  const response = await fetch(origin + '/api/conversations/metrics', { headers: { Authorization: 'fixture' } })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal((await response.json()).leads.qa.enteredAt, '2026-10-11T12:00:00.000Z')
})
