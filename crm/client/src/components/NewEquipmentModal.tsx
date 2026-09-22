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
  const [productCode, setProductCode] = useState('')
  const [quantity, setQuantity] = useState('1')
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

    const parsedQuantity = Number(quantity)
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100) {
      setLoading(false)
      setError('Informe uma quantidade inteira entre 1 e 100.')
      return
    }

    try {
      const response = await fetch('/api/equipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          productCode: productCode.trim(),
          quantity: parsedQuantity,
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
      setProductCode('')
      setQuantity('1')
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
      title="Adicionar produto ao inventário"
      subtitle="Cada unidade recebe um patrimônio próprio"
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
          <TextField
            label="Código do produto"
            value={productCode}
            onChange={(event) => setProductCode(event.target.value.toUpperCase())}
            placeholder="Ex.: YR-CAM-MAN-3M"
            hint="Opcional: o CRM gera um padrão se ficar vazio."
          />
          <TextField
            label="Quantidade"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            hint="Cada unidade vira um item do inventário."
          />
        </div>

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
          As unidades entram como <strong>disponíveis</strong>, compartilham o código do produto e
          recebem patrimônios individuais. O controle de higienização precisa ser preenchido com
          o laudo real do equipamento; o código do produto não substitui documentação sanitária.
        </p>
      </form>
    </Modal>
  )
}
