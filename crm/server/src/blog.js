import { randomUUID } from 'node:crypto'
import pg from 'pg'

// Ponte entre a Central editorial do CRM e o blog PUBLICO do site.
//
// O site le os artigos das tabelas blog_posts / blog_media (scripts/blog-schema.sql
// na raiz do repositorio). Sem esta ponte, "publicar" no CRM gravava so no
// proprio CRM e o artigo nunca aparecia em site.grupoyrhospitalar.com.br/blog.
//
// Liga quando existe BLOG_DATABASE_URL (ou DATABASE_URL) apontando para o banco
// do site E a tabela blog_posts existe la. Caso contrario o CRM continua no modo
// local e a tela avisa que nada vai para o site.
//
// O corpo do artigo e guardado como Markdown puro. Quem transforma em HTML e
// SANITIZA e o site, na hora de exibir (server/blog-content.js): a defesa contra
// XSS continua num lugar so.

const SITE_ORIGIN = 'https://site.grupoyrhospitalar.com.br'
const CONNECTION = process.env.BLOG_DATABASE_URL || process.env.DATABASE_URL || ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class BlogError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

let pool = null
let linkCheck = { at: 0, linked: false }

function getPool() {
  if (!CONNECTION) return null
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(CONNECTION)
    pool = new pg.Pool({ connectionString: CONNECTION, ssl: local ? false : { rejectUnauthorized: true }, max: 3 })
    // Erro de conexao ociosa nao pode derrubar o processo do CRM.
    pool.on('error', (error) => console.error('[Blog] Conexão com o banco do site caiu:', error.code || error.message))
  }
  return pool
}

/** true quando o CRM consegue gravar no blog do site. Reconfere a cada minuto. */
export async function isLinked() {
  if (!CONNECTION) return false
  if (Date.now() - linkCheck.at < 60_000) return linkCheck.linked
  try {
    const { rows } = await getPool().query("SELECT to_regclass('public.blog_posts') IS NOT NULL AND to_regclass('public.blog_media') IS NOT NULL AS ok")
    linkCheck = { at: Date.now(), linked: Boolean(rows[0]?.ok) }
  } catch (error) {
    console.error('[Blog] Não foi possível falar com o banco do site:', error.code || error.message)
    linkCheck = { at: Date.now(), linked: false }
  }
  return linkCheck.linked
}

/* ------------------------------------------------------------------ formato */

// Banco do site (snake_case) -> formato que a tela do CRM ja usava.
const toClient = (row) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  summary: row.excerpt,
  content: row.body,
  category: row.category,
  status: row.status,
  coverId: row.cover_id,
  coverImage: row.cover_id ? `/api/blog/media/${row.cover_id}` : null,
  coverAlt: row.cover_alt,
  gallery: [],
  seoTitle: row.seo_title,
  seoDescription: row.seo_description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
  version: row.version,
  publicUrl: row.status === 'published' ? `${SITE_ORIGIN}/blog/${row.slug}` : null,
})

const makeSlug = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120)
  .replace(/-+$/, '')

// As MESMAS regras do painel do site (validatePost em server/blog-content.js):
// o que o CRM grava tem que ser aceito e exibido pelo site sem surpresa.
function validate(body) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '')
  const post = {
    title: text(body.title),
    slug: makeSlug(text(body.slug) || text(body.title)),
    excerpt: text(body.summary),
    body: text(body.content),
    category: text(body.category) || 'Guia YR',
    cover_alt: text(body.coverAlt),
    seo_title: text(body.seoTitle),
    seo_description: text(body.seoDescription),
    status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : 'draft',
    cover_id: body.coverId || null,
  }
  const limits = { title: [5, 150, 'título'], slug: [3, 120, 'endereço do artigo'], excerpt: [0, 350, 'resumo'], body: [0, 80000, 'conteúdo'], category: [1, 60, 'categoria'], cover_alt: [0, 180, 'descrição da capa'], seo_title: [0, 70, 'título de SEO'], seo_description: [0, 170, 'descrição de SEO'] }
  for (const [field, [min, max, label]] of Object.entries(limits)) {
    if (post[field].length < min || post[field].length > max) {
      throw new BlogError(`Revise o campo ${label}: de ${min} a ${max} caracteres.`)
    }
  }
  if (!SLUG.test(post.slug)) throw new BlogError('O endereço do artigo aceita só letras minúsculas, números e hífens.')
  if (post.cover_id && !UUID.test(post.cover_id)) throw new BlogError('Capa inválida.')
  if (post.status === 'published') {
    if (post.body.length < 200) throw new BlogError('Para publicar, o artigo precisa de pelo menos 200 caracteres.')
    if (post.excerpt.length < 40) throw new BlogError('Para publicar, o resumo precisa de pelo menos 40 caracteres.')
    if (post.cover_id && !post.cover_alt) throw new BlogError('Para publicar com capa, descreva a imagem (acessibilidade).')
  }
  return post
}

/* -------------------------------------------------------------------- rotas */

export async function listPosts() {
  const { rows } = await getPool().query('SELECT * FROM blog_posts ORDER BY updated_at DESC LIMIT 300')
  return rows.map(toClient)
}

export async function savePost(id, body) {
  const post = validate(body)
  if (id && !UUID.test(id)) throw new BlogError('Artigo inválido.')
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    // Mesmo cadeado do painel do site: reserva de URL serializada, para um
    // redirecionamento antigo nao ser atropelado por um artigo novo.
    await client.query('SELECT pg_advisory_xact_lock(89746321)')
    const taken = await client.query('SELECT 1 FROM blog_redirects WHERE slug=$1', [post.slug])
    if (taken.rowCount) throw new BlogError('Este endereço já foi usado por outro artigo e está reservado para redirecionamento.', 409)

    const values = [post.slug, post.title, post.excerpt, post.body, post.category, post.cover_id, post.cover_alt, post.seo_title, post.seo_description, post.status]
    let saved
    if (id) {
      const version = Number(body.version)
      if (!Number.isInteger(version) || version < 1) throw new BlogError('Versão inválida. Reabra o artigo.')
      const previous = await client.query('SELECT slug FROM blog_posts WHERE id=$1 AND version=$2 FOR UPDATE', [id, version])
      // Alguem salvou pelo painel do site (ou em outra aba) depois que este foi aberto.
      if (!previous.rowCount) throw new BlogError('O artigo mudou em outro lugar depois que você abriu. Reabra antes de salvar.', 409)
      saved = await client.query(
        `UPDATE blog_posts SET slug=$1,title=$2,excerpt=$3,body=$4,category=$5,cover_id=$6,cover_alt=$7,seo_title=$8,seo_description=$9,status=$10,
           published_at=CASE WHEN $10='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW(),version=version+1
         WHERE id=$11 RETURNING *`,
        [...values, id],
      )
      // Mudou a URL de um artigo: a antiga passa a redirecionar para a nova.
      if (previous.rows[0].slug !== post.slug) {
        await client.query('INSERT INTO blog_redirects(slug,post_id) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING', [previous.rows[0].slug, id])
      }
    } else {
      saved = await client.query(
        `INSERT INTO blog_posts(id,slug,title,excerpt,body,category,cover_id,cover_alt,seo_title,seo_description,status,published_at)
         VALUES($11,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10='published' THEN NOW() ELSE NULL END) RETURNING *`,
        [...values, randomUUID()],
      )
    }
    await client.query('COMMIT')
    return toClient(saved.rows[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error.code === '23505') throw new BlogError('Já existe um artigo com este endereço. Escolha outro.', 409)
    if (error.code === '23503') throw new BlogError('A capa não está mais disponível. Envie a imagem de novo.')
    throw error
  } finally {
    client.release()
  }
}

/** O site nao apaga artigo: arquiva. Some do blog e continua recuperavel. */
export async function archivePost(id) {
  if (!UUID.test(id)) throw new BlogError('Artigo inválido.')
  const { rowCount } = await getPool().query("UPDATE blog_posts SET status='archived',updated_at=NOW(),version=version+1 WHERE id=$1", [id])
  if (!rowCount) throw new BlogError('Artigo não encontrado.', 404)
}

/**
 * Capa: a imagem e REcodificada (sharp) antes de ir para o banco. Isso valida
 * que e imagem de verdade, descarta metadados (GPS da foto, por exemplo) e
 * qualquer conteudo escondido no arquivo, e padroniza em WebP.
 */
export async function uploadCover(buffer) {
  if (!buffer?.length || buffer.length > 10 * 1024 * 1024) throw new BlogError('Escolha uma imagem de até 10 MB.')
  let output
  try {
    const { default: sharp } = await import('sharp')
    const image = sharp(buffer, { limitInputPixels: 25_000_000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('formato')
    output = await image.rotate().resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  } catch {
    throw new BlogError('Imagem inválida. Use JPG, PNG ou WebP estático.')
  }
  const id = randomUUID()
  await getPool().query('INSERT INTO blog_media(id,data) VALUES($1,$2)', [id, output])
  return { id, url: `/api/blog/media/${id}` }
}

export async function readMedia(id) {
  if (!UUID.test(id)) return null
  const { rows } = await getPool().query('SELECT data FROM blog_media WHERE id=$1', [id])
  return rows[0]?.data || null
}
