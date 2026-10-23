import React, { useEffect, useRef, useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'
import { Modal } from './ui/Modal'
import type { Contract } from '../types'

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`, 'Content-Type': 'application/json' })
async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, headers: headers(), cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar o serviço de e-mail.')
  return data
}
const fieldStyle = { background: 'var(--surface-sunken)', borderColor: 'var(--border-subtle)', color: 'var(--ink)' }
const fieldClass = 'mt-2 w-full min-w-0 rounded-xl border px-3 py-3 text-sm'
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50'
const primary = { background: 'var(--yr-700)', color: '#fff' }

interface EmailSettings {
  enabled: boolean
  user: string
  companyEmail: string
  fromName: string
  autoSendOnCreate: boolean
  signedCopies: boolean
  configured: boolean
  passwordConfigured: boolean
  verifiedAt?: string
}

export function ContractEmailSettings() {
  const [config, setConfig] = useState<EmailSettings | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request('/api/email/settings', { signal: controller.signal }).then(setConfig).catch(error => { if (!controller.signal.aborted) setLoadError(error.message) })
    return () => controller.abort()
  }, [])
  const change = (value: Partial<EmailSettings>) => setConfig(current => current ? { ...current, ...value } : current)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !config) return
    setBusy(true); setMessage('')
    try {
      const data = await request('/api/email/settings', { method: 'PUT', body: JSON.stringify({ ...config, password }) })
      setConfig(data); setPassword(''); setMessage('Configuração salva. Use “Verificar conexão” antes do primeiro envio.')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  async function verify() {
    if (busy) return
    setBusy(true); setMessage('Verificando conexão e autenticação…')
    try { const result = await request('/api/email/verify', { method: 'POST' }); setMessage(result.message) }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border p-4 sm:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border-subtle)', marginBlockStart: '1.5rem', marginBlockEnd: '1.5rem' }} aria-labelledby="email-settings-title">
    <div className="mb-4 flex items-center gap-3"><Mail className="h-5 w-5 shrink-0" style={{ color: 'var(--yr-700)' }} /><h2 id="email-settings-title" className="text-lg font-bold">E-mail dos contratos</h2></div>
    <p className="mb-5 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>Envie o link de assinatura e o PDF. Quando o cliente assina pelo link, o contrato volta para o CRM; se habilitado abaixo, uma cópia assinada também vai para o cliente e para a empresa.</p>
    {loadError ? <p role="alert" className="text-sm">{loadError}</p> : config ? <form onSubmit={save} className="space-y-5">
      <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Conta Spacemail<input className={fieldClass} style={fieldStyle} type="email" autoComplete="off" value={config.user} placeholder="rodrigo@grupoyrhospitalar.com.br" onChange={event => change({ user: event.target.value })} /></label>
        <label className="text-sm font-semibold">Senha SMTP<input className={fieldClass} style={fieldStyle} type="password" autoComplete="new-password" value={password} placeholder={config.passwordConfigured ? 'Senha salva; deixe vazio para manter' : 'Digite aqui, não envie no chat'} onChange={event => setPassword(event.target.value)} /></label>
        <label className="text-sm font-semibold">Nome do remetente<input className={fieldClass} style={fieldStyle} value={config.fromName} maxLength={160} onChange={event => change({ fromName: event.target.value })} /></label>
        <label className="text-sm font-semibold">E-mail da empresa para cópias<input className={fieldClass} style={fieldStyle} type="email" value={config.companyEmail} onChange={event => change({ companyEmail: event.target.value })} /></label>
      </fieldset>
      <fieldset disabled={busy} className="space-y-4 text-sm">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 shrink-0" checked={config.enabled} onChange={event => change({ enabled: event.target.checked })} /><span>Habilitar envio por e-mail</span></label>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 shrink-0" checked={config.autoSendOnCreate} onChange={event => change({ autoSendOnCreate: event.target.checked })} /><span>Enviar automaticamente ao criar um contrato pela tela do CRM<span className="mt-1 block text-xs" style={{ color: 'var(--ink-muted)' }}>Somente novos contratos com e-mail cadastrado. Não dispara contratos antigos.</span></span></label>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 shrink-0" checked={config.signedCopies} onChange={event => change({ signedCopies: event.target.checked })} /><span>Após a assinatura, enviar o PDF assinado ao cliente e à empresa<span className="mt-1 block text-xs" style={{ color: 'var(--ink-muted)' }}>Vale para assinatura na tela do CRM ou pelo link enviado por WhatsApp/e-mail. O cliente precisa ter e-mail cadastrado.</span></span></label>
      </fieldset>
      <p className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}><ShieldCheck className="h-4 w-4 shrink-0" />Spacemail: mail.spacemail.com, porta 465 com TLS. Senha criptografada no servidor local, sem retornar ao navegador. Envio aceito pelo SMTP não confirma entrega na caixa do destinatário.</p>
      <div className="flex flex-wrap gap-3"><button className={buttonClass} style={primary} disabled={busy} type="submit">{busy ? 'Aguarde…' : 'Salvar e-mail'}</button><button className={buttonClass} style={fieldStyle} disabled={busy || !config.configured} type="button" onClick={verify}>Verificar conexão</button></div>
      {message ? <p role="status" className="text-sm leading-relaxed">{message}</p> : null}
    </form> : <p role="status" className="text-sm">Carregando configuração de e-mail…</p>}
  </section>
}

interface EmailJob { id: string; to: string; status: 'queued' | 'sending' | 'accepted' | 'failed' | 'unknown'; purpose: string; createdAt: string; error?: string; documentSigned?: boolean }
const labels = { queued: 'Na fila de envio', sending: 'Enviando ao servidor de e-mail', accepted: 'Aceito pelo servidor de e-mail', failed: 'Falha no envio', unknown: 'Envio não confirmado' }

export function ContractEmailDialog({ contract, initialEmail, onClose }: { contract: Contract; initialEmail: string; onClose: () => void }) {
  const [to, setTo] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<EmailJob[]>([])
  const [loaded, setLoaded] = useState(false)
  const key = useRef(crypto.randomUUID())
  const sending = useRef(false)
  const uncertain = useRef(false)
  const [reconciled, setReconciled] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let fetching = false
    const refresh = async () => {
      if (fetching) return
      fetching = true
      try { const result = await request(`/api/contracts/${contract.id}/email-history`, { signal: controller.signal }); setHistory(result.history); setLoaded(true); setReconciled(true) }
      catch (failure) { if (!controller.signal.aborted) { setError((failure as Error).message); setReconciled(false) } }
      finally { fetching = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [contract.id])
  const hasPending = history.some(job => job.to.toLowerCase() === to.trim().toLowerCase() && ['queued', 'sending'].includes(job.status))
  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (sending.current || hasPending || !loaded) return
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await request(`/api/contracts/${contract.id}/send-email`, { method: 'POST', body: JSON.stringify({ to: to.trim(), idempotencyKey: key.current }) })
      setHistory(current => [result.job, ...current.filter(job => job.id !== result.job.id)])
      setNotice('Solicitação registrada. O envio continua mesmo se você fechar esta janela.')
      key.current = crypto.randomUUID(); uncertain.current = false
    } catch (failure) {
      setError((failure as Error).message)
      // Keep the same key for an uncertain network response; a retry cannot
      // submit the same request twice. The user must reconcile history first.
      uncertain.current = true; setReconciled(false)
    } finally { setBusy(false); sending.current = false }
  }
  return <Modal open onClose={onClose} title={contract.signedAt ? 'Enviar contrato assinado por e-mail' : 'Enviar contrato por e-mail'} subtitle={`${contract.number} · ${contract.clientName}`} icon={<Mail className="h-5 w-5" />} size="md">
    <div className="space-y-5">
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{contract.signedAt ? 'O cliente receberá o PDF assinado e um link para ver o documento final.' : 'O cliente recebe o PDF e o link para conferir e assinar. A assinatura volta automaticamente para o CRM, sem precisar devolver um anexo.'}</p>
      <form onSubmit={send} className="space-y-4">
        <label className="block text-sm font-semibold">E-mail do destinatário<input type="email" required className={fieldClass} style={fieldStyle} value={to} disabled={busy || uncertain.current} onChange={event => setTo(event.target.value)} /></label>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Confira o endereço: este e-mail contém um link pessoal de assinatura.</p>
        <button className={`${buttonClass} w-full sm:w-auto`} style={primary} disabled={busy || hasPending || !loaded || (!reconciled && uncertain.current)} type="submit"><Mail className="h-4 w-4" />{busy || hasPending ? 'Envio em andamento…' : 'Confirmar envio por e-mail'}</button>
      </form>
      {error ? <p role="alert" className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border-subtle)' }}>{error}</p> : null}
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      <section className="space-y-3" aria-labelledby="email-history-title"><h3 id="email-history-title" className="text-sm font-bold">Histórico de e-mail</h3>
        {!loaded ? <p className="text-sm">Carregando histórico…</p> : !history.length ? <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Nenhum envio registrado para este contrato.</p> : history.map(job => <div key={job.id} className="rounded-xl border p-3 text-sm" style={fieldStyle}><p className="font-semibold" role="status">{labels[job.status]}</p><p className="mt-1 break-all">{job.to}</p><p className="mt-1 text-xs">{new Date(job.createdAt).toLocaleString('pt-BR')} · {job.purpose === 'signed' || job.documentSigned ? 'Cópia assinada' : 'Link de assinatura e PDF'}</p>{job.error ? <p className="mt-2 text-xs">{job.error}</p> : null}</div>)}
      </section>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>“Aceito” confirma que o servidor recebeu a mensagem, não que o cliente abriu ou recebeu na caixa de entrada. A assinatura do contrato é confirmada separadamente no CRM.</p>
    </div>
  </Modal>
}
