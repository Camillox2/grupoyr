import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { renderConsentShell } from '../scripts/consent-shell.mjs'

test('prerendered notice keeps the same choices and is outside the React root', async () => {
  const html = await renderConsentShell('<head></head><body><div id="root"></div></body>')
  assert.match(html, /<body><aside class="yr-tag-consent"/)
  assert.match(html, /data-choice="denied">Recusar/)
  assert.match(html, /data-choice="granted">Permitir cookies/)
  assert.match(html, /sem cookies de publicidade/)
  assert.match(html, /style data-yr-consent-css/)
  assert.match(html, /aria-labelledby="yr-tag-consent-title" hidden>/, 'no inactive notice if the loader is blocked')
  assert.equal((html.match(/id="yr-tag-consent-title"/g) || []).length, 1)
})

test('initial visibility respects saved choices and privacy signals even when storage fails', async () => {
  const html = await renderConsentShell('<head></head><body></body>')
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  for (const setting of [
    { saved: null, hide: false }, { saved: 'denied', hide: true }, { saved: 'granted', hide: true },
    { saved: 'invalid', hide: false }, { fails: true, hide: false },
    { gpc: true, fails: true, hide: true }, { dnt: '1', fails: true, hide: true },
  ]) {
    const attributes = new Map()
    vm.runInNewContext(bootstrap, {
      navigator: { globalPrivacyControl: setting.gpc, doNotTrack: setting.dnt },
      localStorage: { getItem() { if (setting.fails) throw new Error('storage unavailable'); return setting.saved } },
      document: { documentElement: { setAttribute(name, value) { attributes.set(name, value) } } },
    })
    assert.equal(attributes.has('data-yr-consent-hidden'), setting.hide)
  }
})
