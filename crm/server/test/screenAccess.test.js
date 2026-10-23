import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedScreens, screensForApi, createScreenGuard, SCREEN_IDS } from '../src/screenAccess.js'

test('usuários sem lista mantêm acesso total; admin sempre total', () => {
  assert.deepEqual(allowedScreens({ role: 'admin', screens: [] }), SCREEN_IDS)
  assert.ok(allowedScreens({ role: 'vendedor' }).includes('finance'))
  assert.ok(!allowedScreens({ role: 'vendedor' }).includes('insights'))
  assert.deepEqual(allowedScreens({ role: 'vendedor', screens: ['whatsapp', 'kanban', 'xx'] }), ['kanban', 'whatsapp'])
})

test('mapeamento de rotas', () => {
  assert.deepEqual(screensForApi('GET', '/api/finance/invoices'), ['finance'])
  assert.deepEqual(screensForApi('POST', '/api/finance/invoices'), ['finance', 'whatsapp'])
  assert.equal(screensForApi('GET', '/api/leads'), null)
  assert.equal(screensForApi('GET', '/api/equipments'), null)
  assert.equal(screensForApi('POST', '/api/integrations/google-ads/ingest'), null)
  assert.equal(screensForApi('GET', '/api/contracts/signing/abc'), null)
  assert.deepEqual(screensForApi('GET', '/api/settings'), ['settings'])
  assert.deepEqual(screensForApi('GET', '/api/leads/x/messages'), ['whatsapp'])
})

test('guarda bloqueia com 403 e libera admin', () => {
  const users = [{ id: 'v', role: 'vendedor', screens: ['whatsapp'] }, { id: 'a', role: 'admin', screens: [] }, { id: 'off', role: 'vendedor', active: false }]
  const guard = createScreenGuard({ db: { get: () => users }, verifyToken: (t) => ({ id: t, role: 'vendedor' }) })
  const run = (id, method, path) => {
    let status = 200; let nextCalled = false
    const res = { status(code) { status = code; return this }, json() { return this } }
    guard({ path, method, headers: { authorization: 'Bearer ' + id } }, res, () => { nextCalled = true })
    return nextCalled ? 200 : status
  }
  assert.equal(run('v', 'GET', '/api/finance/invoices'), 403)
  assert.equal(run('v', 'GET', '/api/leads/1/messages'), 200)
  assert.equal(run('v', 'GET', '/api/leads'), 200)
  assert.equal(run('a', 'GET', '/api/finance/invoices'), 200)
  assert.equal(run('off', 'GET', '/api/leads'), 401)
})
