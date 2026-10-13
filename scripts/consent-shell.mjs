import { readFile } from 'node:fs/promises'

// Render the existing notice before the first paint, outside the React root.
// The tag loader still owns consent, storage and all measurement decisions.
export async function renderConsentShell(template) {
  const [script, css] = await Promise.all([
    readFile('public/google-tag.js', 'utf8'), readFile('public/google-tag-consent.css', 'utf8'),
  ])
  const content = script.match(/controls\.innerHTML = '([^']*)'/)?.[1]
  if (!content) throw new Error('Consent notice markup missing')
  const bootstrap = `<script>(()=>{try{const n=navigator;if(n.globalPrivacyControl===true||n.doNotTrack==='1'){document.documentElement.setAttribute('data-yr-consent-hidden','');return}const p=localStorage.getItem('yr-google-ads-consent-v1');if(p==='granted'||p==='denied')document.documentElement.setAttribute('data-yr-consent-hidden','')}catch{}})()</script>`
  const styles = `<style data-yr-consent-css>${css}\nhtml[data-yr-consent-hidden] .yr-tag-consent{display:none}</style>`
  const body = `<aside class="yr-tag-consent" aria-labelledby="yr-tag-consent-title">${content}</aside><button type="button" class="yr-tag-manage" hidden>Preferências de medição</button><noscript><style>.yr-tag-consent,.yr-tag-manage{display:none}</style></noscript>`
  return template.replace('</head>', `${bootstrap}${styles}</head>`).replace('<body>', `<body>${body}`)
}
