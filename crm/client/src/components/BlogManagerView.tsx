import React, { useEffect, useMemo, useState } from 'react'
import { Archive, BookOpen, Camera, CheckCircle2, ExternalLink, Eye, FileText, Globe, ImagePlus, LoaderCircle, Pencil, Plus, Save, Search, Trash2, TriangleAlert, Upload, Video, X } from 'lucide-react'
import { Mark } from './ui/PageHeader'
import { Toast, useToast } from './ui/Toast'

type Status = 'draft' | 'published' | 'archived'
// coverId, version e publicUrl so existem quando o CRM esta ligado ao blog do site.
interface BlogPost { id: string; title: string; slug: string; summary: string; content: string; category: string; status: Status; coverImage: string | null; coverId?: string | null; coverAlt: string; gallery: string[]; seoTitle: string; seoDescription: string; createdAt: string; updatedAt: string; publishedAt: string | null; version?: number; publicUrl?: string | null }
const emptyArticle = () => ({ title: '', slug: '', summary: '', content: '', category: 'Cuidado em casa', status: 'draft' as Status, coverImage: null as string | null, coverId: null as string | null, coverAlt: '', gallery: [] as string[], seoTitle: '', seoDescription: '', version: undefined as number | undefined })
const statusText: Record<Status, string> = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' }

// A capa do blog do site fica atras do login do CRM, e <img> nao manda o token:
// busca com o cabecalho e mostra por um endereco local (blob).
const AuthImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [url, setUrl] = useState<string | null>(src.startsWith('/api/') ? null : src)
  useEffect(() => {
    if (!src.startsWith('/api/')) { setUrl(src); return }
    let revoked: string | null = null
    let alive = true
    fetch(src, { headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` } })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => { if (blob && alive) { revoked = URL.createObjectURL(blob); setUrl(revoked) } })
      .catch(() => {})
    return () => { alive = false; if (revoked) URL.revokeObjectURL(revoked) }
  }, [src])
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`${className || ''} animate-pulse bg-blue-50`} aria-hidden="true" />
}
const dateText = (date: string | null) => date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)) : 'Ainda não publicado'

export const BlogManagerView: React.FC = () => {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyArticle())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = ainda perguntando ao servidor se o CRM alcanca o blog do site.
  const [linked, setLinked] = useState<boolean | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { toast, show: showToast, dismiss: dismissToast } = useToast()
  // O aviso verde entrava no topo e empurrava a tela: agora e flutuante.
  const setNotice = (message: string | null) => { if (message) showToast({ tone: 'ok', message }) }
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` })
  const selected = posts.find((post) => post.id === selectedId) || null

  const loadPosts = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/blog/posts', { headers: headers() })
      if (!response.ok) throw new Error('Não foi possível carregar os artigos.')
      setPosts(await response.json())
    } catch (e: any) { setError(e.message || 'Não foi possível carregar os artigos.') } finally { setLoading(false) }
  }
  useEffect(() => {
    loadPosts()
    fetch('/api/blog/status', { headers: headers() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setLinked(Boolean(data?.linked)))
      .catch(() => setLinked(false))
  }, [])

  const listedPosts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    return term ? posts.filter((post) => `${post.title} ${post.category} ${post.status}`.toLocaleLowerCase('pt-BR').includes(term)) : posts
  }, [posts, query])

  const newArticle = () => { setSelectedId(null); setDraft(emptyArticle()); setError(null); setPreview(false); setConfirmingDelete(false) }
  const editArticle = (post: BlogPost) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, publishedAt: _publishedAt, publicUrl: _publicUrl, ...editable } = post
    setSelectedId(post.id); setDraft({ ...emptyArticle(), ...editable }); setError(null); setConfirmingDelete(false)
  }

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return [] as string[]
    setUploading(true); setError(null)
    try {
      const form = new FormData()
      Array.from(files).forEach((file) => form.append('images', file))
      const response = await fetch('/api/blog/media', { method: 'POST', headers: headers(), body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar as imagens.')
      return data.images.map((image: { url: string }) => image.url) as string[]
    } catch (e: any) { setError(e.message || 'Não foi possível enviar as imagens.'); return [] } finally { setUploading(false) }
  }
  const addCover = async (files: FileList | null) => {
    if (!linked) { const [image] = await uploadImages(files); if (image) setDraft((item) => ({ ...item, coverImage: image })); return }
    const file = files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const response = await fetch('/api/blog/cover', { method: 'POST', headers: headers(), body: form })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar a capa.')
      setDraft((item) => ({ ...item, coverImage: data.url, coverId: data.id }))
    } catch (e: any) { setError(e.message || 'Não foi possível enviar a capa.') } finally { setUploading(false) }
  }
  // Video: o link sozinho em uma linha vira player no site (so carrega no clique).
  const insertVideo = () => setDraft((item) => ({ ...item, content: `${item.content.replace(/\s+$/, '')}\n\nhttps://www.youtube.com/watch?v=COLE_O_CODIGO_DO_VIDEO\n\n` }))
  const addGallery = async (files: FileList | null) => { const images = await uploadImages(files); if (images.length) setDraft((item) => ({ ...item, gallery: [...item.gallery, ...images].slice(0, 8) })) }

  const saveArticle = async (status: Status) => {
    if (!draft.title.trim()) return setError('Informe o título do artigo antes de salvar.')
    setSaving(true); setError(null)
    try {
      const response = await fetch(selected ? `/api/blog/posts/${selected.id}` : '/api/blog/posts', {
        method: selected ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ ...draft, status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o artigo.')
      setPosts((items) => selected ? items.map((item) => item.id === data.id ? data : item) : [data, ...items])
      editArticle(data)
      if (status === 'published' && linked && data.publicUrl) showToast({ tone: 'ok', message: 'Publicado no blog do site.', action: { label: 'Ver no site', onClick: () => window.open(data.publicUrl, '_blank', 'noopener') } })
      else setNotice(status === 'published' ? 'Marcado como publicado aqui no CRM. Ainda não aparece no site.' : 'Rascunho salvo.')
    } catch (e: any) { setError(e.message || 'Não foi possível salvar o artigo.') } finally { setSaving(false) }
  }

  const deleteArticle = async () => {
    if (!selected) return
    // Dois cliques no lugar do confirm() do navegador, que trava a tela.
    if (!confirmingDelete) { setConfirmingDelete(true); return }
    setConfirmingDelete(false)
    try {
      const response = await fetch(`/api/blog/posts/${selected.id}`, { method: 'DELETE', headers: headers() })
      if (!response.ok) throw new Error('Não foi possível excluir o artigo.')
      setPosts((items) => items.filter((item) => item.id !== selected.id)); newArticle(); setNotice(linked ? 'Artigo arquivado: saiu do blog do site e pode ser recuperado no painel.' : 'Artigo removido da central editorial.')
    } catch (e: any) { setError(e.message || 'Não foi possível excluir o artigo.') }
  }

  return <div className="space-y-5 pb-12">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-100 bg-[#fffdf9] p-5 shadow-sm lg:flex-row lg:items-center">
      <div><p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--yr-500)' }}><BookOpen className="h-4 w-4" />Blog YR</p><h2 className="serif text-[clamp(28px,3.4vw,44px)] leading-[1.05]" style={{ color: 'var(--ink)' }}><Mark>Central editorial</Mark></h2><p className="mt-4 text-[14px]" style={{ color: 'var(--ink-muted)' }}>Escreva, revise e publique os artigos do Blog YR.</p></div>
      <button onClick={newArticle} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a4c] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0b2d4c]"><Plus className="h-4 w-4" />Novo artigo</button>
    </header>
    {linked === true && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><Globe className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">Ligado ao blog do site: o que você publicar aqui aparece em site.grupoyrhospitalar.com.br/blog.</span><a href="https://site.grupoyrhospitalar.com.br/blog" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-extrabold underline underline-offset-4">Abrir o blog <ExternalLink className="h-3 w-3" /></a></div>}
    {linked === false && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Modo local: estes artigos ficam só no CRM e <strong>não aparecem no site</strong>. Para publicar no blog do site, o servidor do CRM precisa da variável <code className="rounded bg-amber-100 px-1">BLOG_DATABASE_URL</code> com a conexão do banco do site (a mesma DATABASE_URL da Vercel).</span></div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-blue-100 bg-[#fffdf9] px-5 py-4"><div><h3 className="text-sm font-bold text-slate-900">{selected ? 'Editar artigo' : 'Novo artigo'}</h3><p className="mt-0.5 text-[11px] text-slate-500">JPG, PNG e WebP de até 5 MB.</p></div><span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${draft.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-[#102a4c]'}`}>{statusText[draft.status]}</span></div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">Título do artigo<input value={draft.title} onChange={(e) => setDraft((item) => ({ ...item, title: e.target.value }))} placeholder="Ex.: Como preparar a casa para receber uma cama hospitalar" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="block text-xs font-bold text-slate-700">Resumo de abertura<textarea value={draft.summary} onChange={(e) => setDraft((item) => ({ ...item, summary: e.target.value }))} rows={3} placeholder="Uma introdução curta que explica o valor do artigo." className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <div><div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-bold text-slate-700">Imagem de capa</span>{draft.coverImage && <button onClick={() => setDraft((item) => ({ ...item, coverImage: null, coverId: null }))} className="text-[11px] font-semibold text-rose-600">Remover</button>}</div>
              {draft.coverImage ? <AuthImage src={draft.coverImage} alt={draft.coverAlt || 'Prévia da capa'} className="h-56 w-full rounded-xl border border-blue-100 object-cover" /> : <label className="flex h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 text-center text-blue-700 hover:bg-blue-50"><Camera className="h-7 w-7" /><span className="mt-2 text-xs font-bold">Adicionar imagem de capa</span><span className="mt-1 text-[11px] text-slate-500">Formato recomendado: horizontal</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => addCover(e.target.files)} className="hidden" /></label>}
              {draft.coverImage && <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-[#102a4c]"><Upload className="h-3.5 w-3.5" />Trocar imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => addCover(e.target.files)} className="hidden" /></label>}
              <input value={draft.coverAlt} onChange={(e) => setDraft((item) => ({ ...item, coverAlt: e.target.value }))} placeholder="Descrição da imagem para acessibilidade" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-blue-500" /></div>
            {!linked && <div><div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-bold text-slate-700">Galeria do artigo</span><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#102a4c]"><ImagePlus className="h-3.5 w-3.5" />Adicionar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => addGallery(e.target.files)} className="hidden" /></label></div>
              {draft.gallery.length ? <div className="grid grid-cols-4 gap-2">{draft.gallery.map((image) => <div key={image} className="relative"><img src={image} alt="Foto da galeria" className="h-20 w-full rounded-lg border border-slate-200 object-cover" /><button onClick={() => setDraft((item) => ({ ...item, gallery: item.gallery.filter((value) => value !== image) }))} className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-rose-600"><X className="h-3 w-3" /></button></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">Inclua fotos complementares de equipamentos, ambientes e orientações de entrega.</p>}</div>}
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-slate-700">Conteúdo do artigo</span><button type="button" onClick={insertVideo} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#102a4c]"><Video className="h-3.5 w-3.5" />Inserir vídeo</button></div>
            <label className="block text-xs font-bold text-slate-700"><span className="sr-only">Conteúdo do artigo</span><textarea value={draft.content} onChange={(e) => setDraft((item) => ({ ...item, content: e.target.value }))} rows={12} placeholder="Escreva o conteúdo completo do artigo." className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><span className="mt-1.5 block text-[11px] font-medium leading-relaxed text-slate-500">Markdown: <code>## Título de seção</code>, <code>**negrito**</code>, <code>- item de lista</code>. Para vídeo, deixe o link do YouTube ou do Vimeo sozinho em uma linha: no site ele vira um player que só carrega quando o leitor clica.</span></label>
          </div>
          <aside className="space-y-4"><label className="block text-xs font-bold text-slate-700">Status editorial<select value={draft.status} onChange={(e) => setDraft((item) => ({ ...item, status: e.target.value as Status }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"><option value="draft">Rascunho</option><option value="published">Publicado</option>{linked && <option value="archived">Arquivado</option>}</select></label>
            <label className="block text-xs font-bold text-slate-700">Categoria<select value={draft.category} onChange={(e) => setDraft((item) => ({ ...item, category: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"><option>Cuidado em casa</option><option>Para clínicas</option><option>Equipamentos</option><option>Guia de compra e locação</option></select></label>
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3"><p className="text-xs font-bold text-[#102a4c]">SEO do artigo</p><label className="block text-[11px] font-semibold text-slate-600">Título para busca<input value={draft.seoTitle} onChange={(e) => setDraft((item) => ({ ...item, seoTitle: e.target.value }))} placeholder="Usa o título se vazio" className="mt-1 w-full rounded-lg border border-blue-100 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-blue-500" /></label><label className="block text-[11px] font-semibold text-slate-600">Descrição para busca<textarea value={draft.seoDescription} onChange={(e) => setDraft((item) => ({ ...item, seoDescription: e.target.value }))} rows={3} placeholder="Resumo para resultados de busca" className="mt-1 w-full resize-none rounded-lg border border-blue-100 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-blue-500" /></label><label className="block text-[11px] font-semibold text-slate-600">URL amigável<input value={draft.slug} onChange={(e) => setDraft((item) => ({ ...item, slug: e.target.value }))} placeholder="Gerada ao salvar" className="mt-1 w-full rounded-lg border border-blue-100 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-blue-500" /></label></div>
            <button onClick={() => setPreview(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white py-2.5 text-xs font-bold text-[#102a4c]"><Eye className="h-4 w-4" />Abrir prévia</button>{selected?.publicUrl && <a href={selected.publicUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-800"><ExternalLink className="h-4 w-4" />Ver no site</a>}{selected && <button onClick={deleteArticle} onBlur={() => setConfirmingDelete(false)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-700">{linked ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{confirmingDelete ? 'Clique de novo para confirmar' : linked ? 'Arquivar artigo' : 'Excluir artigo'}</button>}</aside>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-blue-100 bg-[#fffdf9] p-4 sm:flex-row sm:justify-end"><button onClick={() => saveArticle('draft')} disabled={saving || uploading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-[#102a4c] disabled:opacity-50"><Save className="h-4 w-4" />Salvar rascunho</button><button onClick={() => saveArticle('published')} disabled={saving || uploading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a4c] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? 'Salvando...' : linked ? 'Publicar no site' : 'Salvar como publicado'}</button></footer>
      </section>
      <aside className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"><div className="border-b border-blue-100 bg-[#fffdf9] p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Biblioteca de artigos</h3><span className="text-[11px] font-semibold text-slate-500">{posts.length} total</span></div><label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar artigos" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-500" /></label></div><div className="max-h-[760px] space-y-1 overflow-y-auto p-2">{loading ? <div className="flex items-center justify-center gap-2 p-8 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando biblioteca...</div> : listedPosts.length ? listedPosts.map((post) => <button key={post.id} onClick={() => editArticle(post)} className={`flex w-full gap-3 rounded-xl p-2.5 text-left ${selectedId === post.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}><div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-blue-100 bg-blue-50">{post.coverImage ? <AuthImage src={post.coverImage} alt="" className="h-full w-full object-cover" /> : <FileText className="m-5 h-6 w-6 text-blue-300" />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold uppercase tracking-wide text-blue-700">{post.category}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${post.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{statusText[post.status] || post.status}</span></div><p className="mt-1 line-clamp-2 text-xs font-bold leading-4 text-slate-800">{post.title}</p><p className="mt-1 text-[10px] text-slate-400">{dateText(post.publishedAt || post.updatedAt)}</p></div><Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" /></button>) : <div className="p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-blue-200" /><p className="mt-2 text-xs font-semibold text-slate-600">Nenhum artigo ainda</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Comece um artigo e inclua fotos de capa ou galeria.</p></div>}</div></aside>
    </div>
    <Toast toast={toast} onDismiss={dismissToast} />
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><article className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Prévia editorial · {draft.category}</p><h3 className="mt-1 text-sm font-bold text-slate-900">Visualização do artigo</h3></div><button onClick={() => setPreview(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="p-6 sm:p-9">{draft.coverImage && <AuthImage src={draft.coverImage} alt={draft.coverAlt || 'Capa do artigo'} className="mb-7 aspect-[16/8] w-full rounded-xl object-cover" />}<p className="text-xs font-bold uppercase tracking-wider text-blue-700">{draft.category}</p><h1 className="mt-3 text-2xl font-black leading-tight text-slate-900">{draft.title || 'Título do artigo'}</h1><p className="mt-4 text-sm leading-6 text-slate-600">{draft.summary || 'O resumo do artigo aparecerá aqui.'}</p><div className="mt-7 whitespace-pre-wrap text-sm leading-7 text-slate-700">{draft.content || 'Escreva o conteúdo para visualizar a leitura do artigo.'}</div>{draft.gallery.length > 0 && <div className="mt-8 grid grid-cols-2 gap-3">{draft.gallery.map((image) => <img key={image} src={image} alt="Imagem complementar do artigo" className="aspect-[4/3] rounded-xl object-cover" />)}</div>}</div></article></div>}
  </div>
}
