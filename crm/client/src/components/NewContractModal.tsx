import React, { useEffect, useRef, useState } from 'react'
import { FileSignature } from 'lucide-react'
import { Lead, Equipment } from '../types'
import { Modal } from './ui/Modal'
import { TextField, SelectField, FormError } from './ui/Field'
import { SubmitButton, brl } from './ui/Feedback'
import { EQUIPMENT_STATUS } from './ui/Status'

interface NewContractModalProps {
  open: boolean
  onClose: () => void
  lead: Lead | null
  leads: Lead[]
  equipments: Equipment[]
  onSuccess: () => void
}

const isoDate = (date: Date) => date.toISOString().split('T')[0]

export const NewContractModal: React.FC<NewContractModalProps> = ({
  open,
  onClose,
  lead,
  leads,
  equipments,
  onSuccess,
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [contractType, setContractType] = useState<'locacao' | 'venda'>('locacao')
  const [monthlyValue, setMonthlyValue] = useState('480')
  const [startDate, setStartDate] = useState(() => isoDate(new Date()))
  const [endDate, setEndDate] = useState(() => isoDate(new Date(Date.now() + 30 * 86400000)))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // O estado inicial de useState roda uma vez so; sem sincronizar, abrir o
  // modal para um segundo lead continuava mostrando o primeiro.
  //
  // O preenchimento acontece SO na abertura. `leads` e `equipments` sao
  // recriados a cada fetch e a cada evento de socket: depender deles jogaria
  // fora o que o operador ja digitou quando chegasse uma mensagem no WhatsApp.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true

    setSelectedLeadId(lead?.id || leads[0]?.id || '')
    setSelectedEquipmentId(
      equipments.find((item) => item.status === 'disponivel')?.id || equipments[0]?.id || '',
    )
    setMonthlyValue(lead?.value ? String(lead.value) : '480')
    setContractType(lead?.modality === 'compra' ? 'venda' : 'locacao')
    setError(null)
  }, [open, lead, leads, equipments])

  const handleClose = () => {
    if (loading) return
    setError(null)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!selectedLeadId) {
      setError('Selecione o cliente contratante.')
      return
    }
    if (!selectedEquipmentId) {
      setError('Selecione o equipamento vinculado ao contrato.')
      return
    }
    if (contractType === 'locacao' && endDate < startDate) {
      setError('A data de término não pode ser anterior à data de início.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          leadId: selectedLeadId,
          type: contractType,
          equipmentIds: [selectedEquipmentId],
          startDate,
          endDate,
          monthlyValue: Number(monthlyValue) || 0,
        }),
      })

      if (!response.ok) {
        throw new Error(`Falha ao gerar o contrato (${response.status})`)
      }

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Erro ao gerar contrato:', err)
      setError('Não foi possível gerar o contrato. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Gerar termo de contrato"
      subtitle="Depois de gerado, o termo segue para assinatura do cliente"
      icon={<FileSignature className="h-4 w-4" />}
      footer={
        <div className="flex gap-3">
          <SubmitButton variant="ghost" type="button" loading={false} onClick={handleClose} className="flex-1">
            Cancelar
          </SubmitButton>
          <SubmitButton type="submit" form="form-novo-contrato" loading={loading} className="flex-[2]">
            Gerar contrato
          </SubmitButton>
        </div>
      }
    >
      <form id="form-novo-contrato" onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <SelectField
          label="Cliente contratante"
          value={selectedLeadId}
          onChange={(event) => setSelectedLeadId(event.target.value)}
          options={leads.map((item) => ({
            value: item.id,
            label: `${item.name} (${item.phone})`,
          }))}
        />

        <SelectField
          label="Equipamento vinculado"
          value={selectedEquipmentId}
          onChange={(event) => setSelectedEquipmentId(event.target.value)}
          options={equipments.map((item) => ({
            value: item.id,
            label: `${item.serialNumber} · ${item.name} · ${brl(item.monthlyPrice)}/mês · ${
              EQUIPMENT_STATUS[item.status]?.label ?? item.status
            }`,
          }))}
          hint="O status vem no próprio item: evite vincular equipamento que já está alugado."
        />

        <SelectField
          label="Tipo de contrato"
          value={contractType}
          onChange={(event) => setContractType(event.target.value as 'locacao' | 'venda')}
          options={[
            { value: 'locacao', label: 'Locação' },
            { value: 'venda', label: 'Venda' },
          ]}
        />

        {contractType === 'locacao' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Início"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <TextField
              label="Término"
              type="date"
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        )}

        <TextField
          label={contractType === 'locacao' ? 'Valor mensal acordado (R$)' : 'Valor da venda (R$)'}
          type="number"
          inputMode="numeric"
          min={0}
          value={monthlyValue}
          onChange={(event) => setMonthlyValue(event.target.value)}
        />
      </form>
    </Modal>
  )
}
