import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { renderConsentShell } from '../scripts/consent-shell.mjs'

test('prerendered notice is a simple cookie notice outside the React root', async () => {
  const html = await renderConsentShell('<head></head><body><div id="root"></div></body>')
  assert.match(html, /<body><aside class="yr-tag-consent"/)
  assert.match(html, /Este site utiliza cookies/)
  assert.match(html, />Recusar</)
  assert.match(html, />Entendi</)
  assert.equal((html.match(/id="yr-tag-consent-title"/g) || []).length, 1)
})

test('notice stays hidden only after being dismissed', async () => {
  const html = await renderConsentShell('<head></head><body></body>')
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  for (const setting of [{ saved: null, hide: false }, { saved: 'seen', hide: true }, { fails: true, hide: false }]) {
    const attributes = new Map()
    vm.runInNewContext(bootstrap, {
      localStorage: { getItem() { if (setting.fails) throw new Error('x'); return setting.saved } },
      document: { documentElement: { setAttribute(name, value) { attributes.set(name, value) } } },
    })
    assert.equal(attributes.has('data-yr-consent-hidden'), setting.hide)
  }
})
