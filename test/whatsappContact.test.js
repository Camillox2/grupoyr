import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openWhatsAppContact } from '../src/whatsappContact.js'

test('contact navigation remains intact while the local tracking signal omits message text', t => {
  const originals = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent }
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  })
  const opened = [], events = []
  globalThis.window = { location: { href: 'https://grupoyrhospitalar.com.br/' }, open: (...args) => { opened.push(args); return null } }
  globalThis.document = { dispatchEvent: event => events.push(event) }
  globalThis.CustomEvent = class { constructor(type, { detail }) { this.type = type; this.detail = detail } }
  const url = 'https://api.whatsapp.com/send?phone=5541997714985&text=private-name-and-message#private-fragment'
  openWhatsAppContact(url)
  assert.deepEqual(opened, [[url, '_blank', 'noopener,noreferrer']])
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'yr:whatsapp-contact')
  assert.equal(events[0].detail.url, 'https://api.whatsapp.com/send?phone=5541997714985')
  assert.equal(JSON.stringify(events).includes('private'), false)
  globalThis.document.dispatchEvent = () => { throw new Error('tracking unavailable') }
  assert.doesNotThrow(() => openWhatsAppContact('https://wa.me/5541997714985?text=private'))
  assert.equal(opened.length, 2)
  globalThis.window.open = () => { throw new Error('navigation failed') }
  globalThis.document.dispatchEvent = event => events.push(event)
  assert.throws(() => openWhatsAppContact('https://wa.me/5541997714985'), /navigation failed/)
  assert.equal(events.length, 1, 'failed navigation dispatches no contact signal')
})
