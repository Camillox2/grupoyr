import React, { useEffect, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Mail, Send } from 'lucide-react'
import type { Contract } from '../types'
import { authHeaders } from '../lib/conversation'
import { ContractEmailDialog } from './ContractEmailPanel'

export function ContractQuickShare({ contract, email }: { contract: Contract; email: string }) {
  const [origin, setOrigin] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/runtime/public-url', { headers: authHeaders(false), signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Não foi possível obter o endereço público.')
      const data = await response.json(); if (!data.url) throw new Error('Inicie o túnel para compartilhar o contrato.'); setOrigin(data.url.replace(/\/$/, ''))
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [])
  const url = origin && contract.signingToken ? `${origin}/assinar/${encodeURIComponent(contract.signingToken)}` : ''
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado. Pode colar na conversa ou no e-mail do cliente.') }
    catch { setMessage('Selecione o link abaixo e copie manualmente.'); const input = document.getElementById(`contract-link-${contract.id}`) as HTMLInputElement | null; input?.focus(); input?.select() }
  }
  async function send() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/contracts/${encodeURIComponent(contract.id)}/send-link`, { method: 'POST', headers: authHeaders() })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o link.')
      setMessage(result.delivered ? 'Link enviado pelo WhatsApp.' : 'Envio registrado, mas ainda não confirmado. Confira o atendimento antes de reenviar.')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50'
  return <div className="space-y-3 rounded-2xl border p-4" style={{ background: 'var(--yr-050)', borderColor: 'var(--yr-100)' }} role="region" aria-label="Contrato gerado e envio ao cliente">
    <h4 className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4" />Contrato {contract.number} gerado</h4>
    <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>O cliente abre o link, confere e assina. A assinatura volta para Contratos no CRM, sem devolver um arquivo.</p>
    <label className="sheet-field"><span>Link pessoal de assinatura</span><input id={`contract-link-${contract.id}`} className="field-control sheet-input w-full" value={url} readOnly onFocus={event => event.target.select()} /></label>
    <div className="grid gap-2 sm:grid-cols-2"><button type="button" className={button} disabled={!url} onClick={() => void copy()}><Copy className="h-4 w-4" />Copiar link</button><button type="button" className={button} disabled={!url || busy} onClick={() => void send()}><Send className="h-4 w-4" />{busy ? 'Enviando…' : 'Enviar no WhatsApp'}</button><button type="button" className={button} onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4" />Enviar por e-mail</button>{url ? <a className={button} href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Ver contrato</a> : <button className={button} type="button" disabled><ExternalLink className="h-4 w-4" />Ver contrato</button>}</div>
    {message ? <p role="status" className="break-words text-xs leading-relaxed">{message}</p> : null}
    {emailOpen ? <ContractEmailDialog contract={contract} initialEmail={email} onClose={() => setEmailOpen(false)} /> : null}
  </div>
}
