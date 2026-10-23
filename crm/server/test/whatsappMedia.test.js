import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { prepareWhatsAppUpload } from '../src/whatsappMedia.js'

export function testWav() {
  const samples = 8000; const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 8000) * 3000), 44 + i * 2)
  return buffer
}

test('converts recorded audio into mono Ogg Opus, with matching file metadata', async () => {
  const result = await prepareWhatsAppUpload({ buffer: testWav(), originalname: 'gravacao.wav', mimetype: 'audio/wav' })
  assert.equal(result.mimetype, 'audio/ogg'); assert.equal(result.originalname, 'gravacao.ogg'); assert.equal(result.mediaType, 'audio')
  assert.equal(result.buffer.subarray(0, 4).toString(), 'OggS'); assert.ok(result.buffer.includes(Buffer.from('OpusHead')))
})

test('converts an image to a transparent 512px WhatsApp sticker', async () => {
  const png = await sharp({ create: { width: 64, height: 32, channels: 4, background: '#2375c6' } }).png().toBuffer()
  const result = await prepareWhatsAppUpload({ buffer: png, originalname: 'foto.png', mimetype: 'image/png' }, { asSticker: true })
  const metadata = await sharp(result.buffer).metadata()
  assert.equal(result.mediaType, 'sticker'); assert.equal(result.mimetype, 'image/webp'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512)
})

test('converts GIF uploads to an MP4 with the GIF playback flag', async () => {
  const gif = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#39c7a2' } }).gif().toBuffer()
  const result = await prepareWhatsAppUpload({ buffer: gif, originalname: 'animacao.gif', mimetype: 'image/gif' })
  assert.equal(result.mediaIsGif, true); assert.equal(result.mediaType, 'video'); assert.equal(result.mimetype, 'video/mp4'); assert.equal(result.buffer.subarray(4, 8).toString(), 'ftyp')
})

test('rejects corrupt audio with a useful message rather than sending an invalid voice note', async () => {
  await assert.rejects(prepareWhatsAppUpload({ buffer: Buffer.from('not-audio'), originalname: 'audio.webm', mimetype: 'audio/webm' }), /Não foi possível preparar este áudio/)
})
