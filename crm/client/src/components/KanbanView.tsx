import React, { useMemo, useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import {
  Plus,
  Search,
  MessageCircle,
  FileSignature,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  KanbanSquare,
} from 'lucide-react'
import { Lead, Stage } from '../types'
import { useIsMobile } from '../hooks/useMediaQuery'
import { PageHeader, ActionButton } from './ui/PageHeader'
import { EmptyState } from './ui/ResponsiveTable'
import { brl } from './ui/Feedback'
import { WaveScrollbar } from './ui/WaveScrollbar'

interface KanbanViewProps {
  leads: Lead[]
  onUpdateLeadStage: (leadId: string, newStage: Stage) => void
  onSelectLead: (lead: Lead) => void
  onOpenNewContract: (lead: Lead) => void
  onOpenNewLeadModal: () => void
}

/** Cada etapa tem uma cor de token, nao uma classe do Tailwind solta. */
const COLUMNS: { id: Stage; title: string; accent: string }[] = [
  { id: 'novo_lead', title: 'Novo lead', accent: 'var(--ink-faint)' },
  { id: 'qualificacao_ia', title: 'Qualificação IA', accent: 'var(--yr-300)' },
  { id: 'proposta_enviada', title: 'Proposta enviada', accent: 'var(--busy)' },
  { id: 'contrato_gerado', title: 'Contrato gerado', accent: 'var(--wait)' },
  { id: 'assinado_entrega', title: 'Assinado e entrega', accent: 'var(--yr-700)' },
  { id: 'locacao_ativa', title: 'Locação ativa', accent: 'var(--ok)' },
  { id: 'finalizado', title: 'Finalizado', accent: 'var(--ink-faint)' },
]

const ORIGINS = ['Google Ads', 'Google Orgânico', 'Meta Ads', 'WhatsApp Direto', 'Indicação']

export const KanbanView: React.FC<KanbanViewProps> = ({
  leads,
  onUpdateLeadStage,
  onSelectLead,
  onOpenNewContract,
  onOpenNewLeadModal,
}) => {
  const isMobile = useIsMobile()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('todos')
  // No mobile o funil mostra uma etapa por vez: 7 colunas nao cabem em 390px.
  const [mobileStageIndex, setMobileStageIndex] = useState(0)
  const boardRef = useRef<HTMLDivElement | null>(null)

  const filteredLeads = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return leads.filter((lead) => {
      const matchesSearch =
        !term ||
        lead.name.toLowerCase().includes(term) ||
        lead.equipmentInterest.toLowerCase().includes(term) ||
        lead.phone.includes(term)
      const matchesOrigin = filterOrigin === 'todos' || lead.origin === filterOrigin
      return matchesSearch && matchesOrigin
    })
  }, [leads, searchTerm, filterOrigin])

  const byStage = useMemo(() => {
    const map = new Map<Stage, Lead[]>()
    for (const column of COLUMNS) map.set(column.id, [])
    for (const lead of filteredLeads) map.get(lead.stage)?.push(lead)
    return map
  }, [filteredLeads])

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const target = result.destination.droppableId as Stage
    const lead = leads.find((item) => item.id === result.draggableId)
    if (lead && lead.stage === target) return
    onUpdateLeadStage(result.draggableId, target)
  }

  const stageTotal = (stage: Stage) =>
    (byStage.get(stage) ?? []).reduce((total, lead) => total + (lead.value || 0), 0)

  const card = (lead: Lead, stage: Stage, dragging = false) => (
    <div
      onClick={() => onSelectLead(lead)}
      className={`rounded-[12px] p-3.5 transition-shadow ${dragging ? 'dragging' : ''}`}
      style={{
        background: 'var(--surface-raised)',
        border: `1px solid ${dragging ? 'var(--yr-500)' : 'var(--border-subtle)'}`,
        boxShadow: dragging ? 'var(--shadow-drag)' : 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-extrabold leading-snug" style={{ color: 'var(--ink)' }}>
          {lead.name}
        </h4>
        <span
          className="tap-exempt shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
        >
          {lead.origin}
        </span>
      </div>

      <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        <span className="font-bold" style={{ color: 'var(--ink)' }}>
          {lead.equipmentInterest}
        </span>
        <span
          className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'var(--yr-050)', color: 'var(--yr-700)' }}
        >
          {lead.modality === 'locacao' ? 'Locação' : 'Compra'}
        </span>
      </p>

      {lead.aiSummary && (
        <p
          className="mt-2 flex items-start gap-1.5 rounded-[8px] p-2 text-[11px] leading-relaxed"
          style={{ background: 'var(--yr-050)', color: 'var(--yr-700)' }}
        >
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{lead.aiSummary}</span>
        </p>
      )}

      <div
        className="mt-3 flex items-center justify-between pt-2.5"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <span className="tnum text-[13px] font-extrabold" style={{ color: 'var(--ink)' }}>
          {brl(lead.value)}
        </span>
        <div className="flex items-center gap-1">
          {stage === 'proposta_enviada' && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onOpenNewContract(lead)
              }}
              className="tap-exempt grid h-8 w-8 place-items-center rounded-[8px] transition-colors"
              style={{ color: 'var(--wait)' }}
              title="Gerar contrato para este lead"
              aria-label={`Gerar contrato para ${lead.name}`}
            >
              <FileSignature className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation()
              onSelectLead(lead)
            }}
            className="tap-exempt grid h-8 w-8 place-items-center rounded-[8px] transition-colors"
            style={{ color: 'var(--ink-faint)' }}
            title="Abrir a conversa no WhatsApp"
            aria-label={`Abrir conversa com ${lead.name}`}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  const filters = (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--ink-faint)' }}
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Buscar cliente, telefone ou equipamento"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          aria-label="Buscar no funil"
          className="w-full rounded-[10px] py-2.5 pl-9 pr-3 text-[13px] outline-none"
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--ink)',
          }}
        />
      </div>
      <select
        value={filterOrigin}
        onChange={(event) => setFilterOrigin(event.target.value)}
        aria-label="Filtrar por canal de origem"
        className="rounded-[10px] px-3 py-2.5 text-[13px] outline-none sm:w-52"
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--ink)',
        }}
      >
        <option value="todos">Todos os canais</option>
        {ORIGINS.map((origin) => (
          <option key={origin} value={origin}>
            {origin}
          </option>
        ))}
      </select>
    </div>
  )

  const header = (
    <PageHeader
      icon={<KanbanSquare className="h-5 w-5" />}
      eyebrow="Funil"
      title="Funil de vendas"
      description={`${filteredLeads.length} lead${filteredLeads.length === 1 ? '' : 's'} em acompanhamento, ${brl(
        filteredLeads.reduce((total, lead) => total + (lead.value || 0), 0),
      )} em jogo.`}
      actions={
        <ActionButton onClick={onOpenNewLeadModal}>
          <Plus className="h-4 w-4" />
          Novo lead
        </ActionButton>
      }
    />
  )

  // ---------------------------------------------------------------- MOBILE
  if (isMobile) {
    const stage = COLUMNS[mobileStageIndex]
    const stageLeads = byStage.get(stage.id) ?? []

    return (
      <div className="pb-10">
        {header}
        {filters}

        {/* Seletor de etapa: substitui as 7 colunas lado a lado. */}
        <div
          className="mb-3 flex items-center gap-2 rounded-[12px] p-1.5"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={() => setMobileStageIndex((index) => Math.max(0, index - 1))}
            disabled={mobileStageIndex === 0}
            aria-label="Etapa anterior"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] disabled:opacity-30"
            style={{ color: 'var(--ink-muted)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-extrabold" style={{ color: 'var(--ink)' }}>
              {stage.title}
            </p>
            <p className="tnum text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
              {stageLeads.length} lead{stageLeads.length === 1 ? '' : 's'} · {brl(stageTotal(stage.id))}
            </p>
          </div>

          <button
            onClick={() => setMobileStageIndex((index) => Math.min(COLUMNS.length - 1, index + 1))}
            disabled={mobileStageIndex === COLUMNS.length - 1}
            aria-label="Próxima etapa"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] disabled:opacity-30"
            style={{ color: 'var(--ink-muted)' }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Trilha de progresso entre as etapas. */}
        <div className="mb-4 flex gap-1" role="presentation">
          {COLUMNS.map((column, index) => (
            <button
              key={column.id}
              onClick={() => setMobileStageIndex(index)}
              aria-label={`Ir para ${column.title}`}
              className="tap-exempt h-1.5 flex-1 rounded-full transition-colors"
              style={{
                background: index === mobileStageIndex ? column.accent : 'var(--border-subtle)',
              }}
            />
          ))}
        </div>

        {stageLeads.length === 0 ? (
          <EmptyState
            icon={<KanbanSquare className="h-5 w-5" />}
            title="Nenhum lead nesta etapa"
            description="Use as setas acima para navegar pelo funil, ou cadastre um lead novo."
          />
        ) : (
          <ul className="space-y-2.5">
            {stageLeads.map((lead) => (
              <li key={lead.id}>
                {card(lead, stage.id)}
                {/* Arrastar e ruim no toque: mover por botao. */}
                <div className="mt-1.5 flex gap-2">
                  {mobileStageIndex > 0 && (
                    <button
                      onClick={() => onUpdateLeadStage(lead.id, COLUMNS[mobileStageIndex - 1].id)}
                      className="flex-1 rounded-[8px] py-2 text-[11px] font-bold"
                      style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                    >
                      ← {COLUMNS[mobileStageIndex - 1].title}
                    </button>
                  )}
                  {mobileStageIndex < COLUMNS.length - 1 && (
                    <button
                      onClick={() => onUpdateLeadStage(lead.id, COLUMNS[mobileStageIndex + 1].id)}
                      className="flex-1 rounded-[8px] py-2 text-[11px] font-bold"
                      style={{ background: 'var(--yr-050)', color: 'var(--yr-700)' }}
                    >
                      {COLUMNS[mobileStageIndex + 1].title} →
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------- DESKTOP
  return (
    <div className="pb-6">
      {header}
      {filters}

      <DragDropContext onDragEnd={onDragEnd}>
        {/* O QUADRO e a unica area de rolagem, nos dois sentidos.
            A biblioteca de arrastar so faz auto-rolagem na area de rolagem mais
            proxima de cada coluna. Quando cada coluna tinha a sua propria
            rolagem vertical, a biblioteca nem sabia que o quadro rolava de
            lado: arrastar um card para uma etapa fora da tela nao movia nada.
            Com o quadro como rolagem unica, chegar com o card perto da borda
            esquerda ou direita rola o funil sozinho. Os cabecalhos das colunas
            ficam presos no topo (sticky) enquanto o quadro rola para baixo. */}
        <div className="kanban-frame">
        <div ref={boardRef} className="kanban-board select-none">
          <div className="flex items-start gap-4 pb-2 pr-1">
            {COLUMNS.map((column) => {
              const columnLeads = byStage.get(column.id) ?? []

              return (
                <section
                  key={column.id}
                  className="w-[19rem] shrink-0 rounded-[16px] px-3 pb-3"
                  style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
                >
                  <div
                    className="sticky top-0 z-[2] mb-2 flex items-center justify-between gap-2 rounded-t-[16px] pb-2.5 pt-3"
                    style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: column.accent }} />
                      <h3 className="truncate text-[12px] font-extrabold" style={{ color: 'var(--ink)' }}>
                        {column.title}
                      </h3>
                      <span
                        className="tnum shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                        style={{ background: 'var(--surface-raised)', color: 'var(--ink-muted)' }}
                      >
                        {columnLeads.length}
                      </span>
                    </div>
                    <span className="tnum shrink-0 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                      {brl(stageTotal(column.id))}
                    </span>
                  </div>

                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`kanban-drop space-y-2.5 rounded-[10px] ${snapshot.isDraggingOver ? 'drop-active' : ''}`}
                      >
                        {columnLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing"
                              >
                                {card(lead, column.id, dragSnapshot.isDragging)}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </section>
              )
            })}
          </div>
        </div>
        </div>
      </DragDropContext>

      <WaveScrollbar target={boardRef} />
    </div>
  )
}
