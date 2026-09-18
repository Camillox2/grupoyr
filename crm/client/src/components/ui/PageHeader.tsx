import React from 'react'

interface PageHeaderProps {
  icon: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
}

/**
 * Cabecalho unico das telas.
 *
 * No mobile as acoes descem para uma linha propria e ocupam a largura toda,
 * em vez de espremer o titulo.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, description, actions }) => (
  <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
        style={{ background: 'var(--yr-050)', color: 'var(--yr-700)' }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2
          className="text-[19px] font-extrabold leading-tight tracking-[-0.02em]"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {description}
        </p>
      </div>
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
      className="mb-4 rounded-[12px] border px-3.5 py-3 text-[12px] font-semibold leading-relaxed"
      style={palette}
      role={tone === 'alert' ? 'alert' : undefined}
    >
      {children}
    </div>
  )
}

/** Botao de acao primaria do cabecalho. */
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
    className="inline-flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[12px] font-bold transition-colors disabled:opacity-50"
    style={
      variant === 'primary'
        ? { background: 'var(--yr-700)', color: 'var(--ink-on-brand)', boxShadow: 'var(--shadow-sm)' }
        : {
            background: 'var(--surface-raised)',
            color: 'var(--ink-muted)',
            border: '1px solid var(--border-strong)',
          }
    }
  >
    {children}
  </button>
)
