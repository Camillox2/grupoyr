import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'
import { db } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const keyFile = path.join(__dirname, '..', 'data', 'web-push-vapid.json')

function loadVapidKeys() {
  const fromEnvironment = {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || '',
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY || '',
  }
  if (fromEnvironment.publicKey && fromEnvironment.privateKey) return fromEnvironment

  try {
    const saved = JSON.parse(fs.readFileSync(keyFile, 'utf8'))
    if (saved.publicKey && saved.privateKey) return saved
  } catch {
    // Primeira inicialização: cria o par uma única vez no diretório privado de dados.
  }

  const keys = webpush.generateVAPIDKeys()
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  const tempFile = `${keyFile}.${process.pid}.tmp`
  fs.writeFileSync(tempFile, JSON.stringify(keys), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  fs.renameSync(tempFile, keyFile)
  return keys
}

let vapidKeys = null
let setupError = null
try {
  vapidKeys = loadVapidKeys()
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT || 'mailto:rodrigo@grupoyrhospitalar.com.br',
    vapidKeys.publicKey,
    vapidKeys.privateKey,
  )
} catch (error) {
  setupError = error
  console.error('[Push] Não foi possível inicializar Web Push:', error?.message || error)
}

export const pushIsConfigured = () => Boolean(vapidKeys && !setupError)
export const getPushPublicKey = () => {
  if (!pushIsConfigured()) throw new Error('Notificações push indisponíveis neste servidor.')
  return vapidKeys.publicKey
}

export const subscriptionId = (endpoint) => createHash('sha256').update(String(endpoint)).digest('hex')

export async function deliverPushToUser(userId, payload) {
  if (!pushIsConfigured()) return { delivered: 0, failed: 0 }
  await db.ready
  const subscriptions = db.filter('pushSubscriptions', (item) => item.recipientId === userId)
  const body = JSON.stringify({
    title: String(payload?.title || 'CRM Grupo YR').slice(0, 100),
    body: String(payload?.body || '').slice(0, 220),
    url: String(payload?.url || '/').slice(0, 300),
    tag: String(payload?.tag || 'yr-crm').slice(0, 100),
  })

  const results = await Promise.all(subscriptions.map(async (item) => {
    try {
      await webpush.sendNotification(item.subscription, body, { TTL: 3600, urgency: 'high' })
      return true
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0)
      if ([404, 410].includes(statusCode)) db.delete('pushSubscriptions', item.id)
      else console.warn('[Push] Falha ao entregar notificação:', statusCode || error?.message || 'erro desconhecido')
      return false
    }
  }))

  return {
    delivered: results.filter(Boolean).length,
    failed: results.filter((value) => !value).length,
  }
}
