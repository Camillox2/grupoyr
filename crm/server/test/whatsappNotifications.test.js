import assert from 'node:assert/strict'
import test from 'node:test'
import { notifyBaileysDisconnect } from '../src/whatsappNotifications.js'

const fixture = () => {
  const records = {
    users: [
      { id: 'admin-1', role: 'admin' },
      { id: 'sales-1', role: 'vendedor' },
    ],
    notifications: [],
  }
  const events = []
  const database = {
    get: (collection) => records[collection] || [],
    insert: (collection, notification) => (records[collection].unshift(notification), notification),
  }
  const io = { emit: (...event) => events.push(event) }
  return { records, events, database, io }
}

test('Baileys disconnect persists and emits one admin notification that needs a QR relink', () => {
  const { records, events, database, io } = fixture()
  const notifications = notifyBaileysDisconnect({ database, io, reasonCode: 401, idFactory: () => 'test-id' })

  assert.equal(notifications.length, 1)
  assert.equal(records.notifications.length, 1)
  assert.equal(notifications[0].recipientId, 'admin-1')
  assert.equal(notifications[0].kind, 'whatsapp_disconnected')
  assert.equal(notifications[0].leadId, null)
  assert.match(notifications[0].message, /QR Code/)
  assert.deepEqual(events, [['notification:new', { id: 'ntf_test-id', recipientId: 'admin-1' }]])
})

test('transient Baileys disconnect explains that automatic reconnection is underway', () => {
  const { database, io } = fixture()
  const [notification] = notifyBaileysDisconnect({ database, io, reasonCode: 408, idFactory: () => 'transient' })

  assert.match(notification.message, /reconectar automaticamente/)
})
