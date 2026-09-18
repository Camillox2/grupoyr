import React from 'react'
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
  unreadCount = 2,
  pendingContractsCount = 1,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const menuItems = [
    { id: 'dashboard' as TabType, label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'kanban' as TabType, label: 'Funil Kanban', icon: KanbanSquare },
    { id: 'whatsapp' as TabType, label: 'WhatsApp & IA', icon: MessageSquare, badge: unreadCount },
    { id: 'equipments' as TabType, label: 'Equipamentos', icon: Bed },
    {
      id: 'contracts' as TabType,
      label: 'Contratos & Assinatura',
      icon: FileSignature,
      badge: pendingContractsCount,
      badgeColor: 'bg-amber-500 text-white',
    },
    { id: 'finance' as TabType, label: 'Financeiro & Cobrança', icon: DollarSign },
    { id: 'blog' as TabType, label: 'Blog YR Integrado', icon: BookOpen },
    { id: 'settings' as TabType, label: 'Configurações', icon: Settings },
  ]

  const handleSelectTab = (tab: TabType) => {
    onTabChange(tab)
    if (onCloseMobile) onCloseMobile()
  }

  const content = (
    <div className="flex flex-col justify-between h-full p-4">
      <div className="space-y-1">
        <div className="px-3 pt-2 pb-5 border-b border-blue-100 dark:border-slate-800 mb-3">
          <img
            src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
            alt="Grupo YR Hospitalar"
            className="w-16 h-16 object-contain rounded-lg bg-white border border-slate-100"
          />
          <p className="mt-3 text-xs font-semibold text-slate-800 dark:text-slate-100">Operação e locações</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Gestão comercial e atendimento</p>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Menu Principal
          </span>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-700 dark:text-slate-400 hover:bg-blue-100/70 dark:hover:bg-slate-800/60 hover:text-[#123b63] dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-white' : 'text-blue-500 group-hover:text-[#123b63] dark:group-hover:text-slate-200'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.badgeColor ||
                    (isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300')
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Quick Summary Card */}
      <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-slate-800/50 border border-blue-100 dark:border-slate-700/60 space-y-2 mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
            Região de Atendimento
          </span>
          <span className="w-2 h-2 rounded-full bg-teal-600" />
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          Curitiba & Região Metropolitana com pronta entrega e montagem ágil para altas hospitalares.
        </p>
        <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <span>Plantão Comercial:</span>
          <span className="text-[#123b63] dark:text-sky-300 font-bold">(41) 99724-4279</span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-blue-100 dark:border-slate-800 bg-[#eaf3fb] dark:bg-slate-900/50 backdrop-blur-md flex-col justify-between shrink-0">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[80vw] bg-[#eaf3fb] dark:bg-slate-900 shadow-2xl flex flex-col justify-between h-full z-10">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}
