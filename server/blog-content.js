import { marked } from 'marked'
import sanitizeHtml from './sanitizer.generated.mjs'
import { fail, uuidPattern } from './blog-db.js'
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

// Vídeo no artigo: o autor cola o link do YouTube ou do Vimeo SOZINHO em uma linha.
// O Markdown vira um parágrafo com um link puro, e só esse formato exato é trocado
// pelo player. O id é validado por regex e o HTML do player é montado aqui, então
// nada que o autor escreve chega ao <iframe>. O iframe nem existe na página até o
// leitor clicar (blog.js): nenhum pedido vai ao YouTube antes disso.
const VIDEO_PARAGRAPH = /<p><a href="(https?:\/\/[^"]+)"[^>]*>https?:\/\/[^<]*<\/a><\/p>/g
const YOUTUBE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^"&]*&(?:amp;)?)*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/
const VIMEO = /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[?&#/]|$)/
const PLAY_ICON = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle class="video-ring" cx="32" cy="32" r="30" fill="#ffffff" fill-opacity="0.14" stroke="#ffffff" stroke-width="2"/><path d="M26 20.5v23l19-11.5z" fill="#ffffff"/></svg>'

function videoFigure(kind, id, url) {
  const label = kind === 'youtube' ? 'YouTube' : 'Vimeo'
  return `<figure class="video" data-video="${kind}" data-id="${id}"><button type="button" class="video-play" aria-label="Reproduzir vídeo (${label})">${PLAY_ICON}<span class="video-caption">Assistir ao vídeo<small>Abre o player do ${label} aqui na página</small></span></button><noscript><a href="${escape(url)}" rel="noopener noreferrer">Assistir no ${label}</a></noscript></figure>`
}

export function embedVideos(html) {
  return html.replace(VIDEO_PARAGRAPH, (paragraph, url) => {
    const youtube = url.match(YOUTUBE)
    if (youtube) return videoFigure('youtube', youtube[1], url)
    const vimeo = url.match(VIMEO)
    if (vimeo) return videoFigure('vimeo', vimeo[1], url)
    return paragraph
  })
}

export function contentHtml(markdown) {
  return embedVideos(sanitizeHtml(marked.parse(String(markdown || ''), { async: false }), {
    allowedTags: ['p','h2','h3','h4','strong','em','ul','ol','li','blockquote','a','hr','br','code','pre','table','thead','tbody','tr','th','td'],
    allowedAttributes: { a: ['href','title','rel'] }, allowedSchemes: ['https','http','mailto'], allowProtocolRelative: false,
    transformTags: { a: (tag, attributes) => ({ tagName:tag, attribs:{...attributes,rel:'noopener noreferrer'} }) }
  }))
}
export function validatePost(data) {
  const result = {}
  for (const [name, max, min] of [['title',150,5],['slug',120,3],['excerpt',350,0],['body',80000,0],['category',60,1],['cover_alt',180,0],['seo_title',70,0],['seo_description',170,0]]) {
    if (typeof data[name] !== 'string') fail(400, `Campo inválido: ${name}.`)
    result[name] = data[name].trim()
    if(result[name].length > max || result[name].length < min) fail(400, `Revise o campo ${name}.`)
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) fail(400, 'Use letras minúsculas, números e hífens na URL.')
  if (!['draft','published','archived'].includes(data.status)) fail(400, 'Status inválido.')
  result.status = data.status
  result.cover_id = data.cover_id || null
  if (result.cover_id && !uuidPattern.test(result.cover_id)) fail(400, 'Capa inválida.')
  if (data.status === 'published' && (result.body.length < 200 || result.excerpt.length < 40 || (result.cover_id && !result.cover_alt))) fail(400, 'Para publicar, escreva o artigo (mínimo 200 caracteres), resumo (mínimo 40) e descrição da capa.')
  return result
}
