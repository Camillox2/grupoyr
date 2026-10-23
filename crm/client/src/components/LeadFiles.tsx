import React, { useEffect, useRef, useState } from 'react'
import { Download, Paperclip } from 'lucide-react'
import { authHeaders } from '../lib/conversation'

interface Attachment { id: string; fileName: string; size: number }
export function LeadFiles({ leadId }: { leadId: string }) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/leads/${encodeURIComponent(leadId)}/attachments`, { headers: authHeaders(false), signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Não foi possível carregar os anexos.')
      setFiles(await response.json())
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [leadId])
  async function upload(file?: File) {
    if (!file || busy) return
    if (file.size > 15 * 1024 * 1024) { setError('O arquivo deve ter até 15 MB.'); if (input.current) input.current.value = ''; return }
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/attachments`, { method: 'POST', headers: authHeaders(false), body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível anexar o arquivo.')
      setFiles(current => [result, ...current])
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function download(file: Attachment) {
    setError('')
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/attachments/${encodeURIComponent(file.id)}`, { headers: authHeaders(false) })
      if (!response.ok) throw new Error('Não foi possível baixar o anexo.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName.replace(/[\\/\r\n]/g, '_'); anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setError((failure as Error).message) }
  }
  return <div className="space-y-3">
    <p className="sheet-note">PDF, fotos, documentos e planilhas de até 15 MB. Estes anexos são internos e ficam na ficha do cliente; não são expostos no link de assinatura.</p>
    <input ref={input} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx" aria-label="Arquivo do cliente" onChange={event => void upload(event.target.files?.[0])} />
    <button type="button" className="sheet-link inline-flex min-h-11 items-center gap-2" disabled={busy} onClick={() => input.current?.click()}><Paperclip className="h-4 w-4" />{busy ? 'Anexando…' : 'Anexar arquivo'}</button>
    {error ? <p className="sheet-error" role="alert">{error}</p> : null}
    {!files.length ? <p className="sheet-note">Nenhum anexo cadastrado.</p> : <ul className="space-y-2">{files.map(file => <li key={file.id} className="flex min-w-0 items-center gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)' }}><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold">{file.fileName}</p><p className="sheet-note">{(file.size / 1024).toFixed(0)} KB</p></div><button type="button" aria-label={`Baixar ${file.fileName}`} className="shrink-0 p-2" onClick={() => void download(file)}><Download className="h-4 w-4" /></button></li>)}</ul>}
  </div>
}
