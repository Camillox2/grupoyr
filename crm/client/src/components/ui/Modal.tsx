import React, { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: React.ReactNode
  /** Rodape fixo fora da area de scroll (botoes de acao). */
  footer?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
}

/**
 * Dialogo unico do CRM.
 *
 * Desktop: cartao centralizado com fade + scale.
 * Mobile (<=820px): bottom sheet subindo do fundo, ocupando ate 92% da altura.
 *
 * Em ambos os casos ha UMA area de scroll (o corpo), com cabecalho e rodape
 * fixos fora dela. Escape fecha, o foco fica contido e o fundo nao rola.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  footer,
  children,
  size = 'md',
}) => {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Escape fecha e o foco nao escapa para o conteudo atras do dialogo.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  // Trava o scroll do fundo enquanto o dialogo esta aberto.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Foco inicial no painel, para leitor de tela anunciar o dialogo.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        isMobile ? 'items-end' : 'items-center justify-center p-4'
      }`}
      role="presentation"
    >
      <div
        className="backdrop-in absolute inset-0 bg-[#06121e]/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex w-full flex-col outline-none ${
          isMobile
            ? 'sheet-in max-h-[92dvh] rounded-t-[22px]'
            : `dialog-in ${WIDTH[size]} max-h-[88dvh] rounded-[16px]`
        }`}
        style={{
          background: 'var(--surface-overlay)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Alca visual do bottom sheet. */}
        {isMobile && (
          <div className="flex shrink-0 justify-center pt-2.5" aria-hidden="true">
            <span
              className="h-1 w-9 rounded-full"
              style={{ background: 'var(--border-strong)' }}
            />
          </div>
        )}

        <header
          className="flex shrink-0 items-start gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          {icon && (
            <span
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
              style={{ background: 'var(--yr-050)', color: 'var(--yr-700)' }}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="truncate text-[15px] font-extrabold tracking-[-0.01em]"
              style={{ color: 'var(--ink)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--ink-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="tap-exempt -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-[8px] transition-colors hover:bg-[var(--surface-sunken)]"
            style={{ color: 'var(--ink-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Unica area de scroll do dialogo. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <footer
            className={`shrink-0 px-5 py-4 ${isMobile ? 'safe-bottom' : ''}`}
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
