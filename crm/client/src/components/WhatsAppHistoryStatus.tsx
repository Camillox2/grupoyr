import { useEffect, useState } from 'react'
import { Check, Clock3, CircleAlert, RefreshCw, X } from 'lucide-react'
import { WhatsAppHistorySync } from '../types'
import { useSocket } from '../contexts/SocketContext'

const DISMISSED_SYNC_KEY = 'yr_crm_dismissed_history_sync_v1'
const loadDismissedRuns = (): string[] => {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(DISMISSED_SYNC_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string').slice(-100) : []
  } catch { return [] }
}

export function WhatsAppHistoryStatus({ job }: { job: WhatsAppHistorySync }) {
  const { connected, browserOnline, serverReachable, whatsappStatus, requestHistorySync } = useSocket()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
  const [dismissedRuns, setDismissedRuns] = useState(loadDismissedRuns)
  const runKey = job.runId || `${job.leadId}:${job.startedAt}`
  const visible = !dismissedRuns.includes(runKey)
  const active = ['requesting', 'waiting_phone', 'processing'].includes(job.phase)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active || !visible) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, visible, job.startedAt])
  const end = job.finishedAt || (job.phase === 'paused' ? job.updatedAt : null)
  const seconds = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(job.startedAt)) / 1000))
  const elapsed = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  const expired = active && !!job.deadlineAt && Date.parse(job.deadlineAt) <= now
  const disconnected = active && (!browserOnline || serverReachable === false || (!connected && serverReachable !== true))
  const spinning = !expired && !disconnected && (job.phase === 'requesting' || job.phase === 'processing')
  const title = disconnected ? 'Sem conexão com o CRM · aguardando reconexão'
    : expired || job.phase === 'timed_out' ? 'Tentativa encerrada por falta de resposta'
    : job.phase === 'paused' ? 'Sincronização pausada · retomará ao reconectar'
    : job.phase === 'requesting' ? (job.attempts > 1 ? `Retomando histórico · tentativa ${job.attempts}/3` : 'Solicitando histórico…')
    : job.phase === 'waiting_phone' ? 'Aguardando o telefone'
    : job.phase === 'processing' ? `Processando mensagens · ${job.processed}/${job.received}`
    : job.phase === 'completed' ? `Sincronização concluída · ${job.imported} ${job.imported === 1 ? 'nova mensagem' : 'novas mensagens'}`
    : job.phase === 'no_history' ? 'Sem histórico disponível para sincronizar'
    : 'Falha ao sincronizar'
  const Icon = spinning ? RefreshCw : job.phase === 'completed' ? Check : job.phase === 'error' ? CircleAlert : Clock3
  const remaining = job.deadlineAt ? Math.max(0, Math.ceil((Date.parse(job.deadlineAt) - now) / 1000)) : 0
  const remainingText = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
  const canRetry = browserOnline && serverReachable !== false && whatsappStatus.status === 'connected'
  const retry = async () => {
    setRetrying(true); setRetryError('')
    try { await requestHistorySync(job.leadId) }
    catch (error) { setRetryError(error instanceof Error ? error.message : 'Não foi possível tentar novamente.') }
    finally { setRetrying(false) }
  }
  const dismiss = () => {
    const next = [...dismissedRuns.filter(run => run !== runKey), runKey].slice(-100)
    setDismissedRuns(next)
    // Somente a preferência do aviso fica na aba, sem mensagens ou anexos.
    try { sessionStorage.setItem(DISMISSED_SYNC_KEY, JSON.stringify(next)) } catch {}
  }
  if (!visible) return null
  return <div className="chat-sync-status shrink-0 flex items-start gap-2 border-b px-3 py-2 text-[11px]" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold" role="status">{title}</p>
      <p className="text-[10px] opacity-80"><span aria-live="off">{elapsed} decorrido</span>{active ? ` · ${job.received} recebidas` : ''}</p>
      {active && !expired && !disconnected && <p className="text-[10px]">Limite sem resposta: <span aria-live="off">{remainingText}</span> · Pode sair desta tela.</p>}
      {job.phase === 'paused' && <p className="text-[10px]">Solicitação salva. As mensagens recebidas foram preservadas.</p>}
      {disconnected && <p className="text-[10px]">O estado será conferido automaticamente quando a conexão voltar.</p>}
      {(job.phase === 'error' || job.phase === 'timed_out') && <p className="text-[10px]">{job.error}</p>}
      {(expired || ['paused', 'timed_out', 'error'].includes(job.phase)) && <button type="button" onClick={retry} disabled={!canRetry || retrying} className="mt-1 min-h-8 rounded-lg border px-2 font-semibold disabled:opacity-50">{retrying ? 'Solicitando…' : 'Tentar sincronizar novamente'}</button>}
      {retryError && <p role="alert" className="text-[10px] text-rose-600">{retryError}</p>}
    </div>
    <button type="button" onClick={dismiss} aria-label="Fechar aviso de sincronização" title="Fechar aviso" className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
}
