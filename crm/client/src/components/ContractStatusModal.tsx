import React, { useEffect, useState } from 'react'
import { Ban, Check, FlagTriangleRight, RotateCcw, Workflow } from 'lucide-react'
import type { Contract } from '../types'
import { authHeaders } from '../lib/conversation'
import { Modal } from './ui/Modal'
import { TextAreaField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'

type NextStatus = NonNullable<Contract['nextStatuses']>[number]

// O que cada mudanca faz de verdade no servidor (contracts.js). A equipe le
// isto ANTES de confirmar, porque cancelar mexe em estoque e cobranca.
const OPTIONS: Record<string, { label: string; Icon: typeof Ban; tone: 'alert' | 'ok' | 'busy'; effects: string[]; reason: 'required' | 'optional' }> = {
  cancelado: {
    label: 'Cancelar contrato',
    Icon: Ban,
    tone: 'alert',
    reason: 'required',
    effects: [
      'O link de assinatura para de funcionar.',
      'Cobranças em aberto deste contrato são canceladas.',
      'Equipamento que estava com o cliente volta para higienização.',
      'O lead volta para a etapa de proposta no funil.',
    ],
  },
  encerrado: {
    label: 'Encerrar locação',
    Icon: FlagTriangleRight,
    tone: 'ok',
    reason: 'optional',
    effects: [
      'Use quando o equipamento foi devolvido e o contrato cumpriu o prazo.',
      'O equipamento volta para higienização.',
      'O lead vai para Finalizado no funil.',
      'Cobranças em aberto continuam valendo.',
    ],
  },
  pendente_assinatura: {
    label: 'Reativar contrato',
    Icon: RotateCcw,
    tone: 'busy',
    reason: 'optional',
    effects: [
      'O contrato volta a aguardar assinatura e o link funciona de novo.',
      'Cobranças que foram canceladas não voltam sozinhas: gere uma nova se precisar.',
    ],
  },
}

interface ContractStatusModalProps {
  contract: Contract | null
  onClose: () => void
  onChanged: (summary: string) => void
}

export const ContractStatusModal: React.FC<ContractStatusModalProps> = ({ contract, onClose, onChanged }) => {
  const choices = (contract?.nextStatuses || []).filter((status) => OPTIONS[status])
  const [selected, setSelected] = useState<NextStatus | ''>('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Abre ja com a unica opcao marcada, quando so existe uma.
  useEffect(() => {
    setSelected(choices.length === 1 ? choices[0] : '')
    setReason('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.id])

  if (!contract) return null
  const option = selected ? OPTIONS[selected] : null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !option || loading) return
    if (option.reason === 'required' && reason.trim().length < 3) {
      setError('Conte em poucas palavras o motivo. Fica registrado no contrato.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/contracts/${contract.id}/status`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: selected, reason }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || 'Não foi possível alterar o status.')
        return
      }
      const extras = [
        data?.releasedEquipments ? `${data.releasedEquipments} equipamento(s) em higienização` : '',
        data?.cancelledInvoices ? `${data.cancelledInvoices} cobrança(s) cancelada(s)` : '',
      ].filter(Boolean)
      onChanged(`${contract.number}: ${option.label.toLowerCase()} concluído${extras.length ? ` (${extras.join(', ')})` : ''}.`)
      onClose()
    } catch {
      setError('Falha de comunicação com o servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => !loading && onClose()}
      title="Alterar status do contrato"
      subtitle={`${contract.number} · ${contract.clientName}`}
      icon={<Workflow className="h-4 w-4" />}
      footer={
        <div className="flex gap-3">
          <SubmitButton variant="ghost" type="button" loading={false} onClick={onClose} className="flex-1">
            Voltar
          </SubmitButton>
          <SubmitButton type="submit" form="form-status-contrato" loading={loading} disabled={!selected} className="flex-[2]">
            {option ? option.label : 'Escolha uma opção'}
          </SubmitButton>
        </div>
      }
    >
      <form id="form-status-contrato" onSubmit={submit} className="space-y-4">
        <FormError message={error} />

        {choices.length === 0 ? (
          <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            Este contrato não tem mais mudança de status disponível.
          </p>
        ) : (
          <div className="grid gap-2" role="radiogroup" aria-label="Novo status">
            {choices.map((status) => {
              const item = OPTIONS[status]
              const active = status === selected
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(status)}
                  className={`status-choice ${active ? 'is-active' : ''}`}
                  data-tone={item.tone}
                >
                  <span className="status-choice-icon"><item.Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[12.5px] font-extrabold" style={{ color: 'var(--ink)' }}>{item.label}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{item.effects[0]}</span>
                  </span>
                  <span className="status-choice-tick" aria-hidden="true">{active && <Check className="h-3 w-3" />}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Altura animada: a lista de efeitos e o motivo abrem sem tranco. */}
        <div className="collapse-y" data-open={Boolean(option)} inert={!option}>
          <div>
            {option && (
              <div className="space-y-4 pt-1">
                <ul className="status-effects">
                  {option.effects.map((effect) => (
                    <li key={effect}>{effect}</li>
                  ))}
                </ul>
                <TextAreaField
                  label={option.reason === 'required' ? 'Motivo' : 'Observação'}
                  hint={option.reason === 'required' ? 'Obrigatório. Fica no histórico do contrato.' : 'Opcional'}
                  rows={2}
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={selected === 'cancelado' ? 'Ex.: cliente desistiu, paciente recebeu alta antes' : 'Ex.: equipamento devolvido em bom estado'}
                />
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
