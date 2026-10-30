import React, { useEffect, useState } from 'react'

const DAY = 86400000
const parse = (v?: string) => {
  if (!v) return null
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? null : d
}
const full = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Barra de vigência: enche conforme os dias passam (calculada pela data atual). */
export const VigenciaBar: React.FC<{ start?: string; end?: string; fallback: React.ReactNode }> = ({ start, end, fallback }) => {
  const s = parse(start), e = parse(end)
  const [shown, setShown] = useState(0)
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 60 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [])
  const valid = s && e && e.getTime() >= s.getTime()
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const total = valid ? Math.max(1, Math.round((e!.getTime() - s!.getTime()) / DAY)) : 1
  const elapsed = valid ? Math.round((midnight - s!.getTime()) / DAY) : 0
  const pct = valid ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0
  const remaining = valid ? Math.round((e!.getTime() - midnight) / DAY) : 0
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShown(pct))
    return () => window.cancelAnimationFrame(id)
  }, [pct])
  if (!valid) return <>{fallback}</>
  const color = remaining < 0 || pct >= 100 ? 'var(--danger, #dc2626)' : remaining <= 30 ? '#eab308' : 'var(--yr-600, #2563eb)'
  const remainingText = remaining < 0 ? `vencido há ${-remaining} dia(s)` : remaining === 0 ? 'vence hoje' : `faltam ${remaining} dia(s)`
  const tip = `de ${full(s!)} até ${full(e!)} · ${remainingText}`
  return (
    <span
      className="relative inline-flex min-w-[140px] cursor-pointer items-center gap-2 outline-none"
      tabIndex={0}
      role="button"
      aria-label={`Vigência ${pct}%: ${tip}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(ev) => { ev.stopPropagation(); setOpen(true) }}
    >
      <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken, #e5e7eb)', border: '1px solid var(--border-subtle, #e5e7eb)' }}>
        <span className="block h-full rounded-full" style={{ width: `${shown}%`, background: color, transition: 'width 900ms cubic-bezier(.2,.8,.2,1)' }} />
      </span>
      <span className="tnum w-9 text-right text-[11px] font-bold" style={{ color }}>{pct}%</span>
      {open && (
        <span role="tooltip" className="absolute bottom-full right-0 z-30 mb-2 whitespace-nowrap rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold shadow-lg" style={{ background: 'var(--ink, #111827)', color: 'var(--surface, #fff)' }}>
          {tip}
        </span>
      )}
    </span>
  )
}
