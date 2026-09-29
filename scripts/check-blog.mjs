import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { db } from '../server/blog-db.js'
import { hashPassword, digest } from '../server/blog-auth.js'
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:5182',sql=db(),id=randomUUID(),email=`qa-${id}@example.invalid`,password=randomBytes(24).toString('base64url'),newPassword=randomBytes(25).toString('base64url')
let cookie='',csrf='',postId,mediaId
const slug=`qa-${id}`
async function request(action,data,override={}) {
  const response=await fetch(`${base}/api/blog-admin?action=${action}`,{method:data===undefined?'GET':'POST',headers:{...data===undefined?{}:{'Content-Type':'application/json',Origin:base,'X-CSRF-Token':csrf},Cookie:cookie,...override},body:data===undefined?undefined:JSON.stringify(data)})
  return {response,data:await response.json()}
}
async function publicStatus(path,status){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,status,path);return r}
try {
  await sql`INSERT INTO blog_admins(id,email,password_hash) VALUES(${id},${email},${await hashPassword(password)})`
  assert.equal((await request('posts')).response.status,401)
  assert.equal((await request('save',{})).response.status,401)
  assert.equal((await request('login',{email,password:'wrong-password'})).response.status,401)
  assert.equal((await request('login',{email,password},{Origin:'https://evil.example'})).response.status,403)
  let result=await request('login',{email,password});assert.equal(result.response.status,200);assert.equal(result.data.mustChangePassword,true)
  cookie=result.response.headers.get('set-cookie').split(';')[0];csrf=result.data.csrf
  assert.match(result.response.headers.get('set-cookie'),/HttpOnly/);assert.match(result.response.headers.get('set-cookie'),/SameSite=Strict/)
  assert.equal((await request('posts')).response.status,403)
  result=await request('password',{currentPassword:password,password:newPassword});assert.equal(result.response.status,200)
  assert.equal((await request('session')).response.status,401)
  result=await request('login',{email,password:newPassword});assert.equal(result.response.status,200);cookie=result.response.headers.get('set-cookie').split(';')[0];csrf=result.data.csrf
  assert.equal(result.data.mustChangePassword,false)
  assert.equal((await request('preview',{body:'hello'},{'X-CSRF-Token':'wrong'})).response.status,403)
  assert.equal((await request('preview',{body:'hello'},{Origin:'https://evil.example'})).response.status,403)
  result=await request('preview',{body:'## Title\n\n<script>alert(1)</script><img src=x onerror=alert(1)> [bad](javascript:alert(1))\n\n**safe**'});assert.equal(result.response.status,200);assert(!/<script|onerror=|<img|href="javascript:/i.test(result.data.html));assert.match(result.data.html,/<strong>safe<\/strong>/)
  console.log('PASS admin authentication, first password change, session revocation, CSRF and XSS filtering')
  assert.equal((await request('upload',{image:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')})).response.status,400)
  result=await request('upload',{image:(await readFile('public/products/cama-hospitalar.webp')).toString('base64')});assert.equal(result.response.status,201);mediaId=result.data.id
  await publicStatus('/blog/capa/'+mediaId,404)
  const draft={title:'Verificação temporária do blog',slug,excerpt:'Este artigo temporário verifica o fluxo de publicação, os rascunhos e o sitemap do blog.',body:'## Conteúdo de verificação\n\n'+ 'Um texto temporário para validar o fluxo do editor. '.repeat(12),category:'QA',cover_id:mediaId,cover_alt:'Cama hospitalar em imagem de referência.',seo_title:'Teste temporário',seo_description:'Teste temporário do blog.',status:'draft'}
  result=await request('save',draft);assert.equal(result.response.status,200,JSON.stringify(result.data));postId=result.data.post.id;let post=result.data.post
  assert.equal((await request('save',draft)).response.status,409)
  await publicStatus('/blog/'+slug,404)
  result=await request('save',{...post,status:'published'});assert.equal(result.response.status,200,JSON.stringify(result.data));post=result.data.post
  let html=await (await publicStatus('/blog/'+slug,200)).text();assert.match(html,/<h1>Verificação temporária/);assert.match(html,/'?BlogPosting/);assert.match(html,new RegExp(`rel="canonical" href="https://grupoyrhospitalar.com.br/blog/${slug}"`))
  await publicStatus('/blog/capa/'+mediaId,200)
  let sitemap=await (await publicStatus('/sitemap-blog-1.xml',200)).text();assert(sitemap.includes('/blog/'+slug));assert.match(sitemap,/<lastmod>/)
  const oldVersion=post;result=await request('save',{...post,slug:slug+'-novo'});assert.equal(result.response.status,200,JSON.stringify(result.data));post=result.data.post
  const redirect=await publicStatus('/blog/'+slug,301);assert(redirect.headers.get('location').endsWith(slug+'-novo'))
  assert.equal((await request('save',oldVersion)).response.status,409)
  assert.equal((await request('save',draft)).response.status,409)
  result=await request('save',{...post,status:'archived'});assert.equal(result.response.status,200);post=result.data.post
  await publicStatus('/blog/'+slug+'-novo',404);await publicStatus('/blog/'+slug,404);await publicStatus('/blog/capa/'+mediaId,404)
  const rootSitemap=await (await publicStatus('/sitemap.xml',200)).text();assert(!rootSitemap.includes(slug))
  const allPosts=await sql`SELECT slug FROM blog_posts WHERE status='published'`;if(allPosts.length){sitemap=await(await publicStatus('/sitemap-blog-1.xml',200)).text();assert(!sitemap.includes(slug))}
  await publicStatus('/blog?pagina=99999',404)
  const filtered=await(await publicStatus('/blog?q=nonexistent-test-value',200)).text();assert.match(filtered,/noindex,follow/)
  assert.equal((await request('save',{...draft,slug:"'; DROP TABLE blog_posts;--"})).response.status,400)
  assert.equal((await request('logout',{})).response.status,200);assert.equal((await request('session')).response.status,401)
  for(let i=0;i<12;i++)result=await request('login',{email,password:'invalid'})
  assert.equal(result.response.status,429)
  console.log('PASS image validation, private drafts/media, publication HTML/schema, sitemap, 301 redirects, conflicts, archive privacy, SQL input validation, logout and login rate limiting')
}finally{
  if(postId)await sql`DELETE FROM blog_posts WHERE id=${postId}`
  if(mediaId)await sql`DELETE FROM blog_media WHERE id=${mediaId}`
  await sql`DELETE FROM blog_admins WHERE id=${id}`
  await sql`DELETE FROM blog_login_limits WHERE key=${digest(`email:${email}`)} OR key=${digest('ip:127.0.0.1')}`
  console.log('Temporary QA records removed.')
}
