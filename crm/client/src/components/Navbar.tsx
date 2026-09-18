import React from 'react'
import { Sun, Moon, QrCode, Radio, LogOut, ShieldCheck, Menu } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { useIsMobile } from '../hooks/useMediaQuery'

interface NavbarProps {
  onOpenQr: () => void
  onToggleMobileMenu?: () => void
}

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

  return (
    <header
      className="safe-top sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 px-3 sm:px-5"
      style={{
        background: 'color-mix(in srgb, var(--surface-raised) 88%, transparent)',
        borderBottom: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {onToggleMobileMenu && isMobile && (
          <button
            onClick={onToggleMobileMenu}
            aria-label="Abrir menu de navegação"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition-colors hover:bg-[var(--surface-sunken)]"
            style={{ color: 'var(--ink-muted)' }}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div
          className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px]"
          style={{ background: '#ffffff', border: '1px solid var(--border-subtle)' }}
        >
          <img
            src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
            alt=""
            className="h-full w-full object-contain"
          />
        </div>

        <div className="min-w-0">
          <h1
            className="truncate text-[14px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[15px]"
            style={{ color: 'var(--ink)' }}
          >
            Grupo YR Hospitalar
          </h1>
          <p
            className="hidden truncate text-[11px] leading-tight sm:block"
            style={{ color: 'var(--ink-muted)' }}
          >
            Locação, vendas e atendimento
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* O seletor de provedor so cabe no desktop; no mobile fica em Configuracoes. */}
        {!isMobile && (
          <div
            className="flex items-center rounded-[10px] p-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
            role="group"
            aria-label="Provedor de WhatsApp"
          >
            <button
              onClick={() => switchWhatsAppProvider('baileys')}
              aria-pressed={isBaileys}
              className="tap-exempt flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 transition-colors"
              style={
                isBaileys
                  ? { background: 'var(--surface-raised)', color: 'var(--ok)', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--ink-muted)' }
              }
              title="Conexão por QR Code via Baileys, sem custo por mensagem"
            >
              <Radio className="h-3.5 w-3.5" />
              Baileys
            </button>
            <button
              onClick={() => switchWhatsAppProvider('meta')}
              aria-pressed={!isBaileys}
              className="tap-exempt flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 transition-colors"
              style={
                !isBaileys
                  ? { background: 'var(--surface-raised)', color: 'var(--yr-700)', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--ink-muted)' }
              }
              title="Conexão oficial pela Meta Cloud API"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Meta API
            </button>
          </div>
        )}

        <button
          onClick={!isConnected ? onOpenQr : undefined}
          disabled={isConnected}
          className="flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-default"
          style={
            isConnected
              ? { color: 'var(--ok)', background: 'var(--ok-surface)', borderColor: 'var(--ok-border)' }
              : { color: 'var(--wait)', background: 'var(--wait-surface)', borderColor: 'var(--wait-border)' }
          }
          title={isConnected ? 'WhatsApp conectado' : 'Conectar o WhatsApp por código ou QR Code'}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: isConnected ? 'var(--ok)' : 'var(--wait)' }}
          />
          <span className="hidden sm:inline">
            {isConnected ? `Online (${isBaileys ? 'Baileys' : 'Meta'})` : 'Conectar WhatsApp'}
          </span>
          {!isConnected && <QrCode className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
          className="grid h-10 w-10 place-items-center rounded-[10px] border transition-colors hover:bg-[var(--surface-sunken)]"
          style={{ color: 'var(--ink-muted)', borderColor: 'var(--border-subtle)' }}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {user && (
          <div
            className="flex items-center gap-2 pl-2"
            style={{ borderLeft: '1px solid var(--border-subtle)' }}
          >
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold uppercase"
              style={{ background: 'var(--yr-100)', color: 'var(--yr-700)' }}
            >
              {user.name.slice(0, 2)}
            </div>
            <div className="hidden text-left lg:block">
              <p className="text-[12px] font-bold leading-none" style={{ color: 'var(--ink)' }}>
                {user.name}
              </p>
              <p className="mt-1 text-[10px] capitalize leading-none" style={{ color: 'var(--ink-faint)' }}>
                {user.role}
              </p>
            </div>
            <button
              onClick={logout}
              aria-label="Encerrar sessão"
              className="grid h-9 w-9 place-items-center rounded-[8px] transition-colors hover:bg-[var(--alert-surface)]"
              style={{ color: 'var(--ink-faint)' }}
              title="Encerrar sessão"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
