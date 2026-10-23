export interface ConversationMetric {
  enteredAt: string | null
  entrySource: 'created' | 'history' | 'unknown'
  sla: { goalMinutes: number; pendingSince: string | null; lastHumanReplyAt: string | null; lastResponseSeconds: number | null; closed: boolean }
}
const zone = 'America/Sao_Paulo'
const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const date = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(dateOnly(value) ? value + 'T12:00:00Z' : value)
  return Number.isFinite(parsed.getTime()) && (!dateOnly(value) || parsed.toISOString().slice(0, 10) === value) ? parsed : null
}
const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const chatDayKey = (value: string | null | undefined) => { const parsed = date(value); return parsed ? keyFormatter.format(parsed) : '' }
export const chatTime = (value: string) => { const parsed = date(value); return parsed && !dateOnly(value) ? timeFormatter.format(parsed) : '—' }
export const chatDateTime = (value: string | null | undefined) => { const parsed = date(value); return parsed ? dateOnly(value!) ? dateFormatter.format(parsed) : `${dateFormatter.format(parsed)} às ${timeFormatter.format(parsed)}` : 'Data não registrada' }
export function chatDayLabel(value: string, now: number) {
  const parsed = date(value)
  if (!parsed) return 'Data não registrada'
  const key = chatDayKey(value), today = chatDayKey(new Date(now).toISOString()), yesterday = chatDayKey(new Date(now - 86400000).toISOString())
  return `${key === today ? 'Hoje · ' : key === yesterday ? 'Ontem · ' : ''}${dateFormatter.format(parsed)}`
}
export function chatListTime(value: string, now: number) {
  const key = chatDayKey(value)
  return !key ? '—' : key === chatDayKey(new Date(now).toISOString()) ? chatTime(value) : key === chatDayKey(new Date(now - 86400000).toISOString()) ? 'Ontem' : dateFormatter.format(date(value)!)
}
export function leadMatchesDay(value: string | null | undefined, filter: 'all' | 'today' | 'yesterday', now: number) {
  if (filter === 'all') return true
  return chatDayKey(value) === chatDayKey(new Date(now - (filter === 'yesterday' ? 86400000 : 0)).toISOString())
}
const duration = (seconds: number) => seconds < 60 ? `${Math.max(0, Math.floor(seconds))} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`
export function conversationSlaLabel(metric: ConversationMetric | undefined, now: number) {
  if (!metric) return { text: 'SLA não carregado', tone: 'neutral', title: 'Aguardando os dados de atendimento.' }
  const { sla } = metric, title = `Meta: ${sla.goalMinutes} minutos corridos. Respostas da IA ou envios pendentes não encerram a espera pelo vendedor.`
  if (sla.closed) return { text: 'Encerrada', tone: 'neutral', title }
  if (sla.pendingSince) {
    const elapsed = Math.max(0, (now - Date.parse(sla.pendingSince)) / 1000)
    return { text: `${elapsed >= sla.goalMinutes * 60 ? 'SLA excedido' : 'Aguardando vendedor'} · ${duration(elapsed)}`, tone: elapsed >= sla.goalMinutes * 60 ? 'late' : elapsed >= sla.goalMinutes * 48 ? 'wait' : 'ok', title }
  }
  return { text: sla.lastResponseSeconds !== null ? `Respondido em ${duration(sla.lastResponseSeconds)}` : 'Sem mensagem pendente', tone: sla.lastResponseSeconds !== null && sla.lastResponseSeconds > sla.goalMinutes * 60 ? 'wait' : 'neutral', title }
}
