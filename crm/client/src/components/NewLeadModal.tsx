import React, { useState } from 'react'
import { Plus, User, Phone, Mail, DollarSign, Tag, Layers, X } from 'lucide-react'

interface NewLeadModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({ open, onClose, onSuccess }) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [equipmentInterest, setEquipmentInterest] = useState('Cama hospitalar articulada')
  const [modality, setModality] = useState<'locacao' | 'compra'>('locacao')
  const [origin, setOrigin] = useState('Google Orgânico')
  const [value, setValue] = useState('480')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !phone) return
    setLoading(true)

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name,
          phone: phone.replace(/\D/g, ''),
          email,
          equipmentInterest,
          modality,
          origin,
          value: Number(value),
          notes,
        }),
      })

      if (res.ok) {
        onSuccess()
        onClose()
      }
    } catch (err) {
      console.error('Erro ao criar lead:', err)
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
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Cadastrar Novo Lead no Funil
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Nome Completo do Cliente
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: João da Silva"
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telefone / WhatsApp
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 41999998888"
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              E-mail (opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Equipamento de Interesse
            </label>
            <select
              value={equipmentInterest}
              onChange={(e) => setEquipmentInterest(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="Cama hospitalar articulada">Cama articulada</option>
              <option value="Cama manual 3 movimentos">Cama manual 3 mov.</option>
              <option value="Maca hidráulica">Maca hidráulica</option>
              <option value="Carrinho de emergência">Carrinho emergência</option>
              <option value="Biombo hospitalar">Biombo hospitalar</option>
              <option value="Mesa de refeição">Mesa refeição</option>
              <option value="Colchão Pneumático">Colchão Pneumático</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Modalidade
            </label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="locacao">Locação</option>
              <option value="compra">Compra</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Canal de Origem (UTM)
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="Google Ads">Google Ads</option>
              <option value="Google Orgânico">Google Orgânico</option>
              <option value="Meta Ads">Meta Ads</option>
              <option value="WhatsApp Direto">WhatsApp Direto</option>
              <option value="Indicação">Indicação</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor Previsto (R$)
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
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
            {loading ? 'Cadastrando...' : 'Cadastrar Lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
