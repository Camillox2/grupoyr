import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Download,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  Phone,
  Search,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { Contract, Lead } from '../types'
import { buildClientRecords, digitsOnly, normalizedText } from '../lib/clientRecords'
import { PageHeader } from './ui/PageHeader'
import { Toast, useToast } from './ui/Toast'
import { brl } from './ui/Feedback'

interface ClientsViewProps {
  leads: Lead[]
  contracts: Contract[]
  onOpenConversation: (leadId: string) => void
}

interface ClientAttachment {
  id: string
  leadId: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Não informado'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  pendente_assinatura: 'Aguardando assinatura',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
  encerrado: 'Encerrado',
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
})

export const ClientsView = ({ leads, contracts, onOpenConversation }: ClientsViewProps) => {
  const clients = useMemo(() => buildClientRecords(leads, contracts), [leads, contracts])
  const [search, setSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [attachmentsState, setAttachmentsState] = useState<{ key: string; items: ClientAttachment[]; error: string } | null>(null)
  const [attachmentRefresh, setAttachmentRefresh] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  const filteredClients = useMemo(() => {
    const query = normalizedText(search)
    if (!query) return clients
    const queryDigits = digitsOnly(query)
    return clients.filter((client) => {
      const searchable = [
        client.name,
        client.phone,
        client.email,
        client.cpf,
        ...client.contracts.map((contract) => `${contract.number} ${contract.equipmentNames}`),
      ].map(normalizedText).join(' ')
      return searchable.includes(query) || (queryDigits.length > 2
        && (digitsOnly(client.phone).includes(queryDigits) || digitsOnly(client.cpf).includes(queryDigits)))
    })
  }, [clients, search])

  const selectedClient = filteredClients.find((client) => client.id === selectedClientId) || filteredClients[0] || null
  const attachmentOwnerIds = selectedClient?.leadIds.join('|') || ''
  const attachmentRequestKey = `${attachmentOwnerIds}:${attachmentRefresh}`
  const currentAttachments = attachmentsState?.key === attachmentRequestKey ? attachmentsState : null
  const attachments = currentAttachments?.items || []
  const attachmentsError = currentAttachments?.error || ''
  const attachmentsLoading = Boolean(attachmentOwnerIds) && !currentAttachments

  useEffect(() => {
    const leadIds = attachmentOwnerIds.split('|').filter(Boolean)
    const controller = new AbortController()
    if (leadIds.length === 0) return () => controller.abort()

    Promise.all(leadIds.map(async (leadId) => {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/attachments`, {
        headers: authHeaders(),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Não foi possível carregar os anexos deste cliente.')
      const data = await response.json()
      if (!Array.isArray(data)) return []
      return data.map((item: Omit<ClientAttachment, 'leadId'>) => ({ ...item, leadId }))
    }))
      .then((items) => {
        if (!controller.signal.aborted) {
          setAttachmentsState({
            key: attachmentRequestKey,
            items: items.flat().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
            error: '',
          })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAttachmentsState({
            key: attachmentRequestKey,
            items: [],
            error: error instanceof Error ? error.message : 'Falha ao carregar anexos.',
          })
        }
      })

    return () => controller.abort()
  }, [attachmentOwnerIds, attachmentRefresh, attachmentRequestKey])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    const leadId = selectedClient?.lead?.id || selectedClient?.leadIds[0]
    if (!file || !leadId) return
    if (file.size > 15 * 1024 * 1024) {
      showToast({ tone: 'alert', message: 'O anexo deve ter até 15 MB.' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/attachments`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível anexar este arquivo.')
      showToast({ tone: 'ok', message: 'Anexo salvo na ficha do cliente.' })
      setAttachmentRefresh((value) => value + 1)
    } catch (error) {
      showToast({ tone: 'alert', message: error instanceof Error ? error.message : 'Falha ao enviar o anexo.' })
    } finally {
      setUploading(false)
    }
  }

  const downloadAttachment = async (attachment: ClientAttachment) => {
    if (downloadingId) return
    setDownloadingId(attachment.id)
    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(attachment.leadId)}/attachments/${encodeURIComponent(attachment.id)}`,
        { headers: authHeaders() },
      )
      if (!response.ok) throw new Error('Não foi possível baixar este anexo.')
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.fileName.replace(/[\\/\r\n"]+/g, '_')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      showToast({ tone: 'alert', message: error instanceof Error ? error.message : 'Falha ao baixar o anexo.' })
    } finally {
      setDownloadingId('')
    }
  }

  const activeContracts = clients.reduce((total, client) => (
    total + client.contracts.filter((contract) => !['cancelado', 'encerrado'].includes(contract.status)).length
  ), 0)

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        icon={<UsersRound className="h-5 w-5" />}
        eyebrow="Relacionamento"
        title="Clientes"
        description="Clientes e contratos reunidos em uma ficha, com anexos e acesso rápido ao atendimento."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Clientes cadastrados</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{clients.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contratos vinculados</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{contracts.length}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contratos em andamento</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">{activeContracts}</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(270px,340px)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Lista de clientes">
          <div className="border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, telefone, CPF ou contrato"
                aria-label="Buscar clientes"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{filteredClients.length} de {clients.length} clientes</p>
          </div>
          <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {filteredClients.map((client) => {
              const active = selectedClient?.id === client.id
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedClientId(client.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full min-w-0 items-start gap-3 px-4 py-3.5 text-left transition-colors ${active ? 'bg-blue-50/80 dark:bg-blue-950/35' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><UserRound className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{client.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{client.phone || client.email || 'Sem telefone cadastrado'}</span>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{client.contracts.length} {client.contracts.length === 1 ? 'contrato' : 'contratos'}</span>
                  </span>
                </button>
              )
            })}
            {filteredClients.length === 0 && (
              <div className="px-5 py-10 text-center">
                <UsersRound className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{clients.length === 0 ? 'Ainda não há clientes' : 'Nenhum cliente encontrado'}</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">{clients.length === 0 ? 'Ao gerar um contrato, o cliente aparecerá aqui automaticamente.' : 'Tente buscar por outro nome, telefone ou número de contrato.'}</p>
              </div>
            )}
          </div>
        </section>

        {selectedClient ? (
          <section className="min-w-0 space-y-4" aria-label={`Ficha de ${selectedClient.name}`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-slate-900 dark:text-white">{selectedClient.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">Cliente desde {formatDate(selectedClient.contracts[0]?.createdAt || selectedClient.lead?.createdAt)}</p>
                  </div>
                </div>
                {selectedClient.lead && (
                  <button type="button" onClick={() => onOpenConversation(selectedClient.lead!.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 px-3.5 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
                    <MessageCircle className="h-4 w-4" /> Abrir atendimento
                  </button>
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contato</p>
                  <div className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                    <p className="flex min-w-0 items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{selectedClient.phone || 'Telefone não informado'}</span></p>
                    <p className="flex min-w-0 items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{selectedClient.email || 'E-mail não informado'}</span></p>
                    <p className="flex min-w-0 items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">CPF/CNPJ: {selectedClient.cpf || 'Não informado'}</span></p>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Entrega e necessidade</p>
                  <div className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                    <p className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="break-words">{selectedClient.lead?.address || selectedClient.contracts[0]?.address || 'Endereço não informado'}</span></p>
                    <p className="flex min-w-0 items-start gap-2"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>Entrega: {formatDate(selectedClient.lead?.deliveryDate)}</span></p>
                    <p className="flex min-w-0 items-start gap-2"><Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="break-words">{selectedClient.lead?.equipmentInterest || selectedClient.contracts[0]?.equipmentNames || 'Equipamento não informado'}</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><FileText className="h-4 w-4 text-blue-600" />Contratos</h3><p className="mt-1 text-[11px] text-slate-500">Histórico e situação das contratações.</p></div>
                <span className="shrink-0 text-xs font-semibold text-slate-500">{selectedClient.contracts.length} registrados</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedClient.contracts.map((contract: Contract) => (
                  <div key={contract.id} className="flex min-w-0 flex-col gap-2 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-900 dark:text-white">{contract.number}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{statusLabels[contract.status] || 'Em andamento'}</span></div>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-300">{contract.equipmentNames || 'Equipamento não informado'}</p>
                    <p className="text-[11px] text-slate-500">{contract.type === 'locacao' ? 'Locação' : 'Venda'} · {formatDate(contract.startDate)} a {formatDate(contract.endDate)} · {brl(contract.monthlyValue)}</p>
                  </div>
                ))}
                {selectedClient.contracts.length === 0 && <p className="px-5 py-6 text-xs text-slate-500">Cliente no funil; ainda não há contrato vinculado.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Paperclip className="h-4 w-4 text-blue-600" />Anexos do cliente</h3><p className="mt-1 text-[11px] text-slate-500">Arquivos reunidos a partir dos cadastros vinculados.</p></div>
                <div>
                  <input ref={fileInputRef} type="file" className="sr-only" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx" onChange={handleUpload} aria-label="Selecionar anexo para o cliente" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || selectedClient.leadIds.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Upload className="h-4 w-4" />{uploading ? 'Enviando…' : 'Adicionar anexo'}</button>
                </div>
              </div>
              {attachmentsError && <p className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">{attachmentsError}</p>}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {attachmentsLoading ? <p className="px-5 py-6 text-xs text-slate-500">Carregando anexos…</p> : attachments.map((attachment) => (
                  <div key={attachment.id} className="flex min-w-0 items-center gap-3 px-5 py-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><FileText className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{attachment.fileName}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(attachment.createdAt)} · {formatFileSize(attachment.size)}</p></div>
                    <button type="button" onClick={() => void downloadAttachment(attachment)} disabled={Boolean(downloadingId)} aria-label={`Baixar ${attachment.fileName}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Download className="h-4 w-4" /></button>
                  </div>
                ))}
                {!attachmentsLoading && !attachmentsError && attachments.length === 0 && <p className="px-5 py-6 text-xs text-slate-500">Nenhum anexo cadastrado para este cliente ainda.</p>}
                {!attachmentsLoading && attachmentOwnerIds === '' && <p className="px-5 py-3 text-[11px] text-slate-500">Este contrato antigo não tem ficha de lead vinculada para anexos.</p>}
              </div>
              <p className="border-t border-slate-100 px-5 py-3 text-[10px] leading-4 text-slate-400 dark:border-slate-800">JPG, PNG, WebP, GIF, PDF, DOC/DOCX, XLS/XLSX e TXT; até 15 MB por arquivo.</p>
            </div>
          </section>
        ) : (
          <section className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div><UsersRound className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{clients.length === 0 ? 'A ficha do primeiro cliente aparecerá aqui' : 'Nenhum cliente corresponde à busca'}</p><p className="mt-1 text-xs text-slate-500">{clients.length === 0 ? 'Gere um contrato para criar automaticamente o vínculo do cliente.' : 'Limpe a busca para voltar à lista completa.'}</p></div>
          </section>
        )}
      </div>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
