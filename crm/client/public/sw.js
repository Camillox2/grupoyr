const CACHE_NAME = 'yr-crm-shell-v12-pausa-confirmada'
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
  '/yr-hospitalar-logo.jpg',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const appResponse = await fetch('/')
    if (!appResponse.ok) throw new Error('Não foi possível preparar o app shell do CRM.')
    await cache.put('/', appResponse.clone())

    // O HTML do Vite aponta para assets com hash: cacheia o app shell inteiro
    // na instalação inicial, sem incluir respostas privadas do backend.
    const html = await appResponse.text()
    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)]
      .map((match) => match[1])
    await cache.addAll([...SHELL_URLS.filter((url) => url !== '/'), ...assetUrls])
  })())
})
// Apply upgrades only after the user confirms, preserving in-progress forms.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('yr-crm-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // Nunca armazenar mensagens, arquivos privados, autenticação, API ou sockets.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/socket.io/')) return
  // Um link pessoal não deve substituir o app shell nem ficar salvo no PWA.
  if (url.pathname.startsWith('/cliente/') || url.pathname.startsWith('/vistoria/') || url.pathname.startsWith('/assinar/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && url.pathname === '/' && !url.search) caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()))
      return response
    }).catch(async () => (await caches.match('/')) || Response.error()))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    })))
    return
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }

  const title = String(payload.title || 'CRM Grupo YR').slice(0, 100)
  const body = String(payload.body || 'Há uma atualização no atendimento.').slice(0, 220)
  const tag = String(payload.tag || 'yr-crm').slice(0, 100)
  let targetUrl = '/'
  try {
    const parsed = new URL(String(payload.url || '/'), self.location.origin)
    if (parsed.origin === self.location.origin) targetUrl = parsed.pathname + parsed.search + parsed.hash
  } catch {
    // Notificações com URL inválida sempre abrem o CRM na rota inicial.
  }

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    data: { url: targetUrl, leadId: payload.leadId },
    renotify: false,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  let destination
  try {
    destination = new URL(data.url || '/', self.location.origin)
    if (destination.origin !== self.location.origin) destination = new URL('/', self.location.origin)
  } catch {
    destination = new URL('/', self.location.origin)
  }
  if (data.leadId) destination.searchParams.set('lead', String(data.leadId))
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      existing.navigate(destination.href)
      return existing.focus()
    }
    return self.clients.openWindow(destination.href)
  }))
})
