import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import sharp from 'sharp'

const runFile = promisify(execFile)

async function transcode(buffer, format) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yr-whatsapp-media-'))
  try {
    const input = path.join(directory, 'input')
    const output = path.join(directory, `output.${format}`)
    await fs.writeFile(input, buffer)
    const encoding = format === 'ogg'
      ? ['-vn', '-c:a', 'libopus', '-ac', '1', '-b:a', '48k', '-avoid_negative_ts', 'make_zero']
      : ['-an', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-vf', 'scale=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart']
    await runFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...encoding, output], { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 })
    return await fs.readFile(output)
  } finally {
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('yr-whatsapp-media-')) await fs.rm(directory, { recursive: true, force: true })
  }
}

export async function prepareWhatsAppUpload(file, { provider = 'baileys', asSticker = false } = {}) {
  const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase()
  const baseName = path.parse(file.originalname || 'anexo').name.slice(0, 150)
  let buffer = file.buffer
  let mimetype = mime
  let originalname = file.originalname || 'anexo'
  let mediaIsGif = false
  let mediaIsAnimated = false
  let mediaType
  try {
    if (provider === 'baileys' && (asSticker || mime === 'image/webp')) {
      if (!mime.startsWith('image/')) throw new Error('Escolha uma imagem para enviar como figurinha.')
      const image = sharp(buffer, { animated: true })
      const metadata = await image.metadata()
      mediaIsAnimated = (metadata.pages || 1) > 1
      buffer = await image.resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 65 }).toBuffer()
      const limit = mediaIsAnimated ? 500 * 1024 : 100 * 1024
      if (buffer.length > limit) throw new Error('Esta imagem ficou grande demais como figurinha. Use uma imagem menor.')
      mimetype = 'image/webp'
      originalname = `${baseName}.webp`
      mediaType = 'sticker'
    } else if (mime.startsWith('audio/')) {
      buffer = await transcode(buffer, 'ogg')
      mimetype = 'audio/ogg'
      originalname = `${baseName}.ogg`
      mediaType = 'audio'
    } else if (mime === 'image/gif') {
      buffer = await transcode(buffer, 'mp4')
      mimetype = 'video/mp4'
      originalname = `${baseName}.mp4`
      mediaIsGif = true
      mediaType = 'video'
    }
  } catch (error) {
    if (mime.startsWith('audio/')) throw new Error('Não foi possível preparar este áudio para o WhatsApp. Verifique o arquivo e tente novamente.')
    if (mime === 'image/gif' && !asSticker) throw new Error('Não foi possível preparar este GIF para o WhatsApp. Verifique o arquivo e tente novamente.')
    throw error
  }
  return { ...file, buffer, mimetype, originalname, size: buffer.length, mediaType, mediaIsGif, mediaIsAnimated }
}
