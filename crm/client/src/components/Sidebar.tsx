import React, { useEffect } from 'react'
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
} from 'lucide-react'
import { useIsMobile } from '../hooks/useMediaQuery'

export type TabType =
  | 'dashboard'
  | 'kanban'
  | 'whatsapp'
  | 'equipments'
  | 'contracts'
  | 'finance'
  | 'blog'
  | 'settings'

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  unreadCount?: number
  pendingContractsCount?: number
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  unreadCount = 0,
  pendingContractsCount = 0,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const isMobile = useIsMobile()

  const menuItems = [
    { id: 'dashboard' as TabType, label: 'Visão geral', icon: LayoutDashboard },
    { id: 'kanban' as TabType, label: 'Funil', icon: KanbanSquare },
    { id: 'whatsapp' as TabType, label: 'WhatsApp e IA', icon: MessageSquare, badge: unreadCount },
    { id: 'equipments' as TabType, label: 'Equipamentos', icon: Bed },
    {
      id: 'contracts' as TabType,
      label: 'Contratos',
      icon: FileSignature,
      badge: pendingContractsCount,
      urgent: true,
    },
    { id: 'finance' as TabType, label: 'Financeiro', icon: DollarSign },
    { id: 'blog' as TabType, label: 'Blog', icon: BookOpen },
    { id: 'settings' as TabType, label: 'Configurações', icon: Settings },
  ]

  const handleSelectTab = (tab: TabType) => {
    onTabChange(tab)
    onCloseMobile?.()
  }

  // Escape fecha o drawer e o fundo nao rola enquanto ele esta aberto.
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile?.()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen, onCloseMobile])

  const content = (
    <div className="screen p-3">
      {/* A marca vive na Navbar. Repeti-la aqui era a mesma logo duas vezes,
          uma embaixo da outra. */}
      <div
        className="screen-bar flex items-center gap-3 px-3 pb-3 pt-1"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <p
          className="text-[10px] font-extrabold uppercase tracking-[0.11em]"
          style={{ color: 'var(--ink-faint)' }}
        >
          Operação
        </p>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[8px]"
            style={{ color: 'var(--ink-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="screen-scroll mt-3" aria-label="Navegação principal">
        <ul className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = activeTab === item.id
            const badge = item.badge ?? 0

            return (
              <li key={item.id}>
                <button
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-bold transition-colors"
                  style={
                    active
                      ? { background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }
                      : { color: 'var(--ink-muted)' }
                  }
                  onMouseEnter={(event) => {
                    if (!active) event.currentTarget.style.background = 'var(--surface-sunken)'
                  }}
                  onMouseLeave={(event) => {
                    if (!active) event.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className="tap-exempt grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-extrabold tabular-nums"
                      style={
                        active
                          ? { background: 'rgba(255,255,255,0.22)', color: 'var(--ink-on-brand)' }
                          : item.urgent
                            ? { background: 'var(--wait-surface)', color: 'var(--wait)' }
                            : { background: 'var(--yr-100)', color: 'var(--yr-700)' }
                      }
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div
        className="screen-bar mt-3 flex items-center gap-2 px-3 pt-3 text-[11px] font-semibold"
        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--ink-faint)' }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ok)' }} />
        Operação ativa
      </div>
    </div>
  )

  // Drawer no mobile: entra da esquerda, fecha por Escape, backdrop ou item.
  if (isMobile) {
    if (!mobileOpen) return null
    return (
      <div className="fixed inset-0 z-50 flex" role="presentation">
        <div
          className="backdrop-in absolute inset-0 bg-[#06121e]/55 backdrop-blur-sm"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
        <aside
          className="drawer-in relative z-10 h-full w-[272px] max-w-[82vw]"
          style={{ background: 'var(--surface-raised)', boxShadow: 'var(--shadow-lg)' }}
        >
          {content}
        </aside>
      </div>
    )
  }

  return (
    <aside
      className="w-60 shrink-0"
      style={{
        background: 'var(--surface-raised)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {content}
    </aside>
  )
}
