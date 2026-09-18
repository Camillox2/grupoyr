// Previa local do blog, SEM banco: os mesmos renderizadores de producao
// (server/blog-render.js) com artigos de exemplo. Serve para olhar o desenho.
//
//   node scripts/preview-blog.mjs        ->  http://127.0.0.1:5183/blog
//
// Nada daqui vai para producao: a Vercel usa api/blog-page.js com o Neon.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexPage, articlePage, layout } from '../server/blog-render.js'

const PORT = Number(process.env.PORT) || 5183
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

// Capas de exemplo: ids falsos apontando para fotos que ja estao no site.
const COVERS = {
  '00000000-0000-4000-8000-000000000001': 'products/cena-cama-eletrica.webp',
  '00000000-0000-4000-8000-000000000002': 'products/cena-cama-manual.webp',
  '00000000-0000-4000-8000-000000000003': 'products/cena-cadeira-banho.webp',
}
const days = (n) => new Date(Date.now() - n * 86400000).toISOString()
const paragraph = 'Quando alguém da família volta do hospital, a casa precisa mudar um pouco para receber bem. A boa notícia é que dá para resolver quase tudo com planejamento: medir os espaços, escolher o equipamento certo e combinar a entrega para antes da alta. '

const POSTS = [
  {
    slug: 'como-preparar-o-quarto-para-a-cama-hospitalar', title: 'Como preparar o quarto para receber a cama hospitalar', category: 'Cuidado em casa',
    excerpt: 'Medidas, tomada, circulação e piso: o que conferir antes da entrega para a montagem ser rápida e o paciente ficar confortável desde o primeiro dia.',
    cover_id: '00000000-0000-4000-8000-000000000001', cover_alt: 'Cama hospitalar elétrica montada em um quarto claro',
    body: `${paragraph.repeat(2)}\n\n## Comece pelas medidas\n\n${paragraph}\n\n- Largura da porta do quarto e do corredor\n- Espaço livre dos dois lados da cama\n- Tomada a menos de dois metros, no caso da cama elétrica\n\n> Deixe pelo menos 80 cm livres no lado em que o cuidador vai trabalhar. Faz diferença todos os dias.\n\n## Veja a montagem em vídeo\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n${paragraph}\n\n### E o colchão?\n\n${paragraph}\n\n| Item | Compra | Locação |\n| --- | --- | --- |\n| Cama elétrica | Sim | Sim |\n| Colchão pneumático | Sim | Não |\n\n---\n\n${paragraph}`,
  },
  {
    slug: 'comprar-ou-alugar-cama-hospitalar', title: 'Comprar ou alugar: como decidir sem arrependimento', category: 'Guia de compra e locação',
    excerpt: 'O prazo de uso é o que mais pesa na conta. Um jeito simples de comparar as duas modalidades antes de pedir a cotação.',
    cover_id: '00000000-0000-4000-8000-000000000002', cover_alt: 'Cama hospitalar manual em quarto preparado', body: paragraph.repeat(6),
  },
  {
    slug: 'banho-seguro-com-cadeira-de-banho', title: 'Banho seguro: o que observar na cadeira de banho', category: 'Equipamentos',
    excerpt: 'Rodízios, encosto e altura do assento. Os detalhes que evitam sustos no momento mais delicado da rotina de cuidado.',
    cover_id: '00000000-0000-4000-8000-000000000003', cover_alt: 'Cadeira de banho em banheiro adaptado', body: paragraph.repeat(5),
  },
  {
    slug: 'colchao-pneumatico-quando-usar', title: 'Colchão pneumático: quando ele é indicado', category: 'Equipamentos',
    excerpt: 'Para quem passa muitas horas deitado, a alternância de pressão ajuda a proteger a pele. Entenda como funciona e como cuidar do equipamento.',
    cover_id: null, cover_alt: '', body: paragraph.repeat(4),
  },
  {
    slug: 'checklist-para-o-dia-da-alta', title: 'Checklist para o dia da alta hospitalar', category: 'Cuidado em casa',
    excerpt: 'Uma lista curta para a família não esquecer de nada entre a conversa com a equipe do hospital e a chegada em casa.',
    cover_id: null, cover_alt: '', body: paragraph.repeat(4),
  },
].map((post, index) => ({ id: `post-${index}`, seo_title: '', seo_description: '', status: 'published', published_at: days(index * 6 + 2), updated_at: days(index * 6 + (index === 0 ? 0 : 2)), ...post }))

const CATEGORIES = [...new Set(POSTS.map((post) => post.category))]

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body) }
  try {
    if (url.pathname === '/blog') {
      const query = (url.searchParams.get('q') || '').trim()
      const list = query ? POSTS.filter((post) => `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(query.toLowerCase())) : POSTS
      return send(200, 'text/html; charset=utf-8', indexPage(list, list.length, 1, query, CATEGORIES))
    }
    const cover = url.pathname.match(/^\/blog\/capa\/([0-9a-f-]+)$/)
    if (cover && COVERS[cover[1]]) return send(200, 'image/webp', await readFile(path.join(PUBLIC_DIR, COVERS[cover[1]])))
    const article = url.pathname.match(/^\/blog\/([a-z0-9-]+)$/)
    if (article) {
      const post = POSTS.find((item) => item.slug === article[1])
      if (post) return send(200, 'text/html; charset=utf-8', articlePage(post, POSTS.filter((item) => item !== post).slice(0, 3)))
      return send(404, 'text/html; charset=utf-8', layout({ title: 'Artigo não encontrado | Blog YR', description: '', path: '/blog', noindex: true, html: '<section class="empty-state"><h1>Vamos encontrar outra leitura.</h1><p>Este artigo não está disponível.</p><a class="pill" href="/blog">Explorar o blog</a></section>' }))
    }
    // Arquivos de public/. path.normalize + conferencia de prefixo: sem "../".
    const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)))
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(403, 'text/plain', 'Fora de public/')
    return send(200, TYPES[path.extname(file)] || 'application/octet-stream', await readFile(file))
  } catch {
    return send(404, 'text/plain; charset=utf-8', 'Não encontrado')
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Previa do blog: http://127.0.0.1:${PORT}/blog`))
