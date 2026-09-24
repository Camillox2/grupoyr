import React, { useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, MapPin, Phone, Plus, RotateCcw, Search, Truck, UserRound, Wrench } from 'lucide-react'
import { CalendarEvent, CalendarEventType, Contract, Equipment, Invoice, Lead, User } from '../types'
import { addLocalDays, buildAgendaItems, formatLocalDate, parseLocalDate, startOfLocalWeek, toLocalDateKey, AgendaItem } from '../lib/operations'
import { ActionButton, PageHeader } from './ui/PageHeader'
import { Modal } from './ui/Modal'
import { Toast, useToast } from './ui/Toast'
import { CalendarEventDialog } from './CalendarEventDialog'
import { EquipmentAvailabilityView } from './EquipmentAvailabilityView'

type CalendarMode = 'month' | 'week' | 'list'
type EventFilter = 'all' | 'entrega' | 'retirada' | 'visita' | 'cobranca' | 'other'

interface CalendarViewProps {
  customEvents: CalendarEvent[]
  contracts: Contract[]
  leads: Lead[]
  equipments: Equipment[]
  invoices: Invoice[]
  team: User[]
  currentUserId: string
  onRefresh: () => void
  onOpenLead: (leadId: string) => void
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const TYPE_LABEL: Record<CalendarEventType, string> = {
  compromisso: 'Compromisso', entrega: 'Entrega', retirada: 'Retirada',
  visita: 'Visita', ligacao: 'Ligação', cobranca: 'Cobrança', manutencao: 'Manutenção',
}
const TYPE_CLASS: Record<CalendarEventType, string> = {
  compromisso: 'neutral', entrega: 'blue', retirada: 'green', visita: 'blue',
  ligacao: 'neutral', cobranca: 'amber', manutencao: 'amber',
}
const EVENT_ICON: Record<CalendarEventType, React.ComponentType<{ className?: string }>> = {
  compromisso: CalendarDays, entrega: Truck, retirada: RotateCcw, visita: MapPin,
  ligacao: Phone, cobranca: FileText, manutencao: Wrench,
}
const FILTERS: { id: EventFilter; label: string }[] = [
  { id: 'all', label: 'Tudo' }, { id: 'entrega', label: 'Entregas' },
  { id: 'retirada', label: 'Retiradas' }, { id: 'visita', label: 'Visitas' },
  { id: 'cobranca', label: 'Cobranças' }, { id: 'other', label: 'Outros' },
]
const safeDate = (value: string) => parseLocalDate(value) || new Date()

const AgendaAnimatedMark = () => (
  <svg className="yr-calendar-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 3.5v3M16 3.5v3M4 9.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path className="yr-calendar-mark__route" d="M6.5 16h3.4l2.3-3.2h5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="17.5" cy="12.8" r="1.1" fill="currentColor" />
  </svg>
)

const AgendaVectorArt = () => (
  <div className="yr-vector-float" aria-hidden="true">
    <svg className="yr-agenda-art" viewBox="0 0 210 148" fill="none">
      <path d="M43 26.5h117a9 9 0 0 1 9 9v82a9 9 0 0 1-9 9H43a9 9 0 0 1-9-9v-82a9 9 0 0 1 9-9Z" fill="#fffdf9" stroke="#c9d8e9" strokeWidth="2" />
      <path d="M34 48h135" stroke="#1d5fae" strokeWidth="2" />
      <path d="M61 18v17M142 18v17" stroke="#102a4c" strokeWidth="5" strokeLinecap="round" />
      <path d="M53 68h22v17H53zM91 68h22v17H91zM129 68h22v17h-22zM53 96h22v17H53zM91 96h22v17H91z" fill="#eef4fc" stroke="#c9d8e9" strokeWidth="1.5" />
      <path d="M134 103c14 0 21 9 30 9 8 0 13-4 21-12" stroke="#1d5fae" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 5" className="yr-agenda-art__route" />
      <circle cx="185" cy="99" r="5" fill="#1d5fae" />
      <circle cx="53" cy="59" r="2" fill="#8fb8e8" /><circle cx="63" cy="59" r="2" fill="#8fb8e8" /><circle cx="73" cy="59" r="2" fill="#8fb8e8" />
    </svg>
  </div>
)

export const CalendarView: React.FC<CalendarViewProps> = ({ customEvents, contracts, leads, equipments, invoices, team, currentUserId, onRefresh, onOpenLead }) => {
  const { toast, show: showToast, dismiss: dismissToast } = useToast()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()))
  const [filter, setFilter] = useState<EventFilter>('all')
  const [responsibleFilter, setResponsibleFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [panel, setPanel] = useState<'calendar' | 'equipment'>('calendar')
  const [showEventDialog, setShowEventDialog] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<AgendaItem | null>(null)
  const monthDateRefs = useRef(new Map<string, HTMLButtonElement>())

  const agendaItems = useMemo(() => buildAgendaItems(customEvents, contracts, leads, invoices).filter((item) => {
    if (filter !== 'all' && filter === 'other' && ['entrega', 'retirada', 'visita', 'cobranca'].includes(item.type)) return false
    if (filter !== 'all' && filter !== 'other' && item.type !== filter) return false
    if (responsibleFilter !== 'all' && item.assignedTo !== responsibleFilter) return false
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR')
    if (query) {
      const lead = leads.find((candidate) => candidate.id === item.leadId)
      const contract = contracts.find((candidate) => candidate.id === item.contractId)
      const responsible = team.find((candidate) => candidate.id === item.assignedTo)
      const haystack = [item.title, item.notes, lead?.name, contract?.number, contract?.clientName, responsible?.name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
      if (!haystack.includes(query)) return false
    }
    return true
  }), [customEvents, contracts, leads, invoices, filter, responsibleFilter, searchTerm, team])

  const todayKey = toLocalDateKey(new Date())
  const selectedItems = agendaItems.filter((item) => item.date === selectedDate)
  const upcomingItems = agendaItems.filter((item) => item.date >= todayKey && item.status !== 'done' && item.status !== 'cancelled').slice(0, 7)
  const responsibleName = (id: string | null) => team.find((member) => member.id === id)?.name || ''
  const monthGrid = useMemo(() => {
    const start = startOfLocalWeek(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))
    return Array.from({ length: 42 }, (_, index) => addLocalDays(start, index))
  }, [anchorDate])
  const weekDays = useMemo(() => {
    const start = startOfLocalWeek(mode === 'week' ? anchorDate : safeDate(selectedDate))
    return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index))
  }, [anchorDate, mode, selectedDate])
  const rangeLabel = mode === 'month'
    ? anchorDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : mode === 'week'
      ? `${formatLocalDate(toLocalDateKey(weekDays[0]), { day: 'numeric', month: 'short' })} – ${formatLocalDate(toLocalDateKey(weekDays[6]), { day: 'numeric', month: 'short', year: 'numeric' })}`
      : anchorDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const visibleDays = mode === 'month' ? monthGrid : weekDays
  const visibleStart = toLocalDateKey(visibleDays[0])
  const visibleEnd = toLocalDateKey(visibleDays[visibleDays.length - 1])
  const rangeItems = agendaItems.filter((item) => item.date >= visibleStart && item.date <= visibleEnd)
  const listGroups = rangeItems.reduce<Record<string, AgendaItem[]>>((groups, item) => {
    groups[item.date] = [...(groups[item.date] || []), item]
    return groups
  }, {})

  const movePeriod = (direction: number) => setAnchorDate((current) => {
    const next = new Date(current)
    if (mode === 'week') next.setDate(next.getDate() + direction * 7)
    else next.setMonth(next.getMonth() + direction)
    return next
  })
  const goToToday = () => {
    const now = new Date()
    setAnchorDate(now)
    setSelectedDate(toLocalDateKey(now))
  }
  const openNewEvent = (date = selectedDate) => {
    setEditingEvent(null)
    setSelectedDate(date)
    setAnchorDate(safeDate(date))
    setShowEventDialog(true)
  }
  const openEvent = (item: AgendaItem) => {
    if (item.source === 'manual') {
      setEditingEvent(customEvents.find((event) => event.id === item.id) || null)
      setShowEventDialog(true)
    } else setDetailEvent(item)
  }
  const handleSaved = (message: string) => {
    showToast({ tone: 'ok', message })
    onRefresh()
  }
  const handleMarkDone = async () => {
    const item = detailEvent
    const event = item && customEvents.find((candidate) => candidate.id === item.id)
    if (!event) return
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
        body: JSON.stringify({ ...event, status: 'done' }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Não foi possível concluir este compromisso.')
      setDetailEvent(null)
      handleSaved('Compromisso marcado como concluído.')
    } catch (error) {
      showToast({ tone: 'alert', message: error instanceof Error ? error.message : 'Não foi possível concluir este compromisso.' })
    }
  }

  const itemsForDay = (date: Date) => agendaItems.filter((item) => item.date === toLocalDateKey(date))
  const eventButton = (item: AgendaItem, compact = false) => {
    const Icon = EVENT_ICON[item.type]
    return (
      <button key={item.id} type="button" onClick={() => openEvent(item)} title={`${TYPE_LABEL[item.type]} · ${item.title}`} className={`yr-calendar-event yr-calendar-event--${TYPE_CLASS[item.type]} ${compact ? 'is-compact' : ''} ${item.status === 'done' ? 'is-done' : ''} ${item.status === 'cancelled' ? 'is-cancelled' : ''}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {!compact && item.startTime && <span className="yr-calendar-event__time">{item.startTime}</span>}
        <span className="min-w-0 truncate">{item.title}</span>
      </button>
    )
  }
  const renderDayEvents = (dateKey: string, limit = 3) => {
    const dayItems = agendaItems.filter((item) => item.date === dateKey)
    return <div className="yr-calendar-day-events">{dayItems.slice(0, limit).map((item) => eventButton(item, true))}{dayItems.length > limit && <button type="button" className="yr-calendar-more" onClick={() => setSelectedDate(dateKey)}>+{dayItems.length - limit} mais</button>}</div>
  }

  const renderAgendaList = (items: AgendaItem[]) => items.length ? (
    <div className="yr-agenda-list">
      {items.map((item) => {
        const Icon = EVENT_ICON[item.type]
        return (
          <button type="button" key={item.id} className={`yr-agenda-list__row ${item.status === 'done' || item.status === 'cancelled' ? 'is-muted' : ''}`} onClick={() => openEvent(item)}>
            <span className={`yr-agenda-list__icon yr-agenda-list__icon--${TYPE_CLASS[item.type]}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[12.5px] font-extrabold" style={{ color: 'var(--ink)' }}>{item.title}</span><span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>{TYPE_LABEL[item.type]}{item.leadId ? ` · ${leads.find((lead) => lead.id === item.leadId)?.name || ''}` : ''}{responsibleName(item.assignedTo) ? ` · ${responsibleName(item.assignedTo)}` : ''}{item.notes ? ` · ${item.notes}` : ''}</span></span>
            <span className="ml-2 shrink-0 text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>{item.startTime || '—'}{item.endTime && <span className="block font-medium">até {item.endTime}</span>}</span>
            {item.status === 'overdue' && <span className="yr-agenda-status yr-agenda-status--overdue">Vencida</span>}
          </button>
        )
      })}
    </div>
  ) : (
    <div className="yr-agenda-empty"><AgendaVectorArt /><p className="text-[13px] font-extrabold" style={{ color: 'var(--ink)' }}>Nada marcado para este dia</p><p className="mt-1 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>Adicione um compromisso ou confira outra data.</p><button type="button" className="yr-agenda-empty__action" onClick={() => openNewEvent(selectedDate)}><Plus className="h-4 w-4" /> Novo compromisso</button></div>
  )

  return (
    <div className="yr-calendar-page space-y-5 pb-14">
      <PageHeader
        icon={<AgendaAnimatedMark />}
        eyebrow="Operação"
        title="Agenda"
        description="Entregas, retiradas, visitas, retornos e cobranças em um só lugar."
        actions={<ActionButton onClick={() => openNewEvent()}><Plus className="h-4 w-4" /> Novo compromisso</ActionButton>}
      />

      <div className="yr-operations-tabs" role="tablist" aria-label="Agenda operacional">
        <button type="button" role="tab" aria-selected={panel === 'calendar'} className={panel === 'calendar' ? 'is-active' : ''} onClick={() => setPanel('calendar')}><CalendarDays className="h-4 w-4" /> Calendário</button>
        <button type="button" role="tab" aria-selected={panel === 'equipment'} className={panel === 'equipment' ? 'is-active' : ''} onClick={() => setPanel('equipment')}><Wrench className="h-4 w-4" /> Equipamentos</button>
      </div>

      {panel === 'equipment' ? <EquipmentAvailabilityView equipments={equipments} contracts={contracts} events={customEvents} leads={leads} onOpenLead={onOpenLead} /> : (
      <section className="yr-calendar-shell" aria-label="Agenda operacional">
        <div className="yr-calendar-toolbar">
          <div className="yr-calendar-toolbar__top">
            <div className="yr-calendar-modes" role="tablist" aria-label="Visualização da agenda">
              {([
                ['week', 'Semana'], ['month', 'Mês'], ['list', 'Lista'],
              ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{label}</button>)}
            </div>
            <div className="yr-calendar-period">
              <button type="button" className="yr-calendar-icon-button" aria-label="Período anterior" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <span aria-live="polite">{rangeLabel}</span>
              <button type="button" className="yr-calendar-icon-button" aria-label="Próximo período" onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" /></button>
              <button type="button" className="yr-calendar-today" onClick={goToToday}>Hoje</button>
            </div>
          </div>
          <div className="yr-calendar-filters" aria-label="Filtrar compromissos">
            {FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}
            <label className="yr-calendar-filter-select"><span className="sr-only">Responsável</span><select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="all">Toda a equipe</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label className="yr-calendar-search"><Search className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Buscar na agenda</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cliente, contrato ou evento" /></label>
          </div>
        </div>

        {customEvents.length === 0 && contracts.length === 0 && invoices.length === 0 ? (
          <div className="yr-calendar-first-empty">
            <AgendaVectorArt />
            <div><h3>Sua agenda começa aqui</h3><p>Os compromissos e as datas dos contratos e cobranças aparecem neste calendário.</p></div>
            <ActionButton onClick={() => openNewEvent()}><Plus className="h-4 w-4" /> Adicionar compromisso</ActionButton>
          </div>
        ) : mode === 'list' ? (
          <div className="yr-calendar-list-view">
            {Object.keys(listGroups).length ? Object.entries(listGroups).map(([date, items]) => (
              <section key={date} className="yr-calendar-list-day">
                <div className="yr-calendar-list-day__heading"><span>{formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span>{items.length} {items.length === 1 ? 'item' : 'itens'}</span></div>
                {renderAgendaList(items)}
              </section>
            )) : <div className="yr-calendar-list-empty">Nenhum compromisso neste período.</div>}
          </div>
        ) : (
          <div className="yr-calendar-layout">
            <div className="yr-calendar-main">
              <div className="yr-calendar-weekdays" aria-hidden="true">{DAYS.map((day) => <span key={day}>{day}</span>)}</div>
              {mode === 'month' ? (
                <div className="yr-calendar-month-grid" key={`month-${anchorDate.getFullYear()}-${anchorDate.getMonth()}`}>
                  {monthGrid.map((day) => {
                    const dateKey = toLocalDateKey(day)
                    const isCurrentMonth = day.getMonth() === anchorDate.getMonth()
                    const isSelected = dateKey === selectedDate
                    const isToday = dateKey === todayKey
                    const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
                      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : 0
                      if (!delta) return
                      event.preventDefault()
                      const next = addLocalDays(day, delta)
                      const nextKey = toLocalDateKey(next)
                      setSelectedDate(nextKey)
                      if (next.getMonth() !== anchorDate.getMonth() || next.getFullYear() !== anchorDate.getFullYear()) setAnchorDate(new Date(next.getFullYear(), next.getMonth(), 1))
                      requestAnimationFrame(() => requestAnimationFrame(() => monthDateRefs.current.get(nextKey)?.focus()))
                    }
                    return (
                      <div key={dateKey} className={`yr-calendar-cell ${!isCurrentMonth ? 'is-outside' : ''} ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}>
                        <button ref={(element) => { if (element) monthDateRefs.current.set(dateKey, element); else monthDateRefs.current.delete(dateKey) }} type="button" className="yr-calendar-cell__date" tabIndex={isSelected ? 0 : -1} onKeyDown={moveWithKeyboard} onClick={() => { setSelectedDate(dateKey); setAnchorDate(new Date(day.getFullYear(), day.getMonth(), 1)) }} aria-label={`${formatLocalDate(dateKey, { weekday: 'long', day: 'numeric', month: 'long' })}, ${itemsForDay(day).length} compromissos`} aria-current={isToday ? 'date' : undefined} aria-pressed={isSelected}>{day.getDate()}</button>
                        {renderDayEvents(dateKey)}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="yr-calendar-week-grid" key={`week-${toLocalDateKey(weekDays[0])}`}>
                  {weekDays.map((day) => {
                    const dateKey = toLocalDateKey(day)
                    const dayItems = itemsForDay(day)
                    return (
                      <section key={dateKey} className={`yr-calendar-week-column ${dateKey === selectedDate ? 'is-selected' : ''}`}>
                        <button type="button" className="yr-calendar-week-heading" onClick={() => setSelectedDate(dateKey)}><span>{DAYS[(day.getDay() + 6) % 7]}</span><strong>{day.getDate()}</strong></button>
                        <div className="yr-calendar-week-events">{dayItems.length ? dayItems.map((item) => eventButton(item)) : <span className="yr-calendar-no-event">Sem compromissos</span>}</div>
                      </section>
                    )
                  })}
                </div>
              )}

              <div className="yr-calendar-mobile-strip" aria-label="Dias desta semana">
                {weekDays.map((day) => {
                  const dateKey = toLocalDateKey(day)
                  const count = itemsForDay(day).length
                  return <button key={dateKey} type="button" className={dateKey === selectedDate ? 'is-active' : ''} onClick={() => setSelectedDate(dateKey)}><span>{DAYS[(day.getDay() + 6) % 7]}</span><strong>{day.getDate()}</strong>{count > 0 && <i aria-label={`${count} itens`} />}</button>
                })}
              </div>
              <div className="yr-calendar-mobile-day">
                <div className="yr-calendar-list-day__heading"><span>{formatLocalDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</span><button type="button" onClick={() => openNewEvent(selectedDate)}><Plus className="h-4 w-4" /> Adicionar</button></div>
                {renderAgendaList(selectedItems)}
              </div>
            </div>
            <aside className="yr-calendar-side" aria-label="Compromissos próximos">
              <div className="yr-calendar-side__head"><div><h3>Próximos compromissos</h3><p>Datas da operação e do financeiro.</p></div><span className="yr-calendar-side__count">{upcomingItems.length}</span></div>
              {upcomingItems.length ? (
                <div className="yr-agenda-upcoming">
                  {upcomingItems.map((item) => {
                    const Icon = EVENT_ICON[item.type]
                    return (
                      <button key={item.id} type="button" className="yr-agenda-upcoming__item" onClick={() => { setSelectedDate(item.date); setAnchorDate(safeDate(item.date)); openEvent(item) }}>
                        <span className={`yr-agenda-list__icon yr-agenda-list__icon--${TYPE_CLASS[item.type]}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><strong className="block truncate">{item.title}</strong><span className="mt-0.5 block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{formatLocalDate(item.date, { weekday: 'short', day: 'numeric', month: 'short' })}{item.startTime ? ` · ${item.startTime}` : ''}</span></span>
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-faint)' }} />
                      </button>
                    )
                  })}
                </div>
              ) : <div className="yr-calendar-side__empty">Nenhum item futuro neste filtro.</div>}
              <div className="yr-calendar-selected-day">
                <div className="yr-calendar-selected-day__heading"><div><span>Dia selecionado</span><strong>{formatLocalDate(selectedDate, { day: 'numeric', month: 'long' })}</strong></div><button type="button" aria-label="Novo compromisso nesta data" onClick={() => openNewEvent(selectedDate)}><Plus className="h-4 w-4" /></button></div>
                {renderAgendaList(selectedItems)}
              </div>
            </aside>
          </div>
        )}
      </section>
      )}

      <CalendarEventDialog
        open={showEventDialog}
        event={editingEvent}
        initialDate={selectedDate}
        leads={leads}
        contracts={contracts}
        equipments={equipments}
        invoices={invoices}
        team={team}
        currentUserId={currentUserId}
        onClose={() => setShowEventDialog(false)}
        onSaved={handleSaved}
      />

      <Modal
        open={Boolean(detailEvent)}
        onClose={() => setDetailEvent(null)}
        title={detailEvent?.title || 'Compromisso'}
        subtitle={detailEvent ? `${TYPE_LABEL[detailEvent.type]} · ${formatLocalDate(detailEvent.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
        icon={detailEvent ? React.createElement(EVENT_ICON[detailEvent.type], { className: 'h-4 w-4' }) : undefined}
        size="sm"
      >
        {detailEvent && (
          <div className="space-y-4">
            <div className="yr-event-detail-row"><Clock3 className="h-4 w-4" /><span>{detailEvent.startTime ? `${detailEvent.startTime}${detailEvent.endTime ? `–${detailEvent.endTime}` : ''}` : 'Sem horário definido'}</span></div>
            {detailEvent.endDate && <p className="yr-event-detail-label">Indisponível até {formatLocalDate(detailEvent.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
            {detailEvent.notes && <p className="yr-event-detail-notes">{detailEvent.notes}</p>}
            {detailEvent.source === 'invoice' && <p className="yr-event-detail-label">Esta data vem de uma cobrança cadastrada no financeiro.</p>}
            {detailEvent.contractId && <p className="yr-event-detail-label">Contrato: {contracts.find((item) => item.id === detailEvent.contractId)?.number || '—'}</p>}
            {detailEvent.equipmentId && <p className="yr-event-detail-label">Equipamento: {equipments.find((item) => item.id === detailEvent.equipmentId)?.name || '—'}</p>}
            {detailEvent.assignedTo && <p className="yr-event-detail-label">Responsável: {responsibleName(detailEvent.assignedTo) || '—'}</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {detailEvent.leadId && <button type="button" className="yr-dialog-secondary" onClick={() => { onOpenLead(detailEvent.leadId!); setDetailEvent(null) }}><UserRound className="h-4 w-4" /> Abrir cliente</button>}
              {detailEvent.source === 'manual' && detailEvent.status !== 'done' && detailEvent.status !== 'cancelled' && <button type="button" className="yr-dialog-primary" onClick={handleMarkDone}>Marcar concluído</button>}
            </div>
          </div>
        )}
      </Modal>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
