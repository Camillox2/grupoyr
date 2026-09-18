import React from 'react'

/** Traco azul desenhado a mao, o mesmo dos titulos do site. */
export const Mark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mark">
    {children}
    <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 9 C 60 2, 120 13, 180 6 S 270 4, 297 8" />
    </svg>
  </span>
)

interface PageHeaderProps {
  icon?: React.ReactNode
  /** Rotulo pequeno acima do titulo (caixa alta, azul). */
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

/**
 * Cabecalho unico das telas, na linguagem editorial do site: rotulo em caixa
 * alta, titulo em serifa com o traco azul desenhado, descricao curta.
 *
 * No mobile as acoes descem para uma linha propria e ocupam a largura toda,
 * em vez de espremer o titulo.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ icon, eyebrow, title, description, actions }) => (
  <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {(eyebrow || icon) && (
        <p
          className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: 'var(--yr-500)' }}
        >
          {icon && <span className="grid h-5 w-5 place-items-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          {eyebrow}
        </p>
      )}
      <h2 className="serif text-[clamp(28px,3.4vw,44px)] leading-[1.05]" style={{ color: 'var(--ink)' }}>
        <Mark>{title}</Mark>
      </h2>
      {description && (
        <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </header>
)

/** Aviso contextual da tela (informativo, atencao ou erro). */
export const Notice: React.FC<{
  tone: 'info' | 'wait' | 'alert' | 'ok'
  children: React.ReactNode
}> = ({ tone, children }) => {
  const palette = {
    info: { color: 'var(--yr-700)', background: 'var(--yr-050)', borderColor: 'var(--yr-100)' },
    ok: { color: 'var(--ok)', background: 'var(--ok-surface)', borderColor: 'var(--ok-border)' },
    wait: { color: 'var(--wait)', background: 'var(--wait-surface)', borderColor: 'var(--wait-border)' },
    alert: { color: 'var(--alert)', background: 'var(--alert-surface)', borderColor: 'var(--alert-border)' },
  }[tone]

  return (
    <div
      className="mb-4 rounded-[14px] border px-4 py-3 text-[12.5px] font-semibold leading-relaxed"
      style={palette}
      role={tone === 'alert' ? 'alert' : undefined}
    >
      {children}
    </div>
  )
}

/** Botao de acao do cabecalho: pilula, como os do site. */
export const ActionButton: React.FC<{
  onClick?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'ghost'
  disabled?: boolean
  title?: string
}> = ({ onClick, children, variant = 'primary', disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`action-btn action-btn--${variant} inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13px] font-extrabold disabled:opacity-50`}
  >
    {children}
  </button>
)
