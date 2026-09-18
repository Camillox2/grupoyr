import React, { useState } from 'react'
import { MessageSquareDashed } from 'lucide-react'
import type { Lead, TemplateSelection } from '../types'
import { authHeaders } from '../lib/conversation'
import { Modal } from './ui/Modal'
import { FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'
import { TemplatePicker } from './TemplatePicker'

interface SendTemplateModalProps {
  open: boolean
  onClose: () => void
  lead: Lead
}

/** Retoma uma conversa cuja janela de 24h da Meta fechou. */
export const SendTemplateModal: React.FC<SendTemplateModalProps> = ({ open, onClose, lead }) => {
  const [selection, setSelection] = useState<TemplateSelection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (loading) return
    setError(null)
    setSelection(null)
    onClose()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !selection?.ready) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ leadId: lead.id, ...selection }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || 'Não foi possível enviar o template.')
        return
      }
      // A mensagem chega na conversa pelo socket (message:new).
      setSelection(null)
      onClose()
    } catch {
      setError('Falha de comunicação com o servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const firstName = lead.name.trim().split(/\s+/)[0] || ''
  const suggestions = [...new Set([firstName, lead.name.trim()].filter(Boolean))]

  return (
    <Modal
      open={open}
      onClose={close}
      title="Enviar template"
      subtitle={`Para ${lead.name}. A conversa reabre quando o cliente responder.`}
      icon={<MessageSquareDashed className="h-4 w-4" />}
      size="lg"
      footer={
        <div className="flex gap-3">
          <SubmitButton variant="ghost" type="button" loading={false} onClick={close} className="flex-1">
            Cancelar
          </SubmitButton>
          <SubmitButton type="submit" form="form-enviar-template" loading={loading} disabled={!selection?.ready} className="flex-[2]">
            Enviar template
          </SubmitButton>
        </div>
      }
    >
      <form id="form-enviar-template" onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        {open && <TemplatePicker onChange={setSelection} suggestions={suggestions} />}
      </form>
    </Modal>
  )
}
