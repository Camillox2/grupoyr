import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistorySyncTracker, HISTORY_SYNC_LIMITS, serializeHistoryJob } from '../src/whatsappHistorySync.js'

test('history continues independently of the requesting screen and reports real processed counts', () => {
  let time = Date.parse('2026-10-09T20:00:00Z')
  const events = []
  const tracker = createHistorySyncTracker({ now: () => time, emit: value => events.push(value) })
  const first = tracker.start('lead_test')
  assert.equal(first.started, true)
  tracker.requested('lead_test')
  assert.equal(tracker.get('lead_test').phase, 'waiting_phone')
  time += 5000
  tracker.beginBatch('lead_test', 2)
  tracker.processed('lead_test', true)
  tracker.finishBatch('lead_test')
  assert.equal(tracker.get('lead_test').phase, 'processing')
  tracker.processed('lead_test')
  tracker.finishBatch('lead_test')
  assert.equal(tracker.get('lead_test').phase, 'completed')
  assert.equal(tracker.get('lead_test').processed, 2)
  assert.equal(tracker.get('lead_test').imported, 1)
  assert.deepEqual(tracker.all().lead_test, tracker.get('lead_test'))
  assert.ok(events.every((event, index) => index === 0 || Date.parse(event.updatedAt) > Date.parse(events[index - 1].updatedAt)))
})

test('deduplicates active requests, permits retry after a minute waiting and keeps conversations separate', () => {
  let time = 1800000000000
  const tracker = createHistorySyncTracker({ now: () => time })
  tracker.start('a'); tracker.requested('a'); tracker.start('b'); tracker.requested('b')
  assert.equal(tracker.start('a').started, false)
  time += 61000
  assert.equal(tracker.start('a').started, true)
  assert.equal(tracker.get('b').phase, 'waiting_phone')
})

test('does not report completion while WhatsApp reports more chunks and does not regress after HTTP resolves', () => {
  const tracker = createHistorySyncTracker()
  tracker.start('a'); tracker.beginBatch('a', 1, 50); tracker.processed('a', true); tracker.finishBatch('a')
  assert.equal(tracker.get('a').phase, 'waiting_phone')
  tracker.beginBatch('a', 1, 100); tracker.processed('a', true); tracker.finishBatch('a'); tracker.requested('a')
  assert.equal(tracker.get('a').phase, 'completed')
  assert.equal(tracker.get('a').received, 2)
})

test('distinguishes empty results, unavailable history and request failure without invented percentages', () => {
  const tracker = createHistorySyncTracker()
  tracker.start('empty'); tracker.beginBatch('empty', 0); tracker.finishBatch('empty')
  assert.equal(tracker.get('empty').phase, 'completed')
  assert.equal(tracker.get('empty').providerProgress, null)
  tracker.start('missing'); tracker.unavailable('missing')
  tracker.start('failure'); tracker.fail('failure')
  assert.equal(tracker.get('missing').phase, 'no_history')
  assert.equal(tracker.get('failure').phase, 'error')
  assert.ok(tracker.get('failure').error)
  assert.equal(tracker.active().length, 0)
})

test('phone silence expires after two minutes and releases the request for retry', () => {
  let time = 1800000000000
  const tracker = createHistorySyncTracker({ now: () => time })
  tracker.start('a'); tracker.requested('a')
  time += HISTORY_SYNC_LIMITS.waiting_phone + 1
  tracker.expire()
  assert.equal(tracker.get('a').phase, 'timed_out')
  assert.equal(tracker.active().length, 0)
  assert.ok(tracker.get('a').finishedAt)
  assert.equal(tracker.start('a').started, true)
})

test('durable state restores unfinished work after restart and resumes from its original anchor', async () => {
  let time = 1800000000000
  const records = new Map()
  const persist = async job => records.set(job.leadId, structuredClone(job))
  const first = createHistorySyncTracker({ now: () => time, persist })
  first.start('a')
  first.setAnchor('a', { key: { id: 'original_message', remoteJid: 'fixture@s.whatsapp.net' }, timestamp: time })
  first.requested('a'); first.beginBatch('a', 3); first.processed('a', true)
  await first.flush()
  time += 1000
  const restarted = createHistorySyncTracker({ now: () => time, persist })
  restarted.restore([...records.values()])
  assert.equal(restarted.get('a').phase, 'paused')
  assert.equal(restarted.get('a').pauseReason, 'server_restart')
  assert.equal(restarted.get('a').imported, 1)
  const resumed = restarted.resume('a')
  assert.equal(resumed.started, true)
  assert.equal(resumed.job.attempts, 2)
  assert.equal(resumed.job.anchor.key.id, 'original_message')
  assert.equal(resumed.job.received, 0)
  assert.notEqual(resumed.job.runId, first.get('a').runId)
  await restarted.flush()
  assert.equal(records.get('a').phase, 'requesting')
  assert.equal(serializeHistoryJob(resumed.job).anchor, undefined)
})

test('a stale restored job becomes timed out instead of spinning after restart', () => {
  let time = 1800000000000
  const tracker = createHistorySyncTracker({ now: () => time })
  tracker.start('a'); tracker.requested('a')
  const saved = structuredClone(tracker.all().a)
  time += HISTORY_SYNC_LIMITS.waiting_phone + 1
  const restarted = createHistorySyncTracker({ now: () => time })
  restarted.restore([saved])
  assert.equal(restarted.get('a').phase, 'timed_out')
  assert.equal(restarted.resumable().length, 0)
})

test('disconnect pauses work, preserves imported messages and rejects callbacks from an older attempt', () => {
  let time = 1800000000000
  const tracker = createHistorySyncTracker({ now: () => time })
  const old = tracker.start('a').job
  tracker.beginBatch('a', 2, undefined, old.runId); tracker.processed('a', true, old.runId)
  tracker.pauseAll()
  time += 600000
  assert.equal(tracker.get('a').phase, 'paused')
  const next = tracker.resume('a').job
  assert.equal(next.imported, 1)
  tracker.requested('a', old.runId); tracker.fail('a', old.runId); tracker.beginBatch('a', 1, 100, old.runId)
  assert.equal(tracker.get('a').phase, 'requesting')
  tracker.requested('a', next.runId)
  assert.equal(tracker.get('a').phase, 'waiting_phone')
})

test('automatic retries are bounded and a manual retry starts a fresh attempt', () => {
  const tracker = createHistorySyncTracker()
  tracker.start('a'); tracker.pauseAll(); tracker.resume('a'); tracker.pauseAll(); tracker.resume('a'); tracker.pauseAll()
  assert.equal(tracker.resume('a').started, false)
  assert.equal(tracker.get('a').phase, 'timed_out')
  assert.equal(tracker.start('a').job.attempts, 1)
})

test('request and processing stalls expire, while actual processing renews its deadline', () => {
  let time = 1800000000000
  const tracker = createHistorySyncTracker({ now: () => time })
  tracker.start('request')
  time += HISTORY_SYNC_LIMITS.requesting + 1
  assert.equal(tracker.get('request').phase, 'timed_out')
  tracker.start('media'); tracker.beginBatch('media', 3)
  time += 70000
  tracker.processed('media', true)
  time += 70000
  assert.equal(tracker.get('media').phase, 'processing')
  time += 20001
  assert.equal(tracker.get('media').phase, 'timed_out')
  assert.equal(tracker.get('media').imported, 1)
})

test('a storage failure rejects durable acknowledgement and produces a recoverable error state', async () => {
  const tracker = createHistorySyncTracker({ persist: async () => { throw new Error('fixture storage unavailable') } })
  tracker.start('a')
  await assert.rejects(tracker.flush(), /fixture storage unavailable/)
  assert.equal(tracker.get('a').phase, 'error')
  assert.equal(tracker.active().length, 0)
})
