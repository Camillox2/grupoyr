import React from 'react'
import { Sun, Moon, QrCode, Radio, LogOut, ShieldCheck, Menu } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { SiteLinkActions } from './SiteLinkActions'

interface NavbarProps {
  onOpenQr: () => void
  onToggleMobileMenu?: () => void
}

/**
 * Barra superior em azul-marinho: e o contraste forte da tela, o mesmo papel
 * que a faixa azul faz no site. O resto do app fica na base pastel.
 */
export const Navbar: React.FC<NavbarProps> = ({ onOpenQr, onToggleMobileMenu }) => {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const { whatsappStatus, switchWhatsAppProvider } = useSocket()
  const isMobile = useIsMobile()

  const isBaileys = whatsappStatus.provider === 'baileys'
  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'

  // O circulo do novo tema abre a partir do botao que foi clicado.
  const onToggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    toggleTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
  }

  const ghost: React.CSSProperties = {
    color: '#dce9f8',
    border: '1px solid rgba(220, 233, 248, 0.22)',
    background: 'rgba(255, 253, 249, 0.06)',
  }

  return (
    <header
      className="safe-top sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 px-3 sm:px-5"
      style={{ background: 'var(--navbar-bg)', color: '#fffdf9' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onToggleMobileMenu && isMobile && (
          <button
            onClick={onToggleMobileMenu}
            aria-label="Abrir menu de navegação"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]"
            style={ghost}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div
          className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[12px]"
          style={{ background: '#fffdf9' }}
        >
          <img
            src="/yr-hospitalar-logo.jpg"
            alt=""
            className="h-full w-full object-contain"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>

        {/* no celular estreito o nome cortava em "Grup..."; a logo ja identifica */}
        <div className="hidden min-w-0 min-[420px]:block">
          <p className="serif truncate text-[18px] leading-none sm:text-[20px]">Grupo YR</p>
          <p className="mt-1 hidden truncate text-[11px] font-semibold leading-none sm:block" style={{ color: '#9cc3f0' }}>
            Locação, vendas e atendimento
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* O seletor de provedor so cabe no desktop; no mobile fica em Configuracoes. */}
        {!isMobile && (
          /* Controle segmentado com "polegar" deslizante. As duas metades tem
             a MESMA largura (grid), entao nada contrai ao alternar. */
          <div
            className="provider-switch relative grid w-[196px] grid-cols-2 rounded-[12px] p-1 text-[11px] font-bold"
            style={{ background: 'rgba(255, 253, 249, 0.08)', border: '1px solid rgba(220, 233, 248, 0.18)' }}
            role="group"
            aria-label="Provedor de WhatsApp"
          >
            <span
              className="provider-thumb"
              style={{ transform: isBaileys ? 'translateX(0)' : 'translateX(100%)' }}
              aria-hidden="true"
            />
            {(
              [
                ['baileys', 'Baileys', Radio, 'Conexão por QR Code via Baileys, sem custo por mensagem'],
                ['meta', 'Meta API', ShieldCheck, 'Conexão oficial pela Meta Cloud API'],
              ] as const
            ).map(([id, label, Icon, title]) => {
              const active = (id === 'baileys') === isBaileys
              return (
                <button
                  key={id}
                  onClick={() => switchWhatsAppProvider(id)}
                  aria-pressed={active}
                  title={title}
                  className="tap-exempt relative z-10 flex items-center justify-center gap-1.5 rounded-[9px] px-2 py-1.5"
                  style={{ color: active ? '#102a4c' : '#b9d2f0', transition: 'color 320ms ease' }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={onOpenQr}
          disabled={false}
          className="flex items-center justify-center gap-2 rounded-[12px] px-3 py-2 text-[11.5px] font-extrabold transition-colors disabled:cursor-default sm:min-w-[178px]"
          style={
            isConnected
              ? { background: 'rgba(63, 191, 168, 0.16)', color: '#7fe0cf', border: '1px solid rgba(63, 191, 168, 0.4)' }
              : { background: '#fffdf9', color: '#102a4c', border: '1px solid #fffdf9' }
          }
          title={isConnected ? 'Abrir opções e desconectar o WhatsApp' : 'Conectar o WhatsApp por código ou QR Code'}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: isConnected ? '#3fbfa8' : '#e0a43c' }}
          />
          <span className="hidden sm:inline">
            {isConnected ? `Online (${isBaileys ? 'Baileys' : 'Meta'})` : 'Conectar WhatsApp'}
          </span>
          {!isConnected && <QrCode className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
          className="grid h-10 w-10 place-items-center rounded-[12px]"
          style={ghost}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <SiteLinkActions compact />

        {user && (
          <div className="flex items-center gap-2 pl-1">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold uppercase"
              style={{ background: '#1d5fae', color: '#fffdf9', border: '2px solid rgba(255,253,249,0.35)' }}
            >
              {user.name.slice(0, 2)}
            </div>
            <div className="hidden text-left lg:block">
              <p className="text-[12.5px] font-bold leading-none">{user.name}</p>
              <p className="mt-1 text-[10px] capitalize leading-none" style={{ color: '#9cc3f0' }}>
                {user.role}
              </p>
            </div>
            <button
              onClick={logout}
              aria-label="Encerrar sessão"
              title="Encerrar sessão"
              className="grid h-9 w-9 place-items-center rounded-[10px]"
              style={{ color: '#9cc3f0' }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
