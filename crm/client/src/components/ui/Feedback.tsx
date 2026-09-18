import React, { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

/** Esqueleto no formato do conteudo real, em vez de spinner girando no vazio. */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
)

export const SkeletonRows: React.FC<{ rows?: number; className?: string }> = ({
  rows = 5,
  className = '',
}) => (
  <div className={`space-y-2 ${className}`} role="status" aria-label="Carregando">
    {Array.from({ length: rows }).map((_, index) => (
      <div
        key={index}
        className="flex items-center gap-3 rounded-[12px] p-3"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}
      >
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    ))}
  </div>
)

type SubmitState = 'idle' | 'loading' | 'done'

interface SubmitButtonProps {
  loading: boolean
  /** Vira check por um instante quando a acao conclui. */
  done?: boolean
  children: React.ReactNode
  type?: 'submit' | 'button'
  onClick?: () => void
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'ghost'
  /** Liga o botao a um <form> fora dele, quando ele vive no rodape do dialogo. */
  form?: string
}

/**
 * Botao de acao com morph "rotulo -> spinner -> check".
 *
 * A largura fica travada durante a transicao (grid empilhado), para o botao
 * nao empurrar o layout ao lado enquanto muda de estado.
 */
export const SubmitButton: React.FC<SubmitButtonProps> = ({
  loading,
  done = false,
  children,
  type = 'submit',
  onClick,
  disabled,
  className = '',
  variant = 'primary',
  form,
}) => {
  const state: SubmitState = loading ? 'loading' : done ? 'done' : 'idle'
  const primary = variant === 'primary'

  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`relative inline-grid place-items-center rounded-[10px] px-4 py-2.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${className}`}
      style={
        primary
          ? { background: 'var(--yr-700)', color: 'var(--ink-on-brand)', boxShadow: 'var(--shadow-sm)' }
          : {
              background: 'transparent',
              color: 'var(--ink-muted)',
              border: '1px solid var(--border-strong)',
            }
      }
    >
      {/* Todas as camadas ocupam a mesma celula do grid: largura estavel. */}
      <span
        className="col-start-1 row-start-1 flex items-center gap-2 transition-opacity"
        style={{ opacity: state === 'idle' ? 1 : 0 }}
      >
        {children}
      </span>
      <span
        className="col-start-1 row-start-1 transition-opacity"
        style={{ opacity: state === 'loading' ? 1 : 0 }}
        aria-hidden={state !== 'loading'}
      >
        <LoaderCircle className="spin h-4 w-4" />
      </span>
      <span
        className="col-start-1 row-start-1 transition-opacity"
        style={{ opacity: state === 'done' ? 1 : 0 }}
        aria-hidden={state !== 'done'}
      >
        <Check className="h-4 w-4" />
      </span>
    </button>
  )
}

/**
 * Contagem crescente do numero, apenas na PRIMEIRA montagem.
 *
 * Em re-render o valor troca direto: metrica que reanima a cada atualizacao
 * de socket vira ruido e atrapalha a leitura.
 */
export const CountUp: React.FC<{
  value: number
  format?: (value: number) => string
  className?: string
}> = ({ value, format = (v) => String(Math.round(v)), className = '' }) => {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const animated = useRef(false)

  useEffect(() => {
    if (animated.current || reduced) {
      setShown(value)
      return
    }
    animated.current = true

    const DURATION = 600
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION)
      // easeOutQuint: rapido no inicio, assentando no fim.
      const eased = 1 - Math.pow(1 - progress, 5)
      setShown(value * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])

  return (
    <span className={`tnum ${className}`} data-numeric>
      {format(shown)}
    </span>
  )
}

/** Valor de um registro: centavos SEMPRE, senao vira erro de relatorio. */
export const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

/** Total agregado (soma de coluna, KPI): centavos so poluem a leitura. */
export const brlCompact = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
