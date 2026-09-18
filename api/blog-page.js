import { db, ORIGIN } from '../server/blog-db.js'
import { indexPage, articlePage, layout } from '../server/blog-render.js'
export default async function handler(req,res) {
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.setHeader('Cache-Control','no-cache, no-store, must-revalidate')
  if(!['GET','HEAD'].includes(req.method)) { res.statusCode=405; res.setHeader('Allow','GET, HEAD'); return res.end() }
  if(process.env.VERCEL_ENV && process.env.VERCEL_ENV!=='production') res.setHeader('X-Robots-Tag','noindex')
  try {
    const url=new URL(req.url,ORIGIN),slug=url.searchParams.get('slug'),sql=db()
    if(slug) {
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>120) return notFound(res)
      const [post]=await sql`SELECT * FROM blog_posts WHERE slug=${slug} AND status='published'`
      if(!post) {
        const [redirect]=await sql`SELECT p.slug FROM blog_redirects r JOIN blog_posts p ON p.id=r.post_id WHERE r.slug=${slug} AND p.status='published'`
        if(redirect) { res.statusCode=301;res.setHeader('Location',ORIGIN+'/blog/'+redirect.slug);return res.end() }
        return notFound(res)
      }
      const related=await sql`SELECT * FROM blog_posts WHERE status='published' AND id<>${post.id} ORDER BY published_at DESC LIMIT 3`
      return res.end(req.method==='HEAD'?'':articlePage(post,related))
    }
    const query=String(url.searchParams.get('q')||'').trim().slice(0,100),rawPage=url.searchParams.get('pagina')||'1'
    if(!/^[1-9][0-9]{0,4}$/.test(rawPage)) return notFound(res)
    const page=Number(rawPage),match=`%${query.replace(/[\\%_]/g,'\\$&')}%`
    const [count]=await sql`SELECT COUNT(*)::int AS total FROM blog_posts WHERE status='published' AND (title ILIKE ${match} OR excerpt ILIKE ${match} OR category ILIKE ${match})`
    if(page>1 && (page-1)*9>=count.total) return notFound(res)
    const posts=await sql`SELECT * FROM blog_posts WHERE status='published' AND (title ILIKE ${match} OR excerpt ILIKE ${match} OR category ILIKE ${match}) ORDER BY published_at DESC,id LIMIT 9 OFFSET ${(page-1)*9}`
    // Assuntos para os atalhos do topo. Falhar aqui nao pode derrubar a pagina.
    const categories=await sql`SELECT category FROM blog_posts WHERE status='published' GROUP BY category ORDER BY COUNT(*) DESC, category LIMIT 8`.then(rows=>rows.map(row=>row.category),()=>[])
    return res.end(req.method==='HEAD'?'':indexPage(posts,count.total,page,query,categories))
  } catch(error) {
    console.error('Public blog failed',error.code||error.name)
    res.statusCode=503;res.setHeader('Retry-After','60');res.setHeader('X-Robots-Tag','noindex')
    return res.end(layout({title:'Blog YR | Voltamos em instantes',description:'O blog está temporariamente indisponível.',path:'/blog',noindex:true,html:'<section class="empty-state"><h1>Voltamos em instantes.</h1><p>Não foi possível carregar o blog agora. Tente novamente em alguns minutos.</p><a class="pill" href="/">Voltar à YR</a></section>'}))
  }
}
function notFound(res) {res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end(layout({title:'Artigo não encontrado | Blog YR',description:'Explore os artigos do Blog YR.',path:'/blog',noindex:true,html:'<section class="empty-state"><h1>Vamos encontrar outra leitura.</h1><p>Este artigo não está disponível.</p><a class="pill" href="/blog">Explorar o blog</a></section>'}))}
