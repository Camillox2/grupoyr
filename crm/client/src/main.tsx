import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
      const offer = () => { if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('yr:pwa-update', { detail: registration })) }
      offer()
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', offer))
    }).catch((error) => {
      console.warn('Não foi possível registrar o service worker do CRM:', error)
    })
  }, { once: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
