import test from 'node:test'
import assert from 'node:assert/strict'
import { isMetaMediaTypeSupported } from '../src/whatsapp.js'

test('allows Meta Cloud API image and video formats', () => {
  for (const type of ['image/jpeg', 'image/png', 'video/mp4', 'video/3gpp']) {
    assert.equal(isMetaMediaTypeSupported(type), true, type)
  }
})

test('rejects formats Meta does not accept for ordinary media messages', () => {
  for (const type of ['image/webp', 'image/gif', 'video/webm', 'video/quicktime', 'audio/webm']) {
    assert.equal(isMetaMediaTypeSupported(type), false, type)
  }
})
