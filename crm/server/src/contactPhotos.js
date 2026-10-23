import sharp from 'sharp'

export function safeProfileUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !url.hostname.endsWith('.whatsapp.net')) throw Error('Origem de foto não permitida.')
  return url.toString()
}
async function downloadProfile(value) {
  const response = await fetch(safeProfileUrl(value), { redirect: 'error', signal: AbortSignal.timeout(5000) })
  if (!response.ok || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length') || 0) > 2 * 1024 * 1024) throw Error('Foto indisponível.')
  const reader = response.body.getReader(), parts = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2 * 1024 * 1024) throw Error('Foto excede o limite.')
      parts.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(parts)
}
const deadline = async (promise, milliseconds) => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Tempo limite da foto.')), milliseconds) })]) }
  finally { clearTimeout(timer) }
}

/** Memory-only bounded cache; never changes WhatsApp privacy or stores signed URLs. */
export function createContactPhotoService({ getConnection, download = downloadProfile, now = () => Date.now(), timeoutMs = 5500 }) {
  const cache = new Map(), inFlight = new Map(), queue = []
  let active = 0
  const pump = () => {
    while (active < 2 && queue.length) {
      const job = queue.shift(); active++
      job.run().then(job.resolve, () => job.resolve(null)).finally(() => { active--; pump() })
    }
  }
  async function get(lead) {
    const connection = getConnection()
    if (connection.provider !== 'baileys' || connection.status !== 'connected' || !connection.socket?.profilePictureUrl) return null
    const jid = [lead.whatsappLid, lead.whatsappJid].find(value => typeof value === 'string' && /^[\d:]+@(s\.whatsapp\.net|lid)$/.test(value))
      || (/^\d{8,15}$/.test(String(lead.phone || '').replace(/\D/g, '')) ? String(lead.phone).replace(/\D/g, '') + '@s.whatsapp.net' : null)
    if (!jid) return null
    const key = connection.sessionId + ':' + lead.id + ':' + jid
    const saved = cache.get(key)
    if (saved && saved.expires > now()) return saved.photo
    if (inFlight.has(key)) return inFlight.get(key)
    if (queue.length >= 30) return null
    const work = new Promise(resolve => {
      queue.push({ resolve, run: async () => {
        let photo = null
        try {
          const source = await deadline(connection.socket.profilePictureUrl(jid, 'preview', Math.min(5000, timeoutMs)), timeoutMs)
          if (source) {
            safeProfileUrl(source)
            const bytes = await deadline(download(source), timeoutMs)
            if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) throw Error('Foto inválida.')
            photo = await sharp(bytes, { limitInputPixels: 4_000_000 }).rotate().resize(192, 192, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
            if (photo.length > 100 * 1024) photo = null
          }
        } catch { /* Private/missing pictures are normal: keep initials. */ }
        cache.delete(key)
        if (cache.size >= 200) cache.delete(cache.keys().next().value)
        cache.set(key, { photo, expires: now() + (photo ? 24 * 3600000 : 10 * 60000) })
        return photo
      } })
      pump()
    }).finally(() => inFlight.delete(key))
    inFlight.set(key, work)
    return work
  }
  return { get }
}
