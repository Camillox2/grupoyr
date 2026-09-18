import React from 'react'
import { Sun, Moon, QrCode, Bot, Radio, LogOut, ShieldCheck, Menu } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'

interface NavbarProps {
  onOpenQr: () => void
  onToggleMobileMenu?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenQr, onToggleMobileMenu }) => {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const { whatsappStatus, switchWhatsAppProvider } = useSocket()

  const isBaileys = whatsappStatus.provider === 'baileys'
  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'

  return (
    <header className="h-16 border-b border-blue-100 dark:border-slate-800 bg-[#f8fbff]/95 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand logo & title */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            title="Abrir Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
          <img
            src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
            alt="Grupo YR Hospitalar"
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
            Grupo YR Hospitalar
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Locação, Vendas e Atendimento WhatsApp com IA
          </p>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* WhatsApp Provider Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium">
          <button
            onClick={() => switchWhatsAppProvider('baileys')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
              isBaileys
              ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Conexão Web QR Code via Baileys (Sem custos por mensagem)"
          >
            <Radio className="w-3.5 h-3.5" />
            Baileys
          </button>
          <button
            onClick={() => switchWhatsAppProvider('meta')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
              !isBaileys
                ? 'bg-white dark:bg-slate-900 text-[#123b63] dark:text-sky-300 shadow-sm font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Conexão oficial Meta Business API"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Meta API
          </button>
        </div>

        {/* WhatsApp Status Indicator */}
        <button
          onClick={!isConnected ? onOpenQr : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            isConnected
              ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800 cursor-default'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-amber-100 shadow-sm'
          }`}
          title={isConnected ? 'WhatsApp Online' : 'Clique para conectar via Código 8 Dígitos ou QR Code'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-teal-600' : 'bg-amber-500'
            }`}
          />
          <span>
            {isConnected
              ? `Online (${isBaileys ? 'Baileys' : 'Meta'})`
              : 'Conectar WhatsApp'}
          </span>
          {!isConnected && <QrCode className="w-3.5 h-3.5 ml-1 text-amber-600" />}
        </button>

        {/* IA Status */}
        <div
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium"
          title="Pipeline Multimodal Ativo: 3.8 -> 3.7 -> 3.6 -> 3.5 -> 3.5-Lite -> 3.1-Lite"
        >
          <Bot className="w-3.5 h-3.5 text-[#123b63] dark:text-sky-300" />
          <span>Assistente IA</span>
        </div>

        {/* Dark / Light Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all"
          title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User profile and logout */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold text-xs uppercase">
              {user.name.slice(0, 2)}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                {user.name}
              </p>
              <p className="text-[10px] text-slate-500 capitalize">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
              title="Encerrar Sessão"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
