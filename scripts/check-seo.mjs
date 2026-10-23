import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { paths, pageMetadata } from '../src/seo.js'
import { siteConfig } from '../src/config.js'

const titles = new Set()
for (const path of [...paths, '/404']) {
  const html = await readFile(join('dist',path === '/' ? 'index.html' : path + '.html'),'utf8')
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
  assert(title && !titles.has(title), `Missing or duplicate title: ${path}`)
  titles.add(title)
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`Expected one h1: ${path}`)
  assert(html.includes('lang="pt-BR"'), `Missing language: ${path}`)
  assert(!html.includes('<!--seo-->') && !html.includes('<div id="root"></div>'), `Empty rendered content: ${path}`)
  assert(html.includes('property="og:image"') && html.includes('summary_large_image'), `Missing share tags: ${path}`)
  const metadata = pageMetadata(path)
  if (!metadata.noindex) {
    assert.equal((html.match(/rel="canonical"/g)||[]).length,1,`Duplicate canonical: ${path}`)
    assert(html.includes(`href="${siteConfig.url}${path === '/' ? '/' : path}"`), `Wrong canonical: ${path}`)
    assert(!html.includes('content="noindex'),`Unexpected noindex: ${path}`)
  } else assert(html.includes('content="noindex,follow"'), '404 must not be indexed')
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] || 'null')
  assert(json?.['@graph']?.length >= 3, `Missing structured data: ${path}`)
  if(metadata.product) assert(json['@graph'].some(node => node['@type'] === 'Service' && node.name === metadata.product.name), `Wrong product data: ${path}`)
  assert(!JSON.stringify(json).includes('"Product"'), `Product without offers must not be emitted: ${path}`)
  for(const [,imageTag] of html.matchAll(/(<img\s[^>]*>)/g)) {
    assert(/\salt="[^"]*"/.test(imageTag),`Image without alt: ${path}`)
  }
  for(const [,raw] of html.matchAll(/(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    if(raw.startsWith('//'))continue
    if(paths.includes(raw)||raw==='/404'||raw==='/blog')continue
    await access(join('dist',raw)).catch(()=>assert.fail(`Missing local resource ${raw} on ${path}`))
  }
  console.log(`PASS ${path}: HTML, heading, metadata, JSON-LD and local links`)
}
const sitemap = await readFile('dist/sitemap-pages.xml','utf8')
assert.equal((sitemap.match(/<loc>/g)||[]).length, paths.length + 1)
for(const path of paths) assert(sitemap.includes(`<loc>${siteConfig.url}${path==='/'?'/':path}</loc>`))
assert(!(await readFile('dist/robots.txt','utf8')).includes('Disallow: /\n'))
console.log(`PASS sitemap (${paths.length} pages) and robots`)
