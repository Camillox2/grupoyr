import React, { useMemo } from 'react'
import { AlertTriangle, BedDouble, CalendarClock, CheckCircle2, Wrench } from 'lucide-react'
import { CalendarEvent, Contract, Equipment, Lead } from '../types'
import { addLocalDays, buildEquipmentPeriods, formatLocalDate, isValidIsoDate, toLocalDateKey } from '../lib/operations'

interface Props {
  equipments: Equipment[]
  contracts: Contract[]
  events: CalendarEvent[]
  leads: Lead[]
  onOpenLead: (leadId: string) => void
}

const KIND_LABEL = {
  confirmed: 'Locação confirmada',
  reservation: 'Reserva pendente',
  maintenance: 'Manutenção',
  hygiene: 'Higienização',
} as const

const formatRange = (from: string, to: string) => from === to
  ? formatLocalDate(from, { day: 'numeric', month: 'short' })
  : `${formatLocalDate(from, { day: 'numeric', month: 'short' })} – ${formatLocalDate(to, { day: 'numeric', month: 'short' })}`

export const EquipmentAvailabilityView: React.FC<Props> = ({ equipments, contracts, events, leads, onOpenLead }) => {
  const periods = useMemo(() => buildEquipmentPeriods(contracts, equipments, events, leads), [contracts, equipments, events, leads])
  const today = new Date()
  const horizonStart = toLocalDateKey(today)
  const horizonEnd = toLocalDateKey(addLocalDays(today, 29))
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round((index / 4) * 100))

  if (!equipments.length) return (
    <section className="yr-equipment-schedule-shell yr-equipment-empty" aria-label="Disponibilidade de equipamentos">
      <div className="yr-vector-float" aria-hidden="true">
        <svg viewBox="0 0 150 106" className="yr-equipment-empty__art" fill="none">
          <path d="M20 77h110M30 71h89M42 67V41h68v26M50 42v25m52-25v25M38 40h77l-7-12H46z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M47 31h61" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" className="yr-agenda-art__route" />
          <circle cx="38" cy="80" r="4" fill="currentColor" /><circle cx="113" cy="80" r="4" fill="currentColor" />
        </svg>
      </div>
      <div><h3>Nenhum equipamento cadastrado</h3><p>Quando os equipamentos e os períodos confiáveis estiverem no CRM, a disponibilidade aparece aqui.</p></div>
    </section>
  )

  return (
    <section className="yr-equipment-schedule-shell" aria-label="Disponibilidade por equipamento">
      <header className="yr-equipment-schedule__intro">
        <div className="yr-equipment-schedule__intro-icon"><CalendarClock className="h-5 w-5" /></div>
        <div><h2>Disponibilidade por equipamento</h2><p>Períodos confirmados, reservas e indisponibilidades registradas.</p></div>
        <span className="yr-equipment-horizon">Próximos 30 dias</span>
      </header>
      <div className="yr-equipment-scale" aria-hidden="true"><span>{formatLocalDate(horizonStart, { day: 'numeric', month: 'short' })}</span>{ticks.slice(1, -1).map((tick) => <span key={tick}>{formatLocalDate(toLocalDateKey(addLocalDays(today, Math.round(29 * tick / 100))), { day: 'numeric', month: 'short' })}</span>)}<span>{formatLocalDate(horizonEnd, { day: 'numeric', month: 'short' })}</span></div>
      <div className="yr-equipment-list">
        {equipments.map((equipment) => {
          const equipmentPeriods = periods.filter((period) => period.equipmentId === equipment.id)
          const visible = equipmentPeriods.filter((period) => period.startDate && period.endDate && period.endDate >= horizonStart && period.startDate <= horizonEnd)
          const undated = equipmentPeriods.filter((period) => !period.startDate || !period.endDate)
          return (
            <article key={equipment.id} className="yr-equipment-card">
              <header className="yr-equipment-card__head">
                <span className="yr-equipment-card__icon"><BedDouble className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><h3 className="truncate">{equipment.name}</h3><p className="truncate">{equipment.serialNumber || equipment.category || 'Identificação não informada'}</p></div>
                <span className={`yr-equipment-status yr-equipment-status--${equipment.status}`}>{equipment.status === 'disponivel' ? 'Disponível' : equipment.status === 'alugado' ? 'Alugado' : equipment.status === 'higienizacao' ? 'Higienização' : 'Manutenção'}</span>
              </header>
              <div className="yr-equipment-lanes">
                {visible.length ? visible.map((period) => {
                  const from = Math.max(new Date(`${period.startDate}T00:00:00`).getTime(), new Date(`${horizonStart}T00:00:00`).getTime())
                  const to = Math.min(new Date(`${period.endDate}T00:00:00`).getTime(), new Date(`${horizonEnd}T00:00:00`).getTime())
                  const day = 86400000
                  const offset = Math.max(0, Math.round((from - new Date(`${horizonStart}T00:00:00`).getTime()) / day))
                  const span = Math.max(1, Math.round((to - from) / day) + 1)
                  const left = offset / 30 * 100
                  const width = Math.min(100 - left, span / 30 * 100)
                  return (
                    <div key={period.id} className="yr-equipment-lane">
                      <div className="yr-equipment-period-heading">
                        <span className={`yr-equipment-kind yr-equipment-kind--${period.kind}`}>{period.kind === 'maintenance' ? <Wrench className="h-3 w-3" /> : period.conflict ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{period.conflict ? 'Conflito' : KIND_LABEL[period.kind]}</span>
                        <span>{formatRange(period.startDate!, period.endDate!)}</span>
                      </div>
                      <div className="yr-equipment-track" aria-label={`${KIND_LABEL[period.kind]} de ${formatRange(period.startDate!, period.endDate!)}`}>
                        {ticks.map((tick) => <i key={tick} style={{ left: `${tick}%` }} aria-hidden="true" />)}
                        <span className={`yr-equipment-track__bar yr-equipment-track__bar--${period.kind} ${period.conflict ? 'is-conflict' : ''}`} style={{ left: `${left}%`, width: `${width}%` }} />
                      </div>
                      <div className="yr-equipment-period-meta">
                        <span>{period.clientName || 'Cliente não vinculado'}{period.contractNumber ? ` · ${period.contractNumber}` : ''}</span>
                        {period.leadId && <button type="button" onClick={() => onOpenLead(period.leadId!)}>Abrir cliente</button>}
                      </div>
                    </div>
                  )
                }) : <p className="yr-equipment-no-period">Nenhum período confiável registrado para os próximos 30 dias.</p>}
                {undated.map((period) => (
                  <div key={period.id} className="yr-equipment-undated"><AlertTriangle className="h-4 w-4" /><span>{period.title}. Não há período registrado.</span>{period.clientName && <strong>{period.clientName}</strong>}</div>
                ))}
                {!visible.length && !undated.length && equipment.status === 'alugado' && <p className="yr-equipment-no-period">Locado, mas sem período registrado.</p>}
              </div>
            </article>
          )
        })}
      </div>
      <footer className="yr-equipment-schedule__foot">As faixas usam somente datas cadastradas em contratos e manutenções. Uma reserva pendente não é uma locação confirmada.</footer>
    </section>
  )
}
