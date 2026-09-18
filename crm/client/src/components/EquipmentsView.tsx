import React, { useState } from 'react'
import {
  Bed,
  Plus,
  Search,
  ShieldCheck,
  MapPin,
  X,
} from 'lucide-react'
import { Equipment } from '../types'
import { PageHeader, ActionButton } from './ui/PageHeader'
import { NewEquipmentModal } from './NewEquipmentModal'
import { EquipmentStatus } from './ui/Status'

interface EquipmentsViewProps {
  equipments: Equipment[]
  onRefreshEquipments: () => void
}

export const EquipmentsView: React.FC<EquipmentsViewProps> = ({
  equipments,
  onRefreshEquipments,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const filtered = equipments.filter((eq) => {
    const matchesStatus = filterStatus === 'todos' || eq.status === filterStatus
    const matchesSearch =
      eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.currentClientName && eq.currentClientName.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesStatus && matchesSearch
  })

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/equipments/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        onRefreshEquipments()
      }
    } catch (e) {
      console.error('Erro ao atualizar status do equipamento:', e)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={<Bed className="h-5 w-5" />}
        eyebrow="Inventário"
        title="Equipamentos"
        description="Camas, colchões e cadeiras: onde cada peça está, com quem, e em que etapa do ciclo de higienização."
        actions={
          <ActionButton onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Cadastrar equipamento
          </ActionButton>
        }
      />

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'todos', label: 'Todos', count: equipments.length },
            {
              id: 'alugado',
              label: 'Alugados (Em Paciente)',
              count: equipments.filter((e) => e.status === 'alugado').length,
            },
            {
              id: 'disponivel',
              label: 'Pronta Entrega',
              count: equipments.filter((e) => e.status === 'disponivel').length,
            },
            {
              id: 'higienizacao',
              label: 'Higienização',
              count: equipments.filter((e) => e.status === 'higienizacao').length,
            },
            {
              id: 'manutencao',
              label: 'Manutenção',
              count: equipments.filter((e) => e.status === 'manutencao').length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                filterStatus === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  filterStatus === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por patrimônio, modelo ou paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Equipment Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((eq) => {
          const isAlugado = eq.status === 'alugado'

          return (
            <div
              key={eq.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              <div>
                {/* Serial & Status */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                    {eq.serialNumber}
                  </span>
                  <EquipmentStatus status={eq.status} />
                </div>

                {/* Name & Category */}
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-3 leading-snug">
                  {eq.name}
                </h3>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {eq.category}
                </span>

                {/* Patient or Location details */}
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-1.5">
                  {isAlugado && eq.currentClientName ? (
                    <div>
                      <span className="text-[10px] text-slate-500 block">Locado para:</span>
                      <strong className="text-slate-900 dark:text-white">
                        {eq.currentClientName}
                      </strong>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{eq.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Controle interno: {eq.sanitizationCert}</span>
                  </div>
                </div>
              </div>

              {/* Price & Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block">Mensalidade / Venda:</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {eq.monthlyPrice > 0 ? `R$ ${eq.monthlyPrice}/mês` : `Venda R$ ${eq.salePrice}`}
                  </span>
                </div>

                {/* Status Switcher Action */}
                <select
                  value={eq.status}
                  onChange={(e) => handleUpdateStatus(eq.id, e.target.value)}
                  className="text-[11px] font-medium py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value="disponivel">Pronta Entrega</option>
                  <option value="alugado">Alugado</option>
                  <option value="higienizacao">Higienização</option>
                  <option value="manutencao">Manutenção</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mesmo modal usado pelo atalho do dashboard: uma unica fonte de verdade. */}
      <NewEquipmentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={onRefreshEquipments}
      />
    </div>
  )
}
