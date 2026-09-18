import React, { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Modal } from './ui/Modal'
import { TextField, SelectField, TextAreaField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'

interface NewLeadModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// Mesmo catalogo do site. O colchao pneumatico sai apenas em compra (item de
// contato direto com a pele), entao o formulario nao deixa marcar locacao.
const CATALOG: { name: string; rent: boolean }[] = [
  { name: 'Cama elétrica luxo', rent: true },
  { name: 'Cama manual 3 movimentos', rent: true },
  { name: 'Colchão pneumático', rent: false },
  { name: 'Cadeira de banho', rent: true },
]
const EQUIPMENTS = CATALOG.map((item) => ({ value: item.name, label: item.name }))
const canRent = (name: string) => CATALOG.find((item) => item.name === name)?.rent ?? true

const ORIGINS = [
  'Google Ads',
  'Google Orgânico',
  'Meta Ads',
  'WhatsApp Direto',
  'Indicação',
].map((name) => ({ value: name, label: name }))

export const NewLeadModal: React.FC<NewLeadModalProps> = ({ open, onClose, onSuccess }) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [equipmentInterest, setEquipmentInterest] = useState(EQUIPMENTS[0].value)
  const [modality, setModality] = useState<'locacao' | 'compra'>('locacao')
  const [origin, setOrigin] = useState('Google Orgânico')
  const [value, setValue] = useState('480')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setPhone('')
    setEmail('')
    setNotes('')
    setError(null)
  }

  const handleClose = () => {
    if (loading) return
    reset()
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !phone.trim()) {
      setError('Informe ao menos o nome e o telefone do cliente.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          email: email.trim(),
          equipmentInterest,
          modality,
          origin,
          value: Number(value) || 0,
          notes: notes.trim(),
        }),
      })

      if (!response.ok) {
        // Sem isso o formulario fechava calado e o lead nunca aparecia na lista.
        throw new Error(`Falha ao cadastrar o lead (${response.status})`)
      }

      reset()
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Erro ao criar lead:', err)
      setError('Não foi possível cadastrar o lead. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cadastrar lead no funil"
      subtitle="Entra na primeira etapa, pronto para qualificação"
      icon={<UserPlus className="h-4 w-4" />}
      footer={
        <div className="flex gap-3">
          <SubmitButton
            variant="ghost"
            type="button"
            loading={false}
            onClick={handleClose}
            className="flex-1"
          >
            Cancelar
          </SubmitButton>
          <SubmitButton
            type="submit"
            form="form-novo-lead"
            loading={loading}
            className="flex-[2]"
          >
            Cadastrar lead
          </SubmitButton>
        </div>
      }
    >
      <form id="form-novo-lead" onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <TextField
          label="Nome do cliente"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: João da Silva"
          autoComplete="name"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone / WhatsApp"
            required
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="41999998888"
            autoComplete="tel"
          />
          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="cliente@email.com"
            autoComplete="email"
            hint="Opcional"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Equipamento de interesse"
            value={equipmentInterest}
            onChange={(event) => {
              const next = event.target.value
              setEquipmentInterest(next)
              if (!canRent(next)) setModality('compra')
            }}
            options={EQUIPMENTS}
          />
          <SelectField
            label="Modalidade"
            value={modality}
            onChange={(event) => setModality(event.target.value as 'locacao' | 'compra')}
            options={
              canRent(equipmentInterest)
                ? [
                    { value: 'locacao', label: 'Locação' },
                    { value: 'compra', label: 'Compra' },
                  ]
                : [{ value: 'compra', label: 'Compra' }]
            }
            hint={canRent(equipmentInterest) ? undefined : 'Este item sai apenas em compra.'}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Canal de origem"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            options={ORIGINS}
          />
          <TextField
            label="Valor previsto (R$)"
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>

        <TextAreaField
          label="Observações"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Contexto do atendimento, condições de acesso, prazo estimado"
          hint="Opcional"
        />
      </form>
    </Modal>
  )
}
