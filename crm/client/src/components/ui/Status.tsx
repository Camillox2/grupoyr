import React from 'react'
import {
  CircleCheck,
  CircleDot,
  Clock,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react'

export type Tone = 'ok' | 'wait' | 'alert' | 'busy' | 'neutral'

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  ok: { color: 'var(--ok)', background: 'var(--ok-surface)', borderColor: 'var(--ok-border)' },
  wait: { color: 'var(--wait)', background: 'var(--wait-surface)', borderColor: 'var(--wait-border)' },
  alert: { color: 'var(--alert)', background: 'var(--alert-surface)', borderColor: 'var(--alert-border)' },
  busy: { color: 'var(--busy)', background: 'var(--busy-surface)', borderColor: 'var(--busy-border)' },
  neutral: {
    color: 'var(--ink-muted)',
    background: 'var(--surface-sunken)',
    borderColor: 'var(--border-subtle)',
  },
}

/**
 * Vocabulario de status do CRM.
 *
 * O mesmo estado tem a mesma cor E o mesmo icone no Kanban, no inventario,
 * no financeiro e no dashboard. O icone nao e enfeite: cor sozinha nao
 * distingue nada para quem tem daltonismo (WCAG 1.4.1).
 */
export const EQUIPMENT_STATUS: Record<string, { label: string; tone: Tone; Icon: typeof CircleDot }> = {
  disponivel: { label: 'Disponível', tone: 'ok', Icon: CircleCheck },
  alugado: { label: 'Alugado', tone: 'busy', Icon: CircleDot },
  higienizacao: { label: 'Higienização', tone: 'wait', Icon: Sparkles },
  manutencao: { label: 'Manutenção', tone: 'alert', Icon: Wrench },
}

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone; Icon: typeof CircleDot }> = {
  paga: { label: 'Paga', tone: 'ok', Icon: CircleCheck },
  pendente: { label: 'Pendente', tone: 'wait', Icon: Clock },
  atrasada: { label: 'Atrasada', tone: 'alert', Icon: TriangleAlert },
}

export const CONTRACT_STATUS: Record<string, { label: string; tone: Tone; Icon: typeof CircleDot }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral', Icon: CircleDot },
  pendente_assinatura: { label: 'Aguardando assinatura', tone: 'wait', Icon: Clock },
  assinado: { label: 'Assinado', tone: 'ok', Icon: CircleCheck },
  cancelado: { label: 'Cancelado', tone: 'alert', Icon: TriangleAlert },
}

interface StatusBadgeProps {
  label: string
  tone: Tone
  Icon?: typeof CircleDot
  size?: 'sm' | 'md'
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone, Icon, size = 'sm' }) => (
  <span
    className={`tap-exempt inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
    }`}
    style={TONE_STYLE[tone]}
  >
    {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
    {label}
  </span>
)

/** Atalhos por dominio, para a tela nao precisar conhecer o mapa. */
export const EquipmentStatus: React.FC<{ status: string }> = ({ status }) => {
  const entry = EQUIPMENT_STATUS[status] ?? { label: status, tone: 'neutral' as Tone, Icon: CircleDot }
  return <StatusBadge label={entry.label} tone={entry.tone} Icon={entry.Icon} />
}

export const InvoiceStatus: React.FC<{ status: string }> = ({ status }) => {
  const entry = INVOICE_STATUS[status] ?? { label: status, tone: 'neutral' as Tone, Icon: CircleDot }
  return <StatusBadge label={entry.label} tone={entry.tone} Icon={entry.Icon} />
}

export const ContractStatus: React.FC<{ status: string }> = ({ status }) => {
  const entry = CONTRACT_STATUS[status] ?? { label: status, tone: 'neutral' as Tone, Icon: CircleDot }
  return <StatusBadge label={entry.label} tone={entry.tone} Icon={entry.Icon} />
}
