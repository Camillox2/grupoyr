/* Official Google tag (always on) and WhatsApp click conversion, with a simple cookie controls. */
(() => {
  const id = document.currentScript?.dataset.googleAdsId
  const label = document.currentScript?.dataset.googleAdsConversion
  const conversionTarget = /^[A-Za-z0-9_-]+$/.test(label || '') ? `${id}/${label}` : null
  const noticeKey = 'yr-cookie-controls-v2'
  if (!/^AW-\d+$/.test(id || '') || window.__yrGoogleTagInstalled) return
  window.__yrGoogleTagInstalled = true

  let loaded = false
  let dismissed = false
  try { dismissed = localStorage.getItem(noticeKey) === 'seen' } catch { /* Storage unavailable. */ }

  function enableTag() {
    if (loaded) return
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
    // Measurement is always on; ad personalization stays off.
    window.gtag('consent', 'default', {
      ad_storage: 'granted', analytics_storage: 'granted',
      ad_user_data: 'granted', ad_personalization: 'denied',
    })
    window.gtag('js', new Date())
    window.gtag('config', id, { allow_ad_personalization_signals: false })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.insertBefore(script, document.head.firstChild)
    loaded = true
  }

  function isWhatsAppContact(href) {
    try {
      const url = new URL(href, window.location.href)
      const hasPhone = /^\+?\d{7,15}$/.test(url.searchParams.get('phone') || '')
      if (url.protocol === 'whatsapp:') return url.hostname === 'send' && hasPhone
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
      if (url.hostname === 'wa.link') return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      if (url.hostname === 'wa.me') return /^\/(?:\+?\d{7,15}|message\/[A-Za-z0-9]+)\/?$/.test(url.pathname)
      return ['api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname) && /^\/send\/?$/.test(url.pathname) && hasPhone
    } catch { return false }
  }

  function recordWhatsAppClick(href) {
    if (!loaded || !conversionTarget || !isWhatsAppContact(href)) return
    try {
      // Only the action ID is sent; never include form fields, message text or the destination URL.
      window.gtag('event', 'conversion', { send_to: conversionTarget })
    } catch { /* Measurement failure must never prevent contact. */ }
  }

  function onContactLink(event) {
    if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return
    const anchor = event.target?.closest?.('a[href]')
    if (anchor) recordWhatsAppClick(anchor.href)
  }
  document.addEventListener('click', onContactLink, true)
  document.addEventListener('auxclick', onContactLink, true)
  // React forms and floating buttons use the same contact opener instead of anchor links.
  document.addEventListener('yr:whatsapp-contact', event => recordWhatsAppClick(event.detail?.url))

  function renderNotice() {
    if (!document.querySelector?.('style[data-yr-consent-css]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/google-tag-consent.css'
      document.head.appendChild(css)
    }
    const controls = document.querySelector?.('.yr-tag-consent') || document.createElement('aside')
    controls.className = 'yr-tag-consent'
    controls.setAttribute('aria-labelledby', 'yr-tag-consent-title')
    if (!controls.parentNode) controls.innerHTML = '<h2 id="yr-tag-consent-title">Cookies</h2><p>Este site utiliza cookies e ferramentas do Google (Google Ads e Google Analytics) para medir visitas e cliques no WhatsApp. Saiba mais na Política de Privacidade.</p><a href="https://policies.google.com/technologies/partner-sites?hl=pt-BR" target="_blank" rel="noopener noreferrer">Como o Google usa os dados</a><div><button type="button" data-choice="dismiss">Recusar</button><button type="button" data-choice="ok">Entendi</button></div>'
    controls.hidden = dismissed
    // Both buttons only close the controls; measurement is unaffected.
    controls.addEventListener('click', event => {
      if (!event.target.closest('button[data-choice]')) return
      dismissed = true
      try { localStorage.setItem(noticeKey, 'seen') } catch { /* Close for this page only. */ }
      controls.hidden = true
    })
    if (!controls.parentNode) document.body.appendChild(controls)
    document.querySelector?.('.yr-tag-manage')?.remove?.()
    document.documentElement?.removeAttribute('data-yr-consent-hidden')
  }

  try { enableTag() } catch { /* A failed tag must never break the site. */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderNotice, { once: true })
  else renderNotice()
})()
