import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createYriaControl, registerYriaControlRoute, yriaReplyAllowed } from '../src/yriaControl.js'
import { createYriaResponder } from '../src/yriaResponder.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture() {
  return {
    data: { leads: [{ id: 'qa', name: 'Cliente fictício', phone: '550000000000', stage: 'novo_lead', aiEnabled: true }], messages: [], users: [{ id: 'seller', role: 'admin' }], notifications: [], settings: {} },
    ready: Promise.resolve(), get(key) { return this.data[key] || [] }, find(key, fn) { return this.get(key).find(fn) }, filter(key, fn) { return this.get(key).filter(fn) }, getSettings() { return this.data.settings },
    insert(key, row) { this.data[key].push(row); return row },
    update(key, id, patch) { const index = this.get(key).findIndex(row => row.id === id); return this.data[key][index] = { ...this.data[key][index], ...patch } },
    save(next) { if (next) this.data = next; return true }, async flush() {},
  }
}
const input = id => ({ id, leadId: 'qa', from: 'client', type: 'text', content: 'Preciso alugar uma cama.', timestamp: new Date().toISOString() })
const result = (extra = {}) => ({ state: { fields: {}, status: 'qualifying', providerFailureCount: 0 }, reply: 'Em qual cidade será a entrega?', summary: '', provider: { ok: true, model: 'fixture' }, ...extra })
const lead = db => db.get('leads')[0]
const options = (extra = {}) => ({ actorId: 'seller', enabled: false, ...extra })

test('pause blocks synchronously and only acknowledges after durable persistence', async () => {
  const db = fixture(), hold = deferred(), entered = deferred(), events = [], cancellations = []
  db.flush = async () => { entered.resolve(); await hold.promise }
  const control = createYriaControl({ database: db, cancel: id => cancellations.push(id), emit: (...args) => events.push(args) })
  const operation = control('qa', options())
  assert.equal(yriaReplyAllowed(db, 'qa', ''), false)
  assert.deepEqual(cancellations, ['qa'])
  await entered.promise
  assert.equal(lead(db).aiEnabled, true); assert.equal(events.length, 0)
  hold.resolve(); const saved = await operation
  assert.equal(saved.aiEnabled, false); assert.ok(saved.aiManualPausedAt); assert.ok(saved.aiControlRevision)
  assert.equal(saved.aiManualPausedBy, 'seller'); assert.equal(events.length, 1)
})

test('failed save is never acknowledged and keeps a runtime safety block until explicit retry', async () => {
  const db = fixture(), control = createYriaControl({ database: db })
  db.save = () => false
  await assert.rejects(control('qa', options()), /persistir/)
  assert.equal(lead(db).aiEnabled, true); assert.equal(yriaReplyAllowed(db, 'qa', ''), false)
  db.save = next => { db.data = next; return true }
  const paused = await control('qa', options())
  const resumed = await control('qa', options({ enabled: true, revision: paused.aiControlRevision }))
  assert.equal(resumed.aiManualPausedAt, null); assert.equal(resumed.humanAssumedAt, null)
  assert.equal(yriaReplyAllowed(db, 'qa', resumed.aiControlRevision), true)
})

test('stale resume cannot undo a pause; explicit fresh revision resumes', async () => {
  const db = fixture(), control = createYriaControl({ database: db })
  const paused = await control('qa', options())
  await assert.rejects(control('qa', options({ enabled: true, revision: '' })), { status: 409 })
  assert.equal(lead(db).aiEnabled, false)
  await control('qa', options({ enabled: true, revision: paused.aiControlRevision }))
  assert.equal(lead(db).aiEnabled, true)
})

test('concurrent controls serialize; latest pause wins and archived lead cannot resume', async () => {
  const db = fixture(), control = createYriaControl({ database: db })
  const first = control('qa', options({ enabled: true })), second = control('qa', options())
  await first; await second
  assert.equal(lead(db).aiEnabled, false)
  db.update('leads', 'qa', { funnelArchive: { at: '2026-10-13T00:00:00Z' } })
  await assert.rejects(control('qa', options({ enabled: true })), { status: 409 })
})

test('route requires authentication, validates input, reports persistence failure and saved state', async t => {
  const db = fixture(), app = express(); app.use(express.json())
  registerYriaControlRoute(app, { database: db, requireAuth: () => (req, res, next) => { if (req.headers.authorization !== 'fixture') return res.status(401).end(); req.user = { id: 'seller' }; next() } })
  const server = app.listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done))
  t.after(() => new Promise(done => server.close(done)))
  const call = body => fetch(`http://127.0.0.1:${server.address().port}/api/leads/qa/toggle-ai`, { method: 'PUT', headers: { authorization: 'fixture', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/leads/qa/toggle-ai`, { method: 'PUT' })).status, 401)
  assert.equal((await call({ enabled: 'false' })).status, 400)
  db.save = () => false
  const failed = await call({ enabled: false }); assert.equal(failed.status, 503); assert.match((await failed.json()).error, /bloqueados/)
  db.save = next => { db.data = next; return true }
  const success = await call({ enabled: false }); assert.equal(success.status, 200); assert.equal((await success.json()).aiEnabled, false)
})

test('paused inbound never invokes provider or sends', async () => {
  const db = fixture(); db.update('leads', 'qa', { aiEnabled: false })
  const respond = createYriaResponder({ database: db, evaluate: () => { throw Error('must not call') }, send: () => { throw Error('must not send') } })
  await respond(lead(db), input('paused')); assert.equal(db.get('messages').length, 0)
})

for (const resume of [false, true]) test(`pause during generation discards old reply${resume ? ' even after resume' : ''}`, async () => {
  const db = fixture(), started = deferred(), generated = deferred(), sent = []
  const respond = createYriaResponder({ database: db, evaluate: async () => { started.resolve(); return generated.promise }, send: async (...args) => { sent.push(args); return true } })
  const control = createYriaControl({ database: db, cancel: respond.cancel })
  const running = respond(lead(db), input('in-flight')); await started.promise
  const paused = await control('qa', options())
  if (resume) await control('qa', options({ enabled: true, revision: paused.aiControlRevision }))
  generated.resolve(result()); await running
  assert.equal(sent.length, 0); assert.equal(db.get('messages').length, 0); assert.equal(db.get('notifications').length, 0)
})

test('fresh resumed worker is not removed by old cancelled worker cleanup', async () => {
  const db = fixture(), firstStarted = deferred(), firstDone = deferred(), secondStarted = deferred(), secondDone = deferred(), sent = []; let calls = 0
  const respond = createYriaResponder({ database: db, evaluate: async () => { calls++; if (calls === 1) { firstStarted.resolve(); return firstDone.promise } secondStarted.resolve(); return secondDone.promise }, send: async (_phone, text) => { sent.push(text); return true } })
  const control = createYriaControl({ database: db, cancel: respond.cancel })
  const old = respond(lead(db), input('old')); await firstStarted.promise
  const paused = await control('qa', options()); await control('qa', options({ enabled: true, revision: paused.aiControlRevision }))
  const fresh = respond(lead(db), input('fresh')); await secondStarted.promise
  firstDone.resolve(result()); await old
  const pausedAgain = await control('qa', options()); secondDone.resolve(result()); await fresh
  assert.equal(sent.length, 0)
  await control('qa', options({ enabled: true, revision: pausedAgain.aiControlRevision }))
  await respond(lead(db), input('final')); assert.equal(sent.length, 1)
})

test('pause between message emission and transport cancels pending UI message without delivery', async () => {
  const db = fixture(), sent = []; let pause
  const respond = createYriaResponder({ database: db, evaluate: async () => result(), send: async () => { sent.push(true); return true }, emit: event => { if (event === 'message:new') pause = control('qa', options()) } })
  const control = createYriaControl({ database: db, cancel: respond.cancel })
  await respond(lead(db), input('between')); await pause
  assert.equal(sent.length, 0); assert.equal(db.get('messages')[0].deliveryStatus, 'cancelled')
})

test('own final handoff sends once, then subsequent customer input does not restart AI', async () => {
  const db = fixture(), sent = []
  const respond = createYriaResponder({ database: db, evaluate: async () => result({ handoff: true, reason: 'qualified' }), send: async (_phone, text, guard) => { assert.equal(guard.isAllowed(), true); sent.push(text); return true } })
  await respond(lead(db), input('handoff')); await respond(lead(db), input('after'))
  assert.equal(sent.length, 1); assert.equal(lead(db).aiEnabled, false)
})

test('pause during automatic contract work suppresses even error fallback', async () => {
  const db = fixture(), started = deferred(), finished = deferred(), sent = []
  const respond = createYriaResponder({ database: db, evaluate: async () => result({ automation: { attemptId: 'fixture' } }), automationService: { fulfill: async () => { started.resolve(); await finished.promise; throw Error('cancelled') } }, send: async () => { sent.push(true) } })
  const control = createYriaControl({ database: db, cancel: respond.cancel })
  const running = respond(lead(db), input('contract')); await started.promise; await control('qa', options()); finished.resolve(); await running
  assert.equal(sent.length, 0); assert.equal(db.get('messages').length, 0)
})
