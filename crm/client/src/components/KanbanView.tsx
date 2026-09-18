import React, { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import {
  Plus,
  Search,
  Bot,
  DollarSign,
  Phone,
  MessageCircle,
  FileSignature,
  FileText,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react'
import { Lead, Stage } from '../types'

interface KanbanViewProps {
  leads: Lead[]
  onUpdateLeadStage: (leadId: string, newStage: Stage) => void
  onSelectLead: (lead: Lead) => void
  onOpenNewContract: (lead: Lead) => void
  onOpenNewLeadModal: () => void
}

const COLUMNS: { id: Stage; title: string; color: string; border: string }[] = [
  { id: 'novo_lead', title: 'Novo Lead', color: 'bg-slate-500', border: 'border-slate-500' },
  { id: 'qualificacao_ia', title: 'Qualificação IA', color: 'bg-purple-500', border: 'border-purple-500' },
  { id: 'proposta_enviada', title: 'Proposta Enviada', color: 'bg-blue-500', border: 'border-blue-500' },
  { id: 'contrato_gerado', title: 'Contrato Gerado', color: 'bg-amber-500', border: 'border-amber-500' },
  { id: 'assinado_entrega', title: 'Assinado & Entrega', color: 'bg-indigo-500', border: 'border-indigo-500' },
  { id: 'locacao_ativa', title: 'Locação Ativa', color: 'bg-emerald-500', border: 'border-emerald-500' },
  { id: 'finalizado', title: 'Finalizado', color: 'bg-slate-400', border: 'border-slate-400' },
]

export const KanbanView: React.FC<KanbanViewProps> = ({
  leads,
  onUpdateLeadStage,
  onSelectLead,
  onOpenNewContract,
  onOpenNewLeadModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('todos')

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.equipmentInterest.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm)
    const matchesOrigin = filterOrigin === 'todos' || l.origin === filterOrigin
    return matchesSearch && matchesOrigin
  })

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newStage = destination.droppableId as Stage
    onUpdateLeadStage(draggableId, newStage)
  }

  return (
    <div className="space-y-4 pb-10">
      {/* Kanban Topbar Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente, telefone ou equipamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value)}
            className="text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="todos">Todos os Canais</option>
            <option value="Google Ads">Google Ads</option>
            <option value="Google Orgânico">Google Orgânico</option>
            <option value="Meta Ads">Meta Ads</option>
            <option value="WhatsApp Direto">WhatsApp Direto</option>
            <option value="Indicação">Indicação</option>
          </select>
        </div>

        <button
          onClick={onOpenNewLeadModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Lead
        </button>
      </div>

      {/* Kanban Board Columns with Drag and Drop */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none min-h-[calc(100vh-220px)]">
          {COLUMNS.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.stage === col.id)
            const colTotalValue = colLeads.reduce((acc, curr) => acc + (curr.value || 0), 0)

            return (
              <div
                key={col.id}
                className="w-80 shrink-0 rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 p-3 flex flex-col max-h-[calc(100vh-220px)]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {col.title}
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {colLeads.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    R$ {colTotalValue.toFixed(0)}
                  </span>
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 overflow-y-auto space-y-2.5 pr-1 transition-colors min-h-[150px] ${
                        snapshot.isDraggingOver
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 rounded-xl'
                          : ''
                      }`}
                    >
                      {colLeads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => onSelectLead(lead)}
                              className={`p-3.5 rounded-xl bg-white dark:bg-slate-800 border transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md ${
                                dragSnapshot.isDragging
                                  ? 'border-blue-500 shadow-xl scale-105 rotate-1 ring-2 ring-blue-500/30'
                                  : 'border-slate-200/90 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-600'
                              }`}
                            >
                              {/* Lead name & origin */}
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                  {lead.name}
                                </h4>
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shrink-0">
                                  {lead.origin}
                                </span>
                              </div>

                              {/* Equipment interest & modality */}
                              <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {lead.equipmentInterest}
                                </span>
                                <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-medium">
                                  {lead.modality === 'locacao' ? 'Locação' : 'Compra'}
                                </span>
                              </div>

                              {/* AI summary teaser if available */}
                              {lead.aiSummary && (
                                <div className="mt-2 p-2 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 text-[10px] text-purple-900 dark:text-purple-200 line-clamp-2 leading-relaxed flex items-start gap-1">
                                  <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                                  <span>{lead.aiSummary}</span>
                                </div>
                              )}

                              {/* Footer: Price, WhatsApp button and Contract Action */}
                              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  R$ {lead.value.toFixed(2)}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {col.id === 'proposta_enviada' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        onOpenNewContract(lead)
                                      }}
                                      className="p-1 rounded-md text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                      title="Gerar Contrato"
                                    >
                                      <FileSignature className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onSelectLead(lead)
                                    }}
                                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700"
                                    title="Conversar no WhatsApp"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
