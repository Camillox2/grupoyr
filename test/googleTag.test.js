import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { layout, indexPage, articlePage } from '../server/blog-render.js'

const source = readFileSync(new URL('../public/google-tag.js', import.meta.url), 'utf8')
function run({ saved = null, privacy = false, dnt = null, storageFails = false } = {}) {
  const head = [], body = [], handlers = new Map()
  let reloads = 0
  const element = tagName => ({ tagName, hidden: false, dataset: {}, setAttribute() {}, addEventListener(type, fn) { this[type] = fn } })
  const document = {
    currentScript: { dataset: { googleAdsId: 'AW-18481732690', googleAdsConversion: '6RmoCIn7lpcdENK44-xE' } }, readyState: 'complete',
    createElement: element,
    head: { firstChild: {}, insertBefore(el) { head.push(el) }, appendChild(el) { head.push(el) } },
    body: { appendChild(el) { body.push(el) } },
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

test('no choice and saved refusal load one tag with denied consent before configuration', () => {
  for (const saved of [null, 'denied']) {
    const f = run({ saved })
    assert.equal(f.scripts().length, 1)
    const commands = f.commands()
    assert.deepEqual(commands[0].slice(0, 2), ['consent', 'default'])
    for (const consent of commands.filter(command => command[0] === 'consent')) {
      for (const type of ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization']) {
        assert.equal(consent[2][type], 'denied')
      }
    }
    const configIndex = commands.findIndex(command => command[0] === 'config')
    for (const setting of ['ads_data_redaction', 'url_passthrough']) {
      const index = commands.findIndex(command => command[0] === 'set' && command[1] === setting)
      assert.ok(index > 0 && index < configIndex)
      assert.equal(commands[index][2], true)
    }
    assert.equal(commands.some(command => command[0] === 'event'), false)
    f.choose('denied')
    assert.equal(f.scripts().length, 1)
    assert.equal(f.commands().at(-1)[2].ad_storage, 'denied')
  }
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

test('contact conversions remain available without choice, after refusal and after revocation', () => {
  for (const settings of [{}, { saved: 'denied' }]) {
    const f = run(settings)
    f.click('https://wa.link/7iz93j')
    f.contact('https://wa.me/5541997714985')
    assert.equal(f.commands().filter(command => command[0] === 'event').length, 2)
    assert.equal(f.commands().filter(command => command[0] === 'consent').at(-1)[2].ad_storage, 'denied')
    f.choose('denied')
    f.click('https://wa.link/7iz93j')
    assert.equal(f.commands().filter(command => command[0] === 'event').length, 3)
  }
  const f = run({ saved: 'granted' })
  f.choose('denied')
  f.contact('https://wa.me/5541997714985')
  assert.equal(f.commands().filter(command => command[0] === 'event').length, 1)
  assert.equal(f.commands().at(-2)[2].ad_storage, 'denied')
  assert.equal(f.commands().at(-2)[2].ad_user_data, 'denied')
  assert.equal(f.reloads(), 0)
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
test('permission changes consent without reloading the tag or generating a conversion', () => {
  const f = run()
  f.choose('granted')
  f.choose('granted')
  assert.equal(f.scripts().length, 1)
  assert.equal(f.scripts()[0].src, 'https://www.googletagmanager.com/gtag/js?id=AW-18481732690')
  assert.equal(f.scripts()[0].async, true)
  assert.equal(f.commands()[0][0], 'consent')
  assert.equal(f.commands().find(command => command[0] === 'config')[1], 'AW-18481732690')
  const consent = f.commands().at(-1)[2]
  assert.equal(consent.ad_storage, 'granted')
  assert.equal(consent.ad_user_data, 'granted')
  assert.equal(consent.analytics_storage, 'denied')
  assert.equal(consent.ad_personalization, 'denied')
  assert.equal(f.commands().some(command => command[0] === 'event'), false, 'no fake conversion')
})
test('saved permission, revocation and duplicate loader behave correctly', () => {
  const f = run({ saved: 'granted' })
  vm.runInContext(source, f.context)
  assert.equal(f.scripts().length, 1)
  assert.equal(f.body.length, 2)
  const commands = f.commands()
  assert.equal(commands[0][2].ad_storage, 'denied')
  const updateIndex = commands.findIndex(command => command[0] === 'consent' && command[1] === 'update')
  assert.ok(updateIndex < commands.findIndex(command => command[0] === 'config'))
  assert.equal(commands[updateIndex][2].ad_storage, 'granted')
  f.choose('denied')
  assert.equal(f.commands().at(-1)[2].ad_storage, 'denied')
  assert.equal(f.reloads(), 0)
})
test('GPC and Do Not Track prevent the tag and do not offer an override', () => {
  for (const settings of [{ privacy: true }, { dnt: '1' }]) {
    const f = run({ ...settings, saved: 'granted' })
    assert.equal(f.scripts().length, 0)
    assert.equal(f.body.length, 0)
    f.click('https://wa.link/7iz93j')
    f.contact('https://wa.me/5541997714985')
    assert.equal(f.commands().filter(command => command[0] === 'event').length, 0)
  }
})
test('storage refusal does not break consent controls or the page', () => {
  const f = run({ storageFails: true })
  assert.equal(f.scripts().length, 1)
  assert.doesNotThrow(() => f.choose('granted'))
  assert.equal(f.scripts().length, 1)
})

test('banner and privacy policy explain the cookieless measurement after refusal', () => {
  const f = run()
  assert.match(f.body[0].innerHTML, /sem cookies de publicidade/)
  assert.match(f.body[0].innerHTML, /Permitir cookies/)
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /após recusa/)
  assert.match(app, /não garante identificar a origem de cada contato/)
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
