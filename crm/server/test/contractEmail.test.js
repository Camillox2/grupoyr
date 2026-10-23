import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEmailStore, createContractEmail, registerContractEmailRoutes, validEmail } from '../src/contractEmail.js'
import express from 'express'
import http from 'node:http'

function fixture(t, override = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-email-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createEmailStore(directory)
  const contract = { id: 'qa-contract', number: 'QA-2026-01', clientName: 'Cliente fictício <QA>', clientEmail: 'client@example.invalid', leadId: 'qa-lead', status: 'pendente_assinatura', signingToken: 'only-fixture-token', signedAt: null, createdAt: '2026-10-10T12:00:00.000Z' }
  const lead = { id: 'qa-lead', email: 'client@example.invalid' }
  const db = { find: (collection, predicate) => (collection === 'contracts' ? [contract] : [lead]).find(predicate), update: (_collection, _id, data) => Object.assign(contract, data) }
  const sent = [], options = []
  let verified = 0
  const params = { store, db, ensureToken: row => row, publicUrl: () => 'https://crm.example.invalid', createPdf: async () => Buffer.from('%PDF-fixture-only'), makeTransport: opts => {
    options.push(opts)
    return { sendMail: async message => { sent.push(message); return { accepted: [message.to.address], messageId: '<qa@example.invalid>' } }, verify: async () => { verified++ }, close() {} }
  }, ...override }
  const service = createContractEmail(params)
  t.after(() => service.stop())
  const configure = extra => service.saveSettings({ user: 'sender@example.invalid', companyEmail: 'company@example.invalid', password: 'fixture-not-a-real-password', enabled: true, ...extra })
  return { directory, store, contract, lead, db, service, sent, options, configure, verified: () => verified, params }
}
const key = 'fixture_idempotency_000001'
const waitForJobs = async service => { for (let i = 0; i < 100; i++) { if (!service.history('qa-contract').some(job => ['queued', 'sending'].includes(job.status))) return; await new Promise(resolve => setTimeout(resolve, 5)) } assert.fail('queue did not finish') }

test('email validation rejects header injection and multiple recipients', () => {
  for (const email of ['client@example.invalid', 'a+b@example.com.br']) assert.ok(validEmail(email))
  for (const email of ['a@example.com\r\nBcc:x@a.com', 'a@localhost', 'a@example.com,b@b.com', 'Name <a@example.com>', 'a..b@example.com']) assert.equal(validEmail(email), false)
})
test('unconfigured integration is off and cannot send', t => {
  const f = fixture(t)
  assert.equal(f.service.settings().enabled, false)
  assert.equal(f.service.settings().signedCopies, false)
  assert.equal(f.service.settings().autoSendOnCreate, false)
  assert.throws(() => f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key }), /Configure/)
  assert.equal(f.sent.length, 0)
})
test('credentials are encrypted and never returned; empty password preserves secret', t => {
  const f = fixture(t); f.configure()
  assert.equal(f.service.settings().password, undefined)
  assert.equal(f.service.settings().passwordConfigured, true)
  assert.ok(!fs.readFileSync(path.join(f.directory, 'smtp-config.enc.json'), 'utf8').includes('fixture-not-a-real-password'))
  f.configure({ password: '' })
  assert.equal(f.store.readConfig().password, 'fixture-not-a-real-password')
  const restored = createEmailStore(f.directory)
  assert.equal(restored.readConfig().user, 'sender@example.invalid')
})
test('connection verification authenticates without sending an email', async t => {
  const f = fixture(t); f.configure()
  await f.service.verify()
  assert.equal(f.verified(), 1); assert.equal(f.sent.length, 0)
  assert.equal(f.options[0].host, 'mail.spacemail.com')
  assert.equal(f.options[0].port, 465); assert.equal(f.options[0].secure, true)
  assert.equal(f.options[0].tls.rejectUnauthorized, true)
  assert.equal(f.options[0].disableUrlAccess, true)
})
test('manual request attaches PDF and sends personal link once, history strips token', async t => {
  const f = fixture(t); f.configure()
  const input = { to: f.lead.email, idempotencyKey: key }
  f.service.send(f.contract, input, { id: 'qa-user' })
  await waitForJobs(f.service)
  f.service.send(f.contract, input, { id: 'qa-user' })
  assert.equal(f.sent.length, 1)
  assert.ok(f.sent[0].text.includes('https://crm.example.invalid/assinar/only-fixture-token'))
  assert.ok(!f.sent[0].html.includes('<QA>'))
  assert.ok(Buffer.isBuffer(f.sent[0].attachments[0].content))
  assert.equal(f.service.history(f.contract.id)[0].status, 'accepted')
  assert.ok(!JSON.stringify(f.service.history(f.contract.id)).includes('only-fixture-token'))
  assert.equal(f.contract.emailRecipient, f.lead.email)
})
test('idempotency keys cannot be reused for another email', async t => {
  const f = fixture(t); f.configure()
  f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key })
  await waitForJobs(f.service)
  assert.throws(() => f.service.send(f.contract, { to: 'other@example.invalid', idempotencyKey: key }), /outro envio/)
})
test('invalid email, cancelled contract, missing URL and token cannot send', t => {
  const f = fixture(t); f.configure()
  assert.throws(() => f.service.send(f.contract, { to: 'bad', idempotencyKey: key }), /válido/)
  f.contract.status = 'cancelado'
  assert.throws(() => f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key }), /disponível/)
  const g = fixture(t, { publicUrl: () => 'http://localhost:3001' }); g.configure()
  assert.throws(() => g.service.send(g.contract, { to: g.lead.email, idempotencyKey: key }), /HTTPS/)
  const h = fixture(t, { ensureToken: row => ({ ...row, signingToken: null }) }); h.configure()
  assert.throws(() => h.service.send(h.contract, { to: h.lead.email, idempotencyKey: key }), /sem link/)
})
test('SMTP failure is recorded without exposing credentials or changing signature', async t => {
  const f = fixture(t, { makeTransport: () => ({ sendMail: async () => { throw Object.assign(new Error('secret fixture password'), { code: 'EAUTH' }) } }) }); f.configure()
  f.contract.signedAt = '2026-10-10T12:00:00Z'; f.contract.status = 'assinado'
  f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key })
  await waitForJobs(f.service)
  const job = f.service.history(f.contract.id)[0]
  assert.equal(job.status, 'failed'); assert.ok(!JSON.stringify(job).includes('secret'))
  assert.equal(f.contract.status, 'assinado')
})
test('ambiguous SMTP interruption is not automatically retried on restart', async t => {
  const f = fixture(t, { makeTransport: () => ({ sendMail: async () => { throw Object.assign(new Error('lost connection'), { code: 'ETIMEDOUT' }) } }) }); f.configure()
  f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key })
  await waitForJobs(f.service)
  assert.equal(f.service.history(f.contract.id)[0].status, 'unknown')
  const restored = createContractEmail(f.params)
  await restored.processQueue()
  assert.equal(restored.history(f.contract.id)[0].status, 'unknown')
})
test('interrupted sending state becomes unknown rather than a duplicate', t => {
  const f = fixture(t)
  f.store.writeJobs([{ id: 'qa-job', contractId: f.contract.id, to: f.lead.email, status: 'sending' }])
  const restored = createContractEmail(f.params)
  assert.equal(restored.history(f.contract.id)[0].status, 'unknown')
})

test('damaged email history fails closed without taking down the CRM or deleting the ledger', async t => {
  const f = fixture(t)
  const restored = createContractEmail({ ...f.params, store: { ...f.store, readJobs: () => { throw new Error('corrupted JSON') } } })
  assert.throws(() => restored.settings(), error => error.status === 503)
  assert.throws(() => restored.send(f.contract, { to: f.lead.email, idempotencyKey: key }), /histórico de e-mail/)
  await restored.processQueue()
  assert.equal(f.sent.length, 0)
  assert.equal(f.contract.status, 'pendente_assinatura')
})
test('opt-in signed copies go to customer and company exactly once', async t => {
  const f = fixture(t); f.configure({ signedCopies: true })
  f.contract.status = 'assinado'; f.contract.signedAt = '2026-10-10T12:00:00.000Z'
  f.service.onSigned(f.contract)
  await waitForJobs(f.service)
  assert.equal(f.sent.length, 2)
  assert.deepEqual(f.sent.map(message => message.to.address).sort(), ['client@example.invalid', 'company@example.invalid'])
  assert.ok(f.sent.every(message => /-assinado.pdf$/.test(message.attachments[0].filename)))
  f.service.onSigned(f.contract); await f.service.processQueue()
  assert.equal(f.sent.length, 2)
})
test('creating contract sends nothing by default; opted-in queue persists across restart', async t => {
  const f = fixture(t); f.configure()
  f.service.onCreated(f.contract)
  assert.equal(f.service.history(f.contract.id).length, 0)
  f.configure({ autoSendOnCreate: true })
  f.service.onCreated(f.contract)
  await waitForJobs(f.service)
  assert.equal(f.sent.length, 1)
  assert.equal(createContractEmail(f.params).history(f.contract.id)[0].status, 'accepted')
})
test('PDF preparation failure sends no email', async t => {
  const f = fixture(t, { createPdf: async () => { throw new Error('PDF failure') } }); f.configure()
  f.service.send(f.contract, { to: f.lead.email, idempotencyKey: key })
  await waitForJobs(f.service)
  assert.equal(f.sent.length, 0); assert.equal(f.service.history(f.contract.id)[0].status, 'failed')
})
test('API requires authentication and only administrators may configure SMTP', async t => {
  const f = fixture(t)
  const app = express(); app.use(express.json())
  const requireAuth = (roles = []) => (req, res, next) => { const role = req.headers['x-fixture-role']; if (!role) return res.sendStatus(401); if (roles.length && !roles.includes(role)) return res.sendStatus(403); req.user = { id: 'qa', role }; next() }
  registerContractEmailRoutes(app, { service: f.service, db: f.db, requireAuth })
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${origin}/api/email/settings`)).status, 401)
  assert.equal((await fetch(`${origin}/api/email/settings`, { headers: { 'x-fixture-role': 'vendedor' } })).status, 403)
  const response = await fetch(`${origin}/api/email/settings`, { headers: { 'x-fixture-role': 'admin' } })
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal((await fetch(`${origin}/api/contracts/qa-contract/send-email`, { method: 'POST' })).status, 401)
})
