import React, { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { CalendarEvent, CalendarEventType, Contract, Equipment, Invoice, Lead, User } from '../types'
import { Modal } from './ui/Modal'

interface CalendarEventDialogProps {
  open: boolean
  event: CalendarEvent | null
  initialDate: string
  leads: Lead[]
  contracts: Contract[]
  equipments: Equipment[]
  invoices: Invoice[]
  team: User[]
  currentUserId: string
  onClose: () => void
  onSaved: (message: string) => void
}

const EMPTY = (date: string) => ({
  title: '',
  type: 'compromisso' as CalendarEventType,
  date,
  startTime: '',
  endTime: '',
  endDate: '',
  leadId: '',
  contractId: '',
  equipmentId: '',
  invoiceId: '',
  assignedTo: '',
  notes: '',
  status: 'scheduled' as CalendarEvent['status'],
})

const TYPE_LABEL: Record<CalendarEventType, string> = {
  compromisso: 'Compromisso', entrega: 'Entrega', retirada: 'Retirada',
  visita: 'Visita', ligacao: 'Ligação', cobranca: 'Cobrança', manutencao: 'Manutenção',
}

export const CalendarEventDialog: React.FC<CalendarEventDialogProps> = ({
  open, event, initialDate, leads, contracts, equipments, invoices, team, currentUserId, onClose, onSaved,
}) => {
  const [form, setForm] = useState(EMPTY(initialDate))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(event ? {
      title: event.title,
      type: event.type,
      date: event.date,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      endDate: event.endDate || '',
      leadId: event.leadId || '',
      contractId: event.contractId || '',
      equipmentId: event.equipmentId || '',
      invoiceId: event.invoiceId || '',
      assignedTo: event.assignedTo || '',
      notes: event.notes || '',
      status: event.status || 'scheduled',
    } : { ...EMPTY(initialDate), assignedTo: currentUserId })
  }, [open, event, initialDate, currentUserId])

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const save = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(event ? `/api/calendar/events/${event.id}` : '/api/calendar/events', {
        method: event ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          ...form,
          leadId: form.leadId || null,
          contractId: form.contractId || null,
          equipmentId: form.equipmentId || null,
          endDate: form.endDate || null,
          invoiceId: form.invoiceId || null,
          assignedTo: form.assignedTo || null,
          status: form.status,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o compromisso.')
      onSaved(event ? 'Compromisso atualizado.' : 'Compromisso adicionado à agenda.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o compromisso.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!event || !window.confirm('Remover este compromisso da agenda?')) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      if (!response.ok) throw new Error('Não foi possível remover o compromisso.')
      onSaved('Compromisso removido da agenda.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível remover o compromisso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? 'Editar compromisso' : 'Novo compromisso'}
      subtitle="O compromisso fica salvo na agenda do CRM."
      icon={<CalendarDays className="h-4 w-4" />}
      size="lg"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {event ? <button type="button" className="yr-dialog-delete" onClick={remove} disabled={saving}>Remover compromisso</button> : <span />}
          <div className="flex justify-end gap-2">
            <button type="button" className="yr-dialog-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" form="yr-calendar-event-form" className="yr-dialog-primary" disabled={saving}>{saving ? 'Salvando…' : event ? 'Salvar alterações' : 'Adicionar à agenda'}</button>
          </div>
        </div>
      )}
    >
      <form id="yr-calendar-event-form" onSubmit={save} className="yr-calendar-form">
        {error && <p className="yr-calendar-form__error" role="alert">{error}</p>}
        <label className="yr-calendar-field yr-calendar-field--wide"><span>Título</span><input autoFocus required maxLength={100} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Ex.: Confirmar entrega com o cliente" /></label>
        <label className="yr-calendar-field"><span>Tipo</span><select value={form.type} onChange={(event) => { const type = event.target.value as CalendarEventType; setForm((current) => ({ ...current, type, endDate: type === 'manutencao' ? current.endDate : '', invoiceId: type === 'cobranca' ? current.invoiceId : '' })) }}>{Object.entries(TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="yr-calendar-field"><span>Data</span><input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} /></label>
        {form.type === 'manutencao' && <label className="yr-calendar-field"><span>Até <small>período de indisponibilidade</small></span><input type="date" min={form.date} value={form.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>}
        <label className="yr-calendar-field"><span>Início <small>opcional</small></span><input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} /></label>
        <label className="yr-calendar-field"><span>Fim <small>opcional</small></span><input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} /></label>
        <label className="yr-calendar-field"><span>Cliente <small>opcional</small></span><select value={form.leadId} onChange={(event) => setForm((current) => ({ ...current, leadId: event.target.value, contractId: '', equipmentId: '' }))}><option value="">Sem vínculo com cliente</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
        <label className="yr-calendar-field"><span>Contrato <small>opcional</small></span><select value={form.contractId} onChange={(event) => { const contractId = event.target.value; const contract = contracts.find((item) => item.id === contractId); setForm((current) => ({ ...current, contractId, leadId: contract?.leadId || current.leadId, equipmentId: contractId ? (contract?.equipmentIds?.[0] || '') : '' })) }}><option value="">Sem contrato</option>{contracts.filter((contract) => contract.status !== 'cancelado' && (!form.leadId || contract.leadId === form.leadId)).map((contract) => <option key={contract.id} value={contract.id}>{contract.number} · {contract.clientName}</option>)}</select></label>
        <label className="yr-calendar-field yr-calendar-field--wide"><span>Equipamento <small>opcional</small></span><select value={form.equipmentId} onChange={(event) => update('equipmentId', event.target.value)}><option value="">Sem equipamento vinculado</option>{equipments.filter((equipment) => !form.contractId || contracts.find((contract) => contract.id === form.contractId)?.equipmentIds?.includes(equipment.id)).map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.name} · {equipment.serialNumber}</option>)}</select></label>
        <label className="yr-calendar-field"><span>Responsável</span><select value={form.assignedTo} onChange={(event) => update('assignedTo', event.target.value)}><option value="">Sem responsável</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label className="yr-calendar-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="scheduled">Agendado</option><option value="done">Concluído</option><option value="cancelled">Cancelado</option></select></label>
        {form.type === 'cobranca' && <label className="yr-calendar-field yr-calendar-field--wide"><span>Fatura existente <small>opcional · evita duplicar o vencimento derivado</small></span><select value={form.invoiceId} onChange={(event) => setForm((current) => { const invoice = invoices.find((item) => item.id === event.target.value); const contract = invoice && contracts.find((item) => item.number === invoice.contractNumber); return { ...current, invoiceId: event.target.value, ...(invoice ? { date: invoice.dueDate, leadId: invoice.leadId || contract?.leadId || current.leadId, contractId: contract?.id || current.contractId, equipmentId: contract?.equipmentIds?.[0] || current.equipmentId } : {}) } })}><option value="">Sem fatura vinculada</option>{invoices.filter((invoice) => invoice.status === 'pendente' || invoice.status === 'atrasada').map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.contractNumber} · {invoice.clientName} · {invoice.dueDate}</option>)}</select></label>}
        <label className="yr-calendar-field yr-calendar-field--wide"><span>Observações <small>opcional</small></span><textarea maxLength={600} rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Informações úteis para a equipe" /></label>
      </form>
    </Modal>
  )
}
