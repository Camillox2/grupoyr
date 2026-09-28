import { createServer } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { paths, pageMetadata, structuredData } from '../src/seo.js'
import { siteConfig } from '../src/config.js'

// Public content is real HTML; browsers hydrate the identical React tree.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
try {
  const { renderPage } = await server.ssrLoadModule('/src/entry-server.jsx')
  const template = await readFile('dist/index.html', 'utf8')
  for (const path of [...paths, '/404']) {
    const meta = pageMetadata(path)
    const url = siteConfig.url + (path === '/' ? '/' : path)
    const noindex = meta.noindex || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')
    const tags = `<title>${escape(meta.title)}</title>
    <meta name="description" content="${escape(meta.description)}" />
    <meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}" />
    ${meta.noindex ? '' : `<link rel="canonical" href="${url}" />`}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Grupo YR Hospitalar" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:title" content="${escape(meta.title)}" />
    <meta property="og:description" content="${escape(meta.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${siteConfig.url}/products/cama-eletrica-luxo.webp" />
    <meta property="og:image:width" content="1024" />
    <meta property="og:image:height" content="1024" />
    <meta property="og:image:alt" content="Cama hospitalar elétrica Grupo YR Hospitalar" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(meta.title)}" />
    <meta name="twitter:description" content="${escape(meta.description)}" />
    <meta name="twitter:image" content="${siteConfig.url}/products/cama-eletrica-luxo.webp" />
    <script type="application/ld+json">${JSON.stringify(structuredData(path)).replace(/</g,'\\u003c')}</script>`
    const html = template.replace('<!--seo-->',tags).replace('<div id="root"></div>',`<div id="root">${renderPage(path)}</div>`)
    const output = resolve('dist', path === '/' ? 'index.html' : path.slice(1) + '.html')
    await mkdir(dirname(output), {recursive:true})
    await writeFile(output, html)
    console.log(`Prerendered ${path} (${Buffer.byteLength(html)} bytes)`)
  }
  await writeFile('dist/sitemap-pages.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...paths, '/blog'].map(path => `<url><loc>${siteConfig.url}${path === '/' ? '/' : path}</loc></url>`).join('')}</urlset>\n`)
} finally { await server.close() }
