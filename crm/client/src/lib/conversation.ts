import type { Lead } from '../types'

const WINDOW_MS = 24 * 60 * 60 * 1000

export const authHeaders = (json = true): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
})

export interface WindowInfo {
  open: boolean
  /** Falta menos de 2h: hora de avisar a equipe. */
  closingSoon: boolean
  /** "5 h 12 min", "38 min". Vazio quando fechada. */
  remaining: string
  /** true quando o cliente nunca escreveu: a conversa so comeca por template. */
  neverOpened: boolean
}

/**
 * Janela de atendimento da Meta: 24h a partir da ULTIMA mensagem do cliente.
 * O servidor aplica a mesma regra (metaTemplates.js) e e ele quem decide; aqui
 * e so para a tela mostrar o estado certo sem esperar o erro.
 */
export function windowInfo(lead: Pick<Lead, 'lastInboundAt'> | null | undefined, now: number): WindowInfo {
  const last = lead?.lastInboundAt ? Date.parse(lead.lastInboundAt) : NaN
  if (!Number.isFinite(last)) return { open: false, closingSoon: false, remaining: '', neverOpened: true }

  const left = last + WINDOW_MS - now
  if (left <= 0) return { open: false, closingSoon: false, remaining: '', neverOpened: false }

  const minutes = Math.max(1, Math.round(left / 60000))
  const hours = Math.floor(minutes / 60)
  const remaining = hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`
  return { open: true, closingSoon: left < 2 * 60 * 60 * 1000, remaining, neverOpened: false }
}

export const isClosed = (lead: Pick<Lead, 'conversationStatus'>) => lead.conversationStatus === 'closed'

/** (41) 99999-0000 enquanto digita. So formata: quem valida e o servidor. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13)
  // Com DDI (55...) ou numero estrangeiro: mostra cru, agrupado de leve.
  if (digits.length > 11) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, digits.length - 4)}-${digits.slice(-4)}`
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}
