import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { registerOperationsRoutes } from '../src/operations.js'

function fixture() {
  const records = {
    users: [{ id: 'user-1', name: 'Equipe YR', role: 'tecnico', passwordHash: 'never expose' }],
    leads: [{ id: 'lead-1', name: 'Cliente real' }],
    contracts: [{ id: 'contract-1', number: 'YR-001', leadId: 'lead-1', clientName: 'Cliente real', equipmentIds: ['equipment-1'] }],
    equipments: [{ id: 'equipment-1', name: 'Cama hospitalar' }],
    invoices: [{ id: 'invoice-1', leadId: 'lead-1', contractNumber: 'YR-001' }],
    calendarEvents: [],
    contractExpenses: [],
  }
  const db = {
    get: (collection) => records[collection] || [],
    find: (collection, predicate) => (records[collection] || []).find(predicate),
    insert: (collection, record) => (records[collection] ||= []).unshift(record) && record,
    update: (collection, id, updates) => {
      const index = (records[collection] || []).findIndex((item) => item.id === id)
      if (index < 0) return null
      records[collection][index] = { ...records[collection][index], ...updates }
      return records[collection][index]
    },
    delete: (collection, id) => {
      records[collection] = (records[collection] || []).filter((item) => item.id !== id)
      return true
    },
  }
  const app = express()
  app.use(express.json())
  const requireAuth = () => (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ error: 'unauthorized' })
    req.user = { id: 'user-1', name: 'Equipe YR', role: 'tecnico' }
    next()
  }
  registerOperationsRoutes(app, { db, requireAuth, idFactory: (() => { let id = 0; return () => `test-${++id}` })() })
  return { app, records }
}

async function withServer(app, run) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

const auth = { Authorization: 'Bearer test-token' }

test('calendar API authenticates, creates, updates and deletes an associated event', async () => {
  const { app, records } = fixture()
  await withServer(app, async (base) => {
    const denied = await fetch(`${base}/api/calendar/events`)
    assert.equal(denied.status, 401)
    const createdResponse = await fetch(`${base}/api/calendar/events`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Entrega combinada', type: 'entrega', date: '2026-10-01', leadId: 'lead-1', contractId: 'contract-1', equipmentId: 'equipment-1', assignedTo: 'user-1' }),
    })
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.equal(created.leadId, 'lead-1')
    assert.equal(created.assignedTo, 'user-1')
    const updatedResponse = await fetch(`${base}/api/calendar/events/${created.id}`, {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...created, status: 'done', title: 'Entrega concluída', leadId: null, contractId: null, equipmentId: null, invoiceId: null, assignedTo: null }),
    })
    const updated = await updatedResponse.json()
    assert.equal(updated.status, 'done')
    assert.equal(updated.contractId, null)
    assert.equal(updated.assignedTo, null)
    const deleteResponse = await fetch(`${base}/api/calendar/events/${created.id}`, { method: 'DELETE', headers: auth })
    assert.equal(deleteResponse.status, 200)
    assert.equal(records.calendarEvents.length, 0)
  })
})

test('linking a billing event to an invoice resolves its real contract and client', async () => {
  const { app } = fixture()
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/calendar/events`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Cobrança', type: 'cobranca', date: '2026-10-01', invoiceId: 'invoice-1', leadId: null, contractId: null }),
    })
    assert.equal(response.status, 201)
    const event = await response.json()
    assert.equal(event.contractId, 'contract-1')
    assert.equal(event.leadId, 'lead-1')
  })
})

test('calendar API rejects invented dates and mismatched equipment associations', async () => {
  const { app } = fixture()
  await withServer(app, async (base) => {
    for (const body of [
      { title: 'Data impossível', type: 'entrega', date: '2026-02-30' },
      { title: 'Equipamento de outro contrato', type: 'entrega', date: '2026-10-01', contractId: 'contract-1', equipmentId: 'missing' },
    ]) {
      const response = await fetch(`${base}/api/calendar/events`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      assert.equal(response.status, 400)
    }
  })
})

test('contract costs are validated, tied to contract/client, editable and removable', async () => {
  const { app, records } = fixture()
  await withServer(app, async (base) => {
    const create = await fetch(`${base}/api/finance/contract-expenses`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: 'contract-1', category: 'entrega', description: 'Frete', amount: 35.5, date: '2026-09-23' }),
    })
    assert.equal(create.status, 201)
    const expense = await create.json()
    assert.equal(expense.clientName, 'Cliente real')
    assert.equal(expense.contractNumber, 'YR-001')
    const invalid = await fetch(`${base}/api/finance/contract-expenses`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: 'contract-1', category: 'entrega', description: 'Valor inválido', amount: 0, date: '2026-09-23' }),
    })
    assert.equal(invalid.status, 400)
    const update = await fetch(`${base}/api/finance/contract-expenses/${expense.id}`, {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: 'contract-1', category: 'manutencao', description: 'Reparo', amount: 50, date: '2026-09-24' }),
    })
    assert.equal((await update.json()).amount, 50)
    const del = await fetch(`${base}/api/finance/contract-expenses/${expense.id}`, { method: 'DELETE', headers: auth })
    assert.equal(del.status, 200)
    assert.equal(records.contractExpenses.length, 0)
  })
})

test('team endpoint returns public fields only', async () => {
  const { app } = fixture()
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/team`, { headers: auth })
    assert.deepEqual(await response.json(), [{ id: 'user-1', name: 'Equipe YR', role: 'tecnico' }])
  })
})
