import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  KanbanSquare,
  MessageSquare,
  Bed,
  FileSignature,
  DollarSign,
  BookOpen,
  Settings,
  X,
  UsersRound,
} from 'lucide-react'
import { useIsMobile } from '../hooks/useMediaQuery'

export type TabType =
  | 'dashboard'
  | 'kanban'
  | 'whatsapp'
  | 'clients'
  | 'equipments'
  | 'contracts'
  | 'finance'
  | 'blog'
  | 'settings'

/** O que o menu mostra ao lado de cada item, vindo dos dados reais. */
export interface SidebarMetrics {
  funnel?: number
  conversations?: number
  equipmentsFree?: number
  contractsPending?: number
  overdueAmount?: number
}

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  metrics?: SidebarMetrics
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

type Tone = 'plain' | 'wait' | 'alert'

const compactBrl = (value: number) =>
  value >= 1000
    ? `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
    : `R$ ${Math.round(value).toLocaleString('pt-BR')}`

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  metrics = {},
  mobileOpen = false,
  onCloseMobile,
}) => {
  const isMobile = useIsMobile()

  // O menu ja conta onde esta o problema antes de voce clicar: a metrica mora
  // dentro do proprio item, em vez de um numero solto.
  const groups: {
    label: string
    items: { id: TabType; label: string; icon: typeof Bed; note?: string; tone?: Tone }[]
  }[] = [
    {
      label: 'Operação',
      items: [
        { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
        {
          id: 'kanban',
          label: 'Funil',
          icon: KanbanSquare,
          note: metrics.funnel ? `${metrics.funnel} ativos` : undefined,
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp e IA',
          icon: MessageSquare,
          note: metrics.conversations ? `${metrics.conversations}` : undefined,
        },
        { id: 'clients', label: 'Clientes', icon: UsersRound },
        {
          id: 'equipments',
          label: 'Equipamentos',
          icon: Bed,
          note: metrics.equipmentsFree !== undefined ? `${metrics.equipmentsFree} livres` : undefined,
        },
        {
          id: 'contracts',
          label: 'Contratos',
          icon: FileSignature,
          note: metrics.contractsPending ? `${metrics.contractsPending} a assinar` : undefined,
          tone: 'wait',
        },
        {
          id: 'finance',
          label: 'Financeiro',
          icon: DollarSign,
          note: metrics.overdueAmount ? `${compactBrl(metrics.overdueAmount)} atrasado` : undefined,
          tone: 'alert',
        },
      ],
    },
    {
      label: 'Conteúdo e ajustes',
      items: [
        { id: 'blog', label: 'Blog', icon: BookOpen },
        { id: 'settings', label: 'Configurações', icon: Settings },
      ],
    },
  ]

  // Indicador deslizante: uma pilula azul que VIAJA ate o item clicado, em vez
  // de o fundo simplesmente trocar de lugar. A posicao vem do proprio botao.
  const navRef = useRef<HTMLElement | null>(null)
  const [glider, setGlider] = useState<{ y: number; h: number; ready: boolean }>({ y: 0, h: 0, ready: false })

  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current
      const active = nav?.querySelector<HTMLElement>('[data-active="true"]')
      if (!nav || !active) return
      const navBox = nav.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      setGlider((current) => ({ y: box.top - navBox.top + nav.scrollTop, h: box.height, ready: current.ready }))
    }
    measure()
    // So liga a transicao depois da primeira medida, senao a pilula "cai" do
    // topo ate o item ao abrir a tela.
    const frame = requestAnimationFrame(() => setGlider((current) => ({ ...current, ready: true })))
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [activeTab, isMobile, mobileOpen])

  const handleSelectTab = (tab: TabType) => {
    onTabChange(tab)
    onCloseMobile?.()
  }

  // Escape fecha o drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onCloseMobile])

  const noteStyle = (tone: Tone | undefined, active: boolean): React.CSSProperties => {
    if (active) return { background: 'rgba(255,253,249,0.16)', color: '#fffdf9' }
    if (tone === 'alert') return { background: 'var(--alert-surface)', color: 'var(--alert)' }
    if (tone === 'wait') return { background: 'var(--wait-surface)', color: 'var(--wait)' }
    return { background: 'var(--surface-raised)', color: 'var(--ink-muted)' }
  }

  const content = (
    <div className="screen h-full p-3">
      {isMobile && onCloseMobile && (
        <div className="screen-bar flex items-center justify-between px-2 pb-2">
          <p className="serif text-[20px]" style={{ color: 'var(--ink)' }}>
            Menu
          </p>
          <button
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
            style={{ color: 'var(--ink-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <nav className="screen-scroll relative" aria-label="Navegação principal" ref={navRef}>
        <span
          className={`nav-glider ${glider.ready ? 'is-ready' : ''}`}
          style={{ transform: `translateY(${glider.y}px)`, height: glider.h }}
          aria-hidden="true"
        />
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p
              className="px-3 pb-2 pt-2 text-[10px] font-extrabold uppercase tracking-[0.13em]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => handleSelectTab(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className="nav-item flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13.5px] font-bold"
                      data-active={active}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.note && (
                        <span
                          className="tap-exempt tnum shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
                          style={noteStyle(item.tone, active)}
                        >
                          {item.note}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className="screen-bar mt-2 flex items-center gap-2 rounded-[12px] px-3 py-2.5 text-[11px] font-bold"
        style={{ background: 'var(--surface-raised)', color: 'var(--ink-muted)', border: '1px solid var(--border-subtle)' }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--ok)' }} />
        Operação ativa
        <span className="plus ml-auto text-[11px]" style={{ color: 'var(--yr-500)' }} aria-hidden="true" />
      </div>
    </div>
  )

  // Drawer no mobile: entra da esquerda, fecha por Escape, backdrop ou item.
  if (isMobile) {
    if (!mobileOpen) return null
    return (
      <div className="fixed inset-0 z-50 flex" role="presentation">
        <div
          className="backdrop-in absolute inset-0 bg-[#0a1c33]/60"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
        <aside
          className="drawer-in relative z-10 flex h-full w-[296px] max-w-[86vw] flex-col"
          style={{ background: 'var(--surface-sunken)', boxShadow: 'var(--shadow-lg)' }}
        >
          {content}
        </aside>
      </div>
    )
  }

  return (
    <aside
      className="flex w-[264px] shrink-0 flex-col"
      style={{ background: 'var(--surface-sunken)', borderRight: '1px solid var(--border-subtle)' }}
    >
      {content}
    </aside>
  )
}
