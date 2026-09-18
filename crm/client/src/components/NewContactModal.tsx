import React, { useState } from 'react'
import { Info, UserPlus } from 'lucide-react'
import type { Lead, TemplateSelection } from '../types'
import { authHeaders, maskPhone } from '../lib/conversation'
import { Modal } from './ui/Modal'
import { TextField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'
import { TemplatePicker } from './TemplatePicker'

interface NewContactModalProps {
  open: boolean
  onClose: () => void
  /** 'meta' libera o disparo de template; no Baileys o contato so e criado. */
  provider: 'baileys' | 'meta'
  onCreated: (lead: Lead) => void
}

export const NewContactModal: React.FC<NewContactModalProps> = ({ open, onClose, provider, onCreated }) => {
  const isMeta = provider === 'meta'
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [withTemplate, setWithTemplate] = useState(true)
  const [selection, setSelection] = useState<TemplateSelection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Contato ja criado nesta abertura: se o template falhar, tenta so o envio.
  const [created, setCreated] = useState<Lead | null>(null)

  const sendsTemplate = isMeta && withTemplate

  const close = () => {
    if (loading) return
    // Se o contato ja existe, quem chamou precisa saber mesmo sem o template.
    if (created) onCreated(created)
    setName('')
    setPhone('')
    setSelection(null)
    setCreated(null)
    setError(null)
    setWithTemplate(true)
    onClose()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading) return
    if (sendsTemplate && !selection?.ready) {
      setError('Escolha o template e preencha as variáveis, ou desligue o envio de template.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      let lead = created
      if (!lead) {
        const response = await fetch('/api/whatsapp/contacts', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ name, phone }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          setError(data?.error || 'Não foi possível adicionar o contato.')
          return
        }
        lead = data.lead as Lead
        setCreated(lead)
      }

      if (sendsTemplate && selection) {
        const response = await fetch('/api/whatsapp/send-template', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ leadId: lead.id, ...selection }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          setError(`O contato foi adicionado, mas o template não saiu: ${data?.error || 'erro desconhecido'}`)
          return
        }
      }

      onCreated(lead)
      setName('')
      setPhone('')
      setSelection(null)
      setCreated(null)
      setWithTemplate(true)
      onClose()
    } catch {
      setError('Falha de comunicação com o servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const firstName = name.trim().split(/\s+/)[0] || ''
  const suggestions = [...new Set([firstName, name.trim()].filter(Boolean))]

  return (
    <Modal
      open={open}
      onClose={close}
      title="Novo contato"
      subtitle={isMeta ? 'Adiciona o contato e já abre a conversa com um template' : 'Adiciona o contato à lista de conversas'}
      icon={<UserPlus className="h-4 w-4" />}
      size={isMeta ? 'lg' : 'md'}
      footer={
        <div className="flex gap-3">
          <SubmitButton variant="ghost" type="button" loading={false} onClick={close} className="flex-1">
            {created ? 'Fechar' : 'Cancelar'}
          </SubmitButton>
          <SubmitButton type="submit" form="form-novo-contato" loading={loading} className="flex-[2]">
            {created ? 'Tentar o envio de novo' : sendsTemplate ? 'Adicionar e enviar template' : 'Adicionar contato'}
          </SubmitButton>
        </div>
      }
    >
      <form id="form-novo-contato" onSubmit={submit} className="space-y-4">
        <FormError message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nome"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Marta Oliveira"
            autoComplete="off"
            maxLength={120}
            disabled={Boolean(created)}
          />
          <TextField
            label="WhatsApp"
            required
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(maskPhone(event.target.value))}
            placeholder="(41) 99999-0000"
            autoComplete="off"
            hint="Com DDD. Sem o 55, o Brasil é assumido."
            disabled={Boolean(created)}
          />
        </div>

        {isMeta ? (
          <>
            <label className="tpl-switch">
              <input type="checkbox" checked={withTemplate} onChange={(event) => setWithTemplate(event.target.checked)} />
              <span className="tpl-switch-track" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[12px] font-extrabold" style={{ color: 'var(--ink)' }}>Enviar um template agora</span>
                <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  Pela regra da Meta, a primeira mensagem para quem ainda não escreveu precisa ser um template aprovado.
                </span>
              </span>
            </label>
            <div className="collapse-y" data-open={withTemplate} inert={!withTemplate}>
              <div>
                {/* Fica montado mesmo recolhido: desmontar no clique deixaria a caixa vazia fechando. */}
                {open && <TemplatePicker onChange={setSelection} suggestions={suggestions} />}
              </div>
            </div>
          </>
        ) : (
          <div className="tpl-note">
            <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--busy)' }} />
            <p>
              No Baileys o contato é só adicionado. Template é recurso da API oficial da Meta. Depois de adicionar, abra a conversa e escreva normalmente.
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
