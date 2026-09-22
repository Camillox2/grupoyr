import { ORIGIN } from './blog-db.js'
import { escape as e, contentHtml } from './blog-content.js'

export const imageUrl = post => post.cover_id ? `${ORIGIN}/blog/capa/${post.cover_id}` : `${ORIGIN}/social-card.jpg`
const date = value => new Date(value).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'})
const minutes = text => Math.max(1,Math.ceil(String(text||'').split(/\s+/).length/200))

/* ------------------------------------------------------------------ vetores
   Tudo SVG inline: sem imagem externa, sem fonte de icone. As animacoes moram
   no blog.css e respeitam prefers-reduced-motion. */
const ICON = {
  arrow: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  back: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  next: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  clock: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  share: '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4m4-4v14"/></svg>',
}

// Sublinhado desenhado a mao, o mesmo gesto do titulo da pagina inicial.
const mark = text => `<span class="mark">${text}<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 13c48-9 96-10 146-5 49 5 98 4 146-3" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.55"/></svg></span>`

// A pintura (fill/stroke) vai nos ATRIBUTOS de cada forma, nao no CSS: se a
// folha de estilo falhar ou a pagina for lida em modo leitura, o desenho
// continua certo em vez de virar um borrao preto. O CSS so anima.
const NAVY = '#102a4c', BLUE = '#1d5fae', BLUE100 = '#dce9f8', PAPER = '#fffdf9', SAND = '#e2d6c2', SAND2 = '#d4c5ab', CREAM = '#f6f1e8'
const line = (color, width) => `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`

// O caderno do hero: as pautas se escrevem, a cama e esbocada, o lapis corre a
// ultima linha, a fita marca-pagina balanca e tres etiquetas flutuam.
const chip = (n, x, y, width, label) => `<g class="nb-chip nb-chip-${n}"><rect x="${x}" y="${y}" width="${width}" height="38" rx="19" fill="${PAPER}" stroke="${SAND2}" stroke-width="1.5"/><text x="${x + width / 2}" y="${y + 24}" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="14" font-weight="800" fill="${NAVY}">${label}</text></g>`
const NOTEBOOK = `<svg class="notebook" viewBox="0 0 560 460" role="img" aria-label="Ilustração de um caderno aberto com o esboço de uma cama hospitalar"><defs><linearGradient id="nb-page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAPER}"/><stop offset="1" stop-color="#f8f2e7"/></linearGradient></defs>
<circle class="nb-halo" cx="292" cy="228" r="188" fill="${BLUE100}"/>
<g class="nb-plus" ${line(BLUE, 3)}><path d="M58 96v22M47 107h22"/><path d="M498 318v18M489 327h18"/><path d="M300 28v14M293 35h14"/></g>
<ellipse class="nb-shadow" cx="284" cy="408" rx="196" ry="16" fill="${NAVY}" fill-opacity="0.14"/>
<g class="nb-book">
<path d="M62 108a16 16 0 0 1 16-16h404a16 16 0 0 1 16 16v268a16 16 0 0 1-16 16H78a16 16 0 0 1-16-16z" fill="${NAVY}"/>
<path d="M76 104h196a8 8 0 0 1 8 8v256a8 8 0 0 1-8 8H76z" fill="url(#nb-page)" stroke="${SAND}"/>
<path d="M484 104H288a8 8 0 0 0-8 8v256a8 8 0 0 0 8 8h196z" fill="url(#nb-page)" stroke="${SAND}"/>
<path d="M280 104v272" ${line(SAND2, 2)}/>
<g fill="${CREAM}" stroke="${NAVY}" stroke-width="2.5"><circle cx="280" cy="134" r="5"/><circle cx="280" cy="176" r="5"/><circle cx="280" cy="218" r="5"/><circle cx="280" cy="260" r="5"/><circle cx="280" cy="302" r="5"/><circle cx="280" cy="344" r="5"/></g>
<g class="nb-bed" ${line(NAVY, 3.5)}><path d="M108 296h132"/><path d="M116 296v26m116-26v26"/><path d="M116 282h58l44-34h18v48" stroke="${BLUE}"/><path d="M116 282v-30"/><path d="M122 274c10-7 24-7 34 0"/><circle cx="124" cy="330" r="7"/><circle cx="224" cy="330" r="7"/></g>
<g class="nb-note" ${line(SAND2, 3)}><path d="M110 176h96"/><path d="M110 196h70"/></g>
<g class="nb-lines" ${line(SAND2, 3)}><path d="M310 150h146"/><path d="M310 182h146"/><path d="M310 214h104" stroke="${BLUE}" stroke-width="4"/><path d="M310 246h146"/><path d="M310 278h126"/><path d="M310 310h146"/></g>
<path class="nb-wave" d="M310 342c12-9 24 9 36 0s24-9 36 0 24 9 36 0 24-9 36 0" ${line(BLUE, 4)}/>
<g class="nb-ribbon"><path d="M430 96h26v76l-13-12-13 12z" fill="${BLUE}"/></g>
<g class="nb-pencil" transform="translate(472 334) rotate(-30)"><path d="M0-7h58a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5H0z" fill="#f2b84b"/><path d="M0-7-16 0 0 7z" fill="#f1dfc4"/><path d="M-16 0-9-3v6z" fill="${NAVY}"/><path d="M46-7h7V7h-7z" fill="${BLUE}"/></g>
</g>
${chip(1, 14, 182, 112, 'Locação')}${chip(2, 424, 218, 120, 'Entrega')}${chip(3, 372, 12, 172, 'Cuidado em casa')}
</svg>`

// A van do fim da pagina: estrada correndo, rodas girando, carroceria no embalo.
const wheel = cx => `<g class="van-wheel" style="--cx:${cx}px"><circle cx="${cx}" cy="132" r="17" fill="${NAVY}" stroke="#fff" stroke-width="4"/><path d="M${cx} 119v26M${cx - 13} 132h26" ${line('#fff', 3)}/></g>`
const VAN = `<svg class="van" viewBox="0 0 420 170" aria-hidden="true"><path d="M0 146h420" ${line('#ffffff', 2)} stroke-opacity="0.35"/><path class="van-dashes" d="M0 158h420" ${line('#ffffff', 3)} stroke-opacity="0.5" stroke-dasharray="26 22"/><g class="van-body"><path d="M96 54a10 10 0 0 1 10-10h150v86H96z" fill="${PAPER}"/><path d="M256 66h42a12 12 0 0 1 10 5l24 32a10 10 0 0 1 2 6v21h-78z" fill="#a9cdf2"/><path d="M268 76h26a6 6 0 0 1 5 3l15 21h-46z" fill="${NAVY}"/><path d="M168 70v34m-17-17h34" ${line(BLUE, 8)}/><path d="M106 116h140" ${line(SAND2, 3)}/></g>${wheel(150)}${wheel(290)}<path class="van-wind" d="M22 78h46M8 98h38M30 118h28" ${line('#ffffff', 3)} stroke-opacity="0.45" stroke-dasharray="40 60"/></svg>`

// Capa de artigo sem foto: pautas do caderno com a inicial da categoria.
const coverArt = post => `<div class="story-art" aria-hidden="true"><svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice"><path d="M40 84h320M40 124h320M40 164h240M40 204h320" ${line(SAND2, 3)}/><path d="M40 236c20-12 40 12 60 0s40-12 60 0 40 12 60 0" ${line(BLUE, 4)}/></svg><span>${e(String(post.category||'Y').trim().charAt(0).toUpperCase())}</span></div>`

const cover = (post, eager) => post.cover_id
  ? `<img src="/blog/capa/${e(post.cover_id)}" alt="${e(post.cover_alt||post.title)}" width="1200" height="800" ${eager?'fetchpriority="high"':'loading="lazy" decoding="async"'}>`
  : coverArt(post)

const dcBrandMark = () => `<div class="blog-brand-mark"><a class="blog-brand-mark__link" href="https://dcfoundrydigital.com" target="_blank" rel="noreferrer noopener" aria-label="Desenvolvido e Mantido por DC Foundry Digital"><img src="/dcfoundry-digital-logo.png" alt="DC Foundry Digital" width="48" height="48" loading="lazy"><span class="blog-brand-mark__text">Desenvolvido e Mantido por <strong class="blog-brand-mark__name">DC Foundry Digital<svg viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9c36-5 70-5 104-2 35 3 71 3 110-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/></svg></strong></span></a></div>`

export function layout({title,description,path,html,image=`${ORIGIN}/social-card.jpg`,schema,type='website',noindex=false,progress=false}) {
  const canonical=ORIGIN+path
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="robots" content="${noindex?'noindex,follow':'index,follow,max-image-preview:large'}"><link rel="canonical" href="${e(canonical)}"><link rel="icon" href="/favicon-32.png"><meta name="theme-color" content="#f6f1e8"><link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/blog.css"><script src="/blog.js" defer></script><meta property="og:type" content="${type}"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="Grupo YR Hospitalar"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:image" content="${e(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="${e(image)}">${schema?`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`:''}</head><body>${progress?'<div class="read-progress" aria-hidden="true"></div>':''}<a class="skip" href="#conteudo">Ir para o conteúdo</a>
<header class="blog-header"><div class="blog-header-inner"><a class="blog-brand" href="/" aria-label="Grupo YR Hospitalar, início"><img src="/yr-hospitalar-logo.jpg" alt="Grupo YR Hospitalar" width="1280" height="1280"></a><nav aria-label="Navegação principal"><a href="/#produtos">Equipamentos</a><a href="/comprar-ou-alugar">Compra ou locação</a><a href="/blog" ${path.startsWith('/blog')?'aria-current="page"':''}>Blog</a><a class="pill" href="/#contato">Pedir cotação ${ICON.arrow}</a></nav></div></header>
<main id="conteudo">${html}</main>
<footer class="blog-footer"><div class="blog-footer-inner"><div><a class="blog-footer-name" href="/">Grupo YR Hospitalar</a><p>Venda e locação de equipamentos hospitalares em Curitiba e região.</p></div><nav aria-label="Navegação do rodapé"><a href="/#produtos">Equipamentos</a><a href="/comprar-ou-alugar">Compra ou locação</a><a href="/blog">Blog</a><a href="mailto:rodrigo@grupoyrhospitalar.com.br">Fale com a YR</a></nav>${dcBrandMark()}<p class="blog-footer-legal">© ${new Date().getFullYear()} Grupo YR Hospitalar.</p></div></footer></body></html>`
}

export function card(post,index=0) {
  const featured=index===0
  return `<a class="story-card ${featured?'story-featured':''}" href="/blog/${e(post.slug)}" style="--i:${Math.min(index,8)}"><div class="story-image">${cover(post,featured)}<span class="round-arrow" aria-hidden="true">${ICON.arrow}</span></div><div class="story-copy"><div class="eyebrow">${e(post.category)} <span class="dot"></span> ${ICON.clock} ${minutes(post.body)} min</div><h2><span>${e(post.title)}</span></h2><p>${e(post.excerpt)}</p><span class="story-date">${date(post.published_at)}</span></div></a>`
}

export function indexPage(posts,total,page,query,categories=[]) {
  const filtered=Boolean(query), title='Blog YR | Guias sobre equipamentos hospitalares',description='Informação para planejar melhor: guias de compra, locação, entrega e organização de equipamentos hospitalares com o Grupo YR.'
  const next=(n)=>`/blog?${new URLSearchParams({...query?{q:query}:{},pagina:String(n)})}`
  const chips=categories.length?`<nav class="topic-chips" aria-label="Assuntos do blog"><a href="/blog" ${filtered?'':'aria-current="true"'}>Tudo</a>${categories.slice(0,8).map(name=>`<a href="/blog?${new URLSearchParams({q:name})}" ${query.toLowerCase()===String(name).toLowerCase()?'aria-current="true"':''}>${e(name)}</a>`).join('')}</nav>`:''
  const html=`<section class="journal-hero"><div class="journal-hero-copy"><div class="eyebrow"><span class="live-dot"></span> Caderno YR</div><h1>Boas escolhas começam com ${mark('clareza.')}</h1><p class="journal-lede">Guias práticos para quem cuida em casa e para quem faz a saúde acontecer: o que escolher, quando alugar, como receber e usar cada equipamento.</p><form action="/blog" class="blog-search" role="search"><label for="q">O que você quer entender melhor?</label><div>${ICON.search}<input id="q" name="q" type="search" maxlength="100" value="${e(query)}" placeholder="Entrega, locação, cama, colchão…"><button class="pill" type="submit">Buscar</button></div></form>${chips}</div><div class="journal-hero-art">${NOTEBOOK}</div></section>
<section class="journal-stories" aria-labelledby="stories-title"><div class="section-line"><h2 id="stories-title">${filtered?`Resultados para “${e(query)}”`:'Para a sua próxima decisão'}</h2><span>${total} ${total===1?'artigo':'artigos'}${filtered?' · <a href="/blog">Limpar busca</a>':''}</span></div>${posts.length?`<div class="stories-grid">${posts.map(card).join('')}</div>`:`<div class="empty-state"><h2>A próxima leitura está a caminho.</h2><p>Experimente outra busca ou conheça os equipamentos da YR.</p><a class="pill" href="/#produtos">Ver equipamentos ${ICON.arrow}</a></div>`}<nav class="pagination" aria-label="Páginas do blog">${page>1?`<a class="pill secondary" href="${e(next(page-1))}">${ICON.back} Anteriores</a>`:''}${page*9<total?`<a class="pill" href="${e(next(page+1))}">Próximos artigos ${ICON.next}</a>`:''}</nav></section>
<aside class="journal-cta"><div class="journal-cta-copy"><span class="eyebrow">Da leitura à prática</span><h2>Leu, entendeu, ${mark('precisa.')}</h2><p>Conte o que está acontecendo e a gente indica o equipamento, a modalidade e o prazo de entrega.</p><a class="pill light" href="/#contato">Falar com a YR ${ICON.arrow}</a></div><div class="journal-cta-art">${VAN}</div></aside>`
  return layout({title,description,path:page>1?`/blog?pagina=${page}`:'/blog',html,noindex:filtered,schema:{'@context':'https://schema.org','@type':'Blog',name:'Blog YR',url:ORIGIN+'/blog',inLanguage:'pt-BR',blogPost:posts.map(p=>({'@type':'BlogPosting',headline:p.title,url:ORIGIN+'/blog/'+p.slug,datePublished:new Date(p.published_at).toISOString()}))}})
}

export function articlePage(post,related) {
  const title=post.seo_title||`${post.title} | Blog YR`,description=post.seo_description||post.excerpt,path='/blog/'+post.slug
  const shareText=encodeURIComponent(`${post.title} ${ORIGIN}${path}`)
  const schema={'@context':'https://schema.org','@graph':[{'@type':'BlogPosting','@id':ORIGIN+path+'#article',headline:post.title,description,image:[imageUrl(post)],datePublished:new Date(post.published_at).toISOString(),dateModified:new Date(post.updated_at).toISOString(),author:{'@type':'Organization',name:'Grupo YR Hospitalar',url:ORIGIN+'/'},publisher:{'@type':'Organization',name:'Grupo YR Hospitalar',logo:{'@type':'ImageObject',url:ORIGIN+'/yr-hospitalar-logo.jpg'}},mainEntityOfPage:ORIGIN+path,inLanguage:'pt-BR'},{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Início',item:ORIGIN+'/'},{'@type':'ListItem',position:2,name:'Blog YR',item:ORIGIN+'/blog'},{'@type':'ListItem',position:3,name:post.title,item:ORIGIN+path}]}]}
  const updated=new Date(post.updated_at)-new Date(post.published_at)>86400000?` · Atualizado em ${date(post.updated_at)}`:''
  return layout({title,description,path,image:imageUrl(post),schema,type:'article',progress:true,html:`<article class="article"><nav class="breadcrumb" aria-label="Você está em"><a href="/">Início</a><span>/</span><a href="/blog">Blog</a><span>/</span><span>${e(post.category)}</span></nav>
<header class="article-heading"><div class="eyebrow">${e(post.category)} <span class="dot"></span> ${ICON.clock} ${minutes(post.body)} min de leitura</div><h1>${e(post.title)}</h1><p class="article-lede">${e(post.excerpt)}</p><div class="article-byline"><span class="author-mark">YR</span><div><strong>Grupo YR Hospitalar</strong><span>Publicado em ${date(post.published_at)}${updated}</span></div><a class="share" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer">${ICON.share} Enviar no WhatsApp</a></div></header>
${post.cover_id?`<figure class="article-cover"><img src="/blog/capa/${e(post.cover_id)}" alt="${e(post.cover_alt)}" width="1600" height="1000" fetchpriority="high"></figure>`:''}
<div class="article-layout"><aside class="article-aside"><span class="eyebrow">Seu próximo passo</span><p>Ficou com dúvida sobre o seu caso? A gente responde.</p><a class="pill" href="/#contato">Falar com a YR ${ICON.arrow}</a><a class="article-aside-back" href="/blog">${ICON.back} Todos os artigos</a></aside><div class="article-prose">${contentHtml(post.body)}<div class="article-end"><p>Precisa organizar a sua cotação?</p><a class="pill" href="/#produtos">Conhecer os equipamentos ${ICON.arrow}</a></div></div></div></article>
${related.length?`<section class="journal-stories related"><div class="section-line"><h2>Continue por aqui</h2><a href="/blog">Todo o caderno ${ICON.arrow}</a></div><div class="stories-grid">${related.map((p,i)=>card(p,i+1)).join('')}</div></section>`:''}`})
}
