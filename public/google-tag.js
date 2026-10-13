/* Official Google tag and WhatsApp click conversion, with advanced consent mode. */
(() => {
  const id = document.currentScript?.dataset.googleAdsId
  const label = document.currentScript?.dataset.googleAdsConversion
  const conversionTarget = /^[A-Za-z0-9_-]+$/.test(label || '') ? `${id}/${label}` : null
  const preferenceKey = 'yr-google-ads-consent-v1'
  if (!/^AW-\d+$/.test(id || '') || window.__yrGoogleTagInstalled) return
  window.__yrGoogleTagInstalled = true
  // Respect explicit browser privacy signals; never bypass extension/network blocking.
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return

  let choice = null
  let loaded = false
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved === 'granted' || saved === 'denied') choice = saved
  } catch { /* Contacts work even when browser storage is unavailable. */ }

  function updateConsent() {
    const permission = choice === 'granted' ? 'granted' : 'denied'
    window.gtag('consent', 'update', {
      ad_storage: permission, analytics_storage: 'denied',
      ad_user_data: permission, ad_personalization: 'denied',
    })
  }

  function enableTag() {
    if (loaded) return
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
    window.gtag('consent', 'default', {
      ad_storage: 'denied', analytics_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    })
    // Denied consent allows cookieless measurements, never advertising storage.
    window.gtag('set', 'ads_data_redaction', true)
    window.gtag('set', 'url_passthrough', true)
    if (choice !== null) updateConsent()
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

  function renderControls() {
    if (!document.querySelector?.('style[data-yr-consent-css]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/google-tag-consent.css'
      document.head.appendChild(css)
    }
    const controls = document.querySelector?.('.yr-tag-consent') || document.createElement('aside')
    controls.className = 'yr-tag-consent'
    controls.setAttribute('aria-labelledby', 'yr-tag-consent-title')
    if (!controls.parentNode) controls.innerHTML = '<h2 id="yr-tag-consent-title">Medição de anúncios</h2><p>Usamos o Google Ads para medir cliques no WhatsApp. Sem sua permissão, enviamos sinais de medição sem cookies de publicidade. Você permite o uso desses cookies para melhorar a identificação da origem dos contatos? Recusar não impede o atendimento.</p><a href="https://policies.google.com/technologies/partner-sites?hl=pt-BR" target="_blank" rel="noopener noreferrer">Como o Google usa os dados</a><div><button type="button" data-choice="denied">Recusar</button><button type="button" data-choice="granted">Permitir cookies</button></div>'
    controls.hidden = choice !== null
    const manage = document.querySelector?.('.yr-tag-manage') || document.createElement('button')
    manage.type = 'button'
    manage.className = 'yr-tag-manage'
    manage.textContent = 'Preferências de medição'
    manage.hidden = choice === null
    manage.addEventListener('click', () => { controls.hidden = false; manage.hidden = true })
    controls.addEventListener('click', event => {
      const button = event.target.closest('button[data-choice]')
      if (!button) return
      choice = button.dataset.choice
      try { localStorage.setItem(preferenceKey, choice) } catch { /* Keep this choice for this page. */ }
      controls.hidden = true
      manage.hidden = false
      if (loaded) updateConsent()
      else enableTag()
    })
    if (!controls.parentNode) document.body.appendChild(controls)
    if (!manage.parentNode) document.body.appendChild(manage)
    document.documentElement?.removeAttribute('data-yr-consent-hidden')
  }

  try { enableTag() } catch { /* A failed tag must never break the site. */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderControls, { once: true })
  else renderControls()
})()
