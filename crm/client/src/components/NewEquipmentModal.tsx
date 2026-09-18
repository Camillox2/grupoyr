import React, { useState } from 'react'
import { Bed } from 'lucide-react'
import { Modal } from './ui/Modal'
import { TextField, SelectField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'

interface NewEquipmentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const CATEGORIES = ['Camas', 'Macas', 'Emergência', 'Mobiliário', 'Acessórios'].map((name) => ({
  value: name,
  label: name,
}))

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
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (loading) return
    setError(null)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Informe o nome ou modelo do equipamento.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/equipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          monthlyPrice: Number(monthlyPrice) || 0,
          salePrice: Number(salePrice) || 0,
          location: location.trim(),
          status: 'disponivel',
        }),
      })

      if (!response.ok) {
        throw new Error(`Falha ao cadastrar o equipamento (${response.status})`)
      }

      setName('')
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Erro ao cadastrar equipamento:', err)
      setError('Não foi possível cadastrar o equipamento. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cadastrar equipamento"
      subtitle="Entra no inventário como disponível"
      icon={<Bed className="h-4 w-4" />}
      footer={
        <div className="flex gap-3">
          <SubmitButton variant="ghost" type="button" loading={false} onClick={handleClose} className="flex-1">
            Cancelar
          </SubmitButton>
          <SubmitButton type="submit" form="form-novo-equipamento" loading={loading} className="flex-[2]">
            Salvar equipamento
          </SubmitButton>
        </div>
      }
    >
      <form id="form-novo-equipamento" onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <TextField
          label="Nome ou modelo"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Cama hospitalar articulada com controle"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={CATEGORIES}
          />
          <TextField
            label="Localização inicial"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Ex.: Galpão Principal YR"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Locação mensal (R$)"
            type="number"
            inputMode="numeric"
            min={0}
            value={monthlyPrice}
            onChange={(event) => setMonthlyPrice(event.target.value)}
          />
          <TextField
            label="Preço de venda (R$)"
            type="number"
            inputMode="numeric"
            min={0}
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
          />
        </div>

        <p
          className="rounded-[10px] p-3 text-[11px] leading-relaxed"
          style={{
            background: 'var(--yr-050)',
            border: '1px solid var(--yr-100)',
            color: 'var(--yr-700)',
          }}
        >
          O equipamento entra como <strong>disponível</strong> e recebe um código interno de
          patrimônio. O controle de higienização precisa ser preenchido com o laudo real do
          equipamento; o código gerado automaticamente é apenas um identificador interno e não
          substitui documentação sanitária.
        </p>
      </form>
    </Modal>
  )
}
