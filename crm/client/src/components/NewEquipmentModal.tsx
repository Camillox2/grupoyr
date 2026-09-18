import React, { useState } from 'react'
import { Bed, Plus, Tag, DollarSign, MapPin, X } from 'lucide-react'

interface NewEquipmentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewEquipmentModal: React.FC<NewEquipmentModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Camas')
  const [monthlyPrice, setMonthlyPrice] = useState('480')
  const [salePrice, setSalePrice] = useState('3800')
  const [location, setLocation] = useState('Galpão Principal YR')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/equipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name,
          category,
          monthlyPrice: Number(monthlyPrice),
          salePrice: Number(salePrice),
          location,
          status: 'disponivel',
        }),
      })

      if (res.ok) {
        onSuccess()
        onClose()
        setName('')
      }
    } catch (err) {
      console.error('Erro ao cadastrar equipamento:', err)
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
              <Bed className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Cadastrar Equipamento Hospitalar
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Nome do Equipamento / Modelo
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Cama hospitalar articulada com controle"
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              Localização Inicial
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Galpão Principal YR"
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Locação Mensal (R$)
            </label>
            <input
              type="number"
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Preço de Venda (R$)
            </label>
            <input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-[11px] text-blue-700 dark:text-blue-300">
          O equipamento será registrado como <strong>Pronta Entrega</strong> e receberá um número de patrimônio e laudo ANVISA automático.
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
            {loading ? 'Salvando...' : 'Salvar Equipamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
