import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { layout, indexPage, articlePage } from '../server/blog-render.js'

const source = readFileSync(new URL('../public/google-tag.js', import.meta.url), 'utf8')
function run({ saved = null, privacy = false, dnt = null, storageFails = false, prerendered = false } = {}) {
  const head = [], body = [], handlers = new Map()
  let reloads = 0
  const element = tagName => ({ tagName, hidden: false, dataset: {}, setAttribute() {}, addEventListener(type, fn) { this[type] = fn } })
  const initialControls = prerendered ? { ...element('aside'), parentNode: {}, innerHTML: 'Prepared notice' } : null
  const initialManage = prerendered ? { ...element('button'), parentNode: {} } : null
  if (prerendered) body.push(initialControls, initialManage)
  const document = {
    currentScript: { dataset: { googleAdsId: 'AW-18481732690', googleAdsConversion: '6RmoCIn7lpcdENK44-xE' } }, readyState: 'complete',
    createElement: element,
    head: { firstChild: {}, insertBefore(el) { head.push(el) }, appendChild(el) { head.push(el) } },
    body: { appendChild(el) { body.push(el) } },
    querySelector(selector) { return prerendered ? selector === '.yr-tag-consent' ? initialControls : selector === '.yr-tag-manage' ? initialManage : selector === 'style[data-yr-consent-css]' ? {} : null : null },
    addEventListener(type, fn) { handlers.set(type, fn) },
  }
  const window = { location: { href: 'https://grupoyrhospitalar.com.br/', reload() { reloads++ } } }
  const context = vm.createContext({ window, document, navigator: { globalPrivacyControl: privacy, doNotTrack: dnt }, localStorage: {
    getItem() { if (storageFails) throw new Error('blocked'); return saved },
    setItem(key, value) { if (storageFails) throw new Error('blocked'); saved = value },
  }, Date, URL, encodeURIComponent })
  vm.runInContext(source, context)
  return {
    context, head, body, window,
    scripts: () => head.filter(el => el.tagName === 'script'),
    commands: () => (window.dataLayer || []).map(args => Array.from(args)),
    choose(value) { body[0].click({ target: { closest: () => ({ dataset: { choice: value } }) } }) },
    click(href, options = {}) { const type = options.type || 'click'; handlers.get(type)?.({ type, button: type === 'click' ? 0 : 1, target: { closest: () => href ? { href } : null }, ...options }) },
    contact(href) { handlers.get('yr:whatsapp-contact')?.({ detail: { url: href } }) },
    reloads: () => reloads,
  }
}

test('tag always loads with granted measurement consent before configuration, even with GPC/DNT', () => {
  for (const opts of [{}, { privacy: true }, { dnt: '1' }, { saved: 'seen' }, { storageFails: true }]) {
    const f = run(opts)
    assert.equal(f.scripts().length, 1)
    const c = f.commands()
    assert.deepEqual(c[0].slice(0, 2), ['consent', 'default'])
    assert.deepEqual(JSON.parse(JSON.stringify(c[0][2])), { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied' })
    assert.equal(c.filter(x => x[0] === 'consent').length, 1)
  }
})

test('Recusar and Entendi only close the notice; conversions still fire', () => {
  for (const choice of ['dismiss', 'ok']) {
    const f = run()
    const before = f.commands().length
    f.choose(choice)
    assert.equal(f.body[0].hidden, true)
    assert.equal(f.commands().length, before)
    f.click('https://wa.me/5541999999999')
    assert.deepEqual(JSON.parse(JSON.stringify(f.commands().at(-1))), ['event', 'conversion', { send_to: 'AW-18481732690/6RmoCIn7lpcdENK44-xE' }])
  }
  assert.equal(run({ saved: 'seen' }).body[0].hidden, true)
})

test('privacy policy mentions Google Ads and Analytics measurement', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /Google Ads e Google Analytics/)
  assert.match(source, /Este site utiliza cookies/)
})

test('only outbound contact clicks queue the exact conversion without personal fields', () => {
  const f = run({ saved: 'granted' })
  const targets = ['https://wa.me/5541997714985?text=private-message', 'https://wa.link/7iz93j', 'https://api.whatsapp.com/send?phone=5541997714985&text=private-message', 'https://web.whatsapp.com/send?phone=5541997714985', 'whatsapp://send?phone=5541997714985', 'https://wa.me/message/BUSINESSCODE']
  for (const href of targets) f.click(href)
  f.contact('https://wa.me/5541997714985')
  const conversions = f.commands().filter(command => command[0] === 'event')
  assert.equal(conversions.length, targets.length + 1)
  for (const command of conversions) {
    assert.equal(command[1], 'conversion')
    assert.equal(command[2].send_to, 'AW-18481732690/6RmoCIn7lpcdENK44-xE')
    assert.deepEqual(Object.keys(command[2]), ['send_to'])
  }
})

test('article sharing, unrelated links, domain spoofing and cancelled clicks are not contacts', () => {
  const f = run({ saved: 'granted' })
  for (const href of [null, '/#contato', 'mailto:rodrigo@grupoyrhospitalar.com.br', 'https://wa.me/?text=share-article', 'https://api.whatsapp.com/send?text=share-article', 'https://wa.me.attacker.example/5541997714985', 'https://example.com/?next=https://wa.me/5541997714985', 'javascript:alert(1)', 'whatsapp://send?text=share-article']) f.click(href)
  f.click('https://wa.link/7iz93j', { defaultPrevented: true })
  f.click('https://wa.link/7iz93j', { button: 2 })
  assert.equal(f.commands().filter(command => command[0] === 'event').length, 0)
})

test('one conversion per accepted click even with a duplicated head loader', () => {
  const f = run({ saved: 'granted' })
  vm.runInContext(source, f.context)
  f.click('https://wa.link/7iz93j')
  f.click('https://wa.link/7iz93j', { type: 'auxclick' })
  assert.equal(f.commands().filter(command => command[0] === 'event').length, 2)
})
test('public static pages and every blog layout have one loader first in head', () => {
  const assertTag = html => {
    assert.match(html, /<head>\s*<!-- Google tag \(gtag\.js\): Grupo YR Hospitalar -->\s*<script src="\/google-tag.js" data-google-ads-id="AW-18481732690" data-google-ads-conversion="6RmoCIn7lpcdENK44-xE" defer><\/script>/)
    assert.equal((html.match(/src="\/google-tag.js"/g) || []).length, 1)
  }
  for (const path of ['index', 'comprar-ou-alugar', '404', 'equipamentos/cama-eletrica-luxo', 'equipamentos/cama-manual-3-movimentos', 'equipamentos/colchao-pneumatico', 'equipamentos/cadeira-de-banho']) {
    assertTag(readFileSync(new URL(`../dist/${path}.html`, import.meta.url), 'utf8'))
  }
  assertTag(layout({ title: 'Blog', description: 'Blog', path: '/blog', html: '' }))
  assertTag(indexPage([], 0, 1, '', []))
  assertTag(articlePage({ title: 'Artigo', slug: 'artigo', excerpt: 'Resumo', category: 'Equipamentos', body: 'Texto', published_at: '2026-10-09T12:00:00Z', updated_at: '2026-10-09T12:00:00Z' }, []))
  assert.equal(readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8').includes('google-tag'), false)
})
