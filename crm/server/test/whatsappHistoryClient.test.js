import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceHistorySnapshot, historySyncBusy } from '../../client/src/lib/historySync.ts'

const job = { leadId: 'a', phase: 'waiting_phone', updatedAt: '2026-10-09T20:00:00Z', deadlineAt: '2026-10-09T20:02:00Z' }

test('authoritative snapshots clear stale jobs after restart while preserving newer live events from the same server', () => {
  const current = { a: { ...job, updatedAt: '2026-10-09T20:00:10Z' }, stale: { ...job, leadId: 'stale' } }
  const snapshot = { a: { ...job, phase: 'paused' } }
  assert.equal(replaceHistorySnapshot(current, snapshot, true).a.updatedAt, current.a.updatedAt)
  assert.equal(replaceHistorySnapshot(current, snapshot, false).a.phase, 'paused')
  assert.equal(replaceHistorySnapshot(current, snapshot, false).stale, undefined)
  assert.deepEqual(replaceHistorySnapshot(current, {}, false), {})
})

test('an HTTP snapshot cannot erase a job created after the snapshot was taken', () => {
  const current = { a: { ...job, updatedAt: '2026-10-09T20:00:10Z' } }
  assert.equal(replaceHistorySnapshot(current, {}, true, '2026-10-09T20:00:05Z').a, current.a)
  assert.equal(replaceHistorySnapshot(current, {}, true, '2026-10-09T20:00:15Z').a, undefined)
})

test('the retry button is released after a deadline or interruption instead of staying disabled forever', () => {
  assert.equal(historySyncBusy(job, Date.parse('2026-10-09T20:00:20Z')), true)
  assert.equal(historySyncBusy(job, Date.parse('2026-10-09T20:02:01Z')), false)
  assert.equal(historySyncBusy({ ...job, phase: 'paused' }, Date.parse('2026-10-09T20:00:20Z')), false)
  assert.equal(historySyncBusy({ ...job, phase: 'timed_out' }, Date.parse('2026-10-09T20:00:20Z')), false)
})
