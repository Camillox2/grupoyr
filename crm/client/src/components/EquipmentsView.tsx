import React, { useState } from 'react'
import {
  Bed,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  MapPin,
  Tag,
  DollarSign,
  Layers,
  X,
} from 'lucide-react'
import { Equipment } from '../types'

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
  const [newEqName, setNewEqName] = useState('')
  const [newEqCategory, setNewEqCategory] = useState('Camas')
  const [newEqMonthly, setNewEqMonthly] = useState('480')
  const [newEqSale, setNewEqSale] = useState('3800')

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

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEqName.trim()) return

    try {
      const res = await fetch('/api/equipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name: newEqName,
          category: newEqCategory,
          monthlyPrice: Number(newEqMonthly),
          salePrice: Number(newEqSale),
          status: 'disponivel',
        }),
      })
      if (res.ok) {
        setShowAddModal(false)
        setNewEqName('')
        onRefreshEquipments()
      }
    } catch (err) {
      console.error('Erro ao adicionar equipamento:', err)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bed className="w-5 h-5 text-blue-600" />
            Frota e Inventário de Equipamentos Hospitalares
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle de camas articuladas, macas, carrinhos de emergência e certificados de higienização ANVISA.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Equipamento
        </button>
      </div>

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
              label: 'Higienização ANVISA',
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
          const isDisponivel = eq.status === 'disponivel'
          const isHigienizacao = eq.status === 'higienizacao'

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
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      isAlugado
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : isDisponivel
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : isHigienizacao
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {isAlugado
                      ? 'Alugado'
                      : isDisponivel
                      ? 'Pronta Entrega'
                      : isHigienizacao
                      ? 'Higienização'
                      : 'Manutenção'}
                  </span>
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
                    <span>ANVISA: {eq.sanitizationCert}</span>
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

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddEquipment}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Cadastrar Novo Equipamento
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome do Equipamento
              </label>
              <input
                type="text"
                required
                value={newEqName}
                onChange={(e) => setNewEqName(e.target.value)}
                placeholder="Ex: Cama hospitalar articulada"
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Categoria
                </label>
                <select
                  value={newEqCategory}
                  onChange={(e) => setNewEqCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="Camas">Camas</option>
                  <option value="Macas">Macas</option>
                  <option value="Emergência">Emergência</option>
                  <option value="Mobiliário">Mobiliário</option>
                  <option value="Acessórios">Acessórios</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Aluguel Mensal (R$)
                </label>
                <input
                  type="number"
                  value={newEqMonthly}
                  onChange={(e) => setNewEqMonthly(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
              >
                Salvar Equipamento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
