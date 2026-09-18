import React from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'

export interface Column<T> {
  /** Cabecalho no desktop e rotulo do par label/valor no mobile. */
  header: string
  cell: (item: T) => React.ReactNode
  /** Coluna de identidade: vira o titulo do card no mobile. */
  primary?: boolean
  /** Acompanha a coluna primaria no titulo do card, como subtitulo. */
  secondary?: boolean
  align?: 'left' | 'right'
  /** Oculta no mobile quando a informacao ja aparece em outro lugar. */
  hideOnMobile?: boolean
  width?: string
}

interface ResponsiveTableProps<T> {
  items: T[]
  columns: Column<T>[]
  getKey: (item: T) => string
  actions?: (item: T) => React.ReactNode
  empty?: React.ReactNode
  /** Marca a linha/card com um pulso quando o registro muda por socket. */
  highlightKey?: string | null
  caption?: string
}

/**
 * Tabela no desktop, cards empilhados abaixo de 820px.
 *
 * Substitui o `overflow-x-auto`: rolar uma tabela na horizontal no celular
 * esconde as colunas da direita, que e justamente onde ficam valor e acoes.
 */
export function ResponsiveTable<T>({
  items,
  columns,
  getKey,
  actions,
  empty,
  highlightKey,
  caption,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile()

  if (items.length === 0 && empty) {
    return <>{empty}</>
  }

  if (isMobile) {
    const primary = columns.find((column) => column.primary)
    const secondary = columns.find((column) => column.secondary)
    const rest = columns.filter(
      (column) => !column.primary && !column.secondary && !column.hideOnMobile,
    )

    return (
      <ul className="space-y-2.5" aria-label={caption}>
        {items.map((item) => {
          const key = getKey(item)
          return (
            <li
              key={key}
              className={`rounded-[12px] p-3.5 ${highlightKey === key ? 'remote-pulse' : ''}`}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {(primary || secondary) && (
                <div className="mb-3 min-w-0">
                  {primary && (
                    <div className="text-[14px] font-extrabold" style={{ color: 'var(--ink)' }}>
                      {primary.cell(item)}
                    </div>
                  )}
                  {secondary && (
                    <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                      {secondary.cell(item)}
                    </div>
                  )}
                </div>
              )}

              <dl className="space-y-1.5">
                {rest.map((column) => (
                  <div key={column.header} className="flex items-baseline justify-between gap-3">
                    <dt
                      className="shrink-0 text-[11px] font-bold uppercase tracking-[0.04em]"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      {column.header}
                    </dt>
                    <dd
                      className="min-w-0 text-right text-[13px] font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {column.cell(item)}
                    </dd>
                  </div>
                ))}
              </dl>

              {actions && (
                <div
                  className="mt-3 flex flex-wrap gap-2 pt-3"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  {actions(item)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-[14px]"
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <table className="w-full text-left text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr
            style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-subtle)' }}
          >
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.05em] ${
                  column.align === 'right' ? 'text-right' : ''
                }`}
                style={{ color: 'var(--ink-faint)', width: column.width }}
              >
                {column.header}
              </th>
            ))}
            {actions && (
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-extrabold uppercase tracking-[0.05em]" style={{ color: 'var(--ink-faint)' }}>
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = getKey(item)
            return (
              <tr
                key={key}
                className={`transition-colors hover:bg-[var(--surface-sunken)] ${
                  highlightKey === key ? 'remote-pulse' : ''
                }`}
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`px-4 py-3 align-middle ${column.align === 'right' ? 'text-right' : ''}`}
                    style={{ color: 'var(--ink)' }}
                  >
                    {column.cell(item)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">{actions(item)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Estado vazio: diz o que fazer, nao apenas que nao ha nada. */
export const EmptyState: React.FC<{
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}> = ({ icon, title, description, action }) => (
  <div
    className="flex flex-col items-center rounded-[14px] px-6 py-12 text-center"
    style={{ background: 'var(--surface-raised)', border: '1px dashed var(--border-strong)' }}
  >
    <span
      className="mb-3 grid h-12 w-12 place-items-center rounded-full"
      style={{ background: 'var(--yr-050)', color: 'var(--yr-500)' }}
    >
      {icon}
    </span>
    <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--ink)' }}>
      {title}
    </h3>
    <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
      {description}
    </p>
    {action && <div className="mt-5">{action}</div>}
  </div>
)
