import React, { useState } from 'react'
import { FileSignature, User, Bed, Calendar, DollarSign, X } from 'lucide-react'
import { Lead, Equipment } from '../types'

interface NewContractModalProps {
  open: boolean
  onClose: () => void
  lead: Lead | null
  leads: Lead[]
  equipments: Equipment[]
  onSuccess: () => void
}

export const NewContractModal: React.FC<NewContractModalProps> = ({
  open,
  onClose,
  lead,
  leads,
  equipments,
  onSuccess,
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState(lead?.id || leads[0]?.id || '')
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(equipments[0]?.id || '')
  const [contractType, setContractType] = useState<'locacao' | 'venda'>('locacao')
  const [monthlyValue, setMonthlyValue] = useState(lead?.value ? String(lead.value) : '480')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  )
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          leadId: selectedLeadId || lead?.id,
          type: contractType,
          equipmentIds: [selectedEquipmentId],
          startDate,
          endDate,
          monthlyValue: Number(monthlyValue),
        }),
      })

      if (res.ok) {
        onSuccess()
        onClose()
      }
    } catch (err) {
      console.error('Erro ao gerar contrato:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-blue-600" />
            Gerar Termo de Contrato
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Cliente / Contratante
          </label>
          <select
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
          >
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.phone})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Equipamento Hospitalar Vinculado
          </label>
          <select
            value={selectedEquipmentId}
            onChange={(e) => setSelectedEquipmentId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
          >
            {equipments.map((eq) => (
              <option key={eq.id} value={eq.id}>
                [{eq.serialNumber}] {eq.name} - R$ {eq.monthlyPrice}/mês ({eq.status})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Data de Início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Data de Término
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Valor Mensal Acordado (R$)
          </label>
          <input
            type="number"
            value={monthlyValue}
            onChange={(e) => setMonthlyValue(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
          >
            {loading ? 'Gerando...' : 'Gerar Contrato'}
          </button>
        </div>
      </form>
    </div>
  )
}
