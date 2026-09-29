import { neon } from '@neondatabase/serverless'
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Blog database unavailable')
  return neon(process.env.DATABASE_URL)
}
export const ORIGIN = 'https://grupoyrhospitalar.com.br'
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function fail(status, message) { throw Object.assign(new Error(message), { status }) }
export function json(res, status, value) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)) }
export async function body(req, limit = 1600000) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Envie JSON.')
  let raw = ''
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  else for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > limit) fail(413, 'Arquivo muito grande.') }
  if (Buffer.byteLength(raw) > limit) fail(413, 'Arquivo muito grande.')
  try { return JSON.parse(raw) } catch { fail(400, 'Dados inválidos.') }
}
