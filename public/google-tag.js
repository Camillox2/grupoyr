/* Official Google tag, basic consent mode. No conversion event without its label. */
(() => {
  const id = document.currentScript?.dataset.googleAdsId
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

  function enableTag() {
    if (loaded || choice !== 'granted') return
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
    window.gtag('consent', 'default', {
      ad_storage: 'denied', analytics_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    })
    window.gtag('consent', 'update', {
      ad_storage: 'granted', analytics_storage: 'denied',
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

  function renderControls() {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/google-tag-consent.css'
    document.head.appendChild(css)
    const controls = document.createElement('aside')
    controls.className = 'yr-tag-consent'
    controls.setAttribute('aria-labelledby', 'yr-tag-consent-title')
    controls.innerHTML = '<h2 id="yr-tag-consent-title">Medição de anúncios</h2><p>Podemos usar a tag do Google Ads para medir a interação com nossos anúncios? Ela só será carregada se você permitir. Recusar não impede o atendimento.</p><a href="https://policies.google.com/technologies/partner-sites?hl=pt-BR" target="_blank" rel="noopener noreferrer">Como o Google usa os dados</a><div><button type="button" data-choice="denied">Recusar</button><button type="button" data-choice="granted">Permitir medição</button></div>'
    controls.hidden = choice !== null
    const manage = document.createElement('button')
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
      if (choice === 'granted') enableTag()
      else if (loaded) {
        window.gtag('consent', 'update', {
          ad_storage: 'denied', analytics_storage: 'denied',
          ad_user_data: 'denied', ad_personalization: 'denied',
        })
        // Unload the already running third-party code after withdrawing permission.
        window.location.reload()
      }
    })
    document.body.appendChild(controls)
    document.body.appendChild(manage)
  }

  try { enableTag() } catch { /* A failed tag must never break the site. */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderControls, { once: true })
  else renderControls()
})()
