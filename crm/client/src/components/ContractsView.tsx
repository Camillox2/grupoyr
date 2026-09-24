import React, { useState, useRef, useEffect } from 'react'
import {
  FileSignature,
  Plus,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  Printer,
  ShieldCheck,
  Trash2,
  Copy,
  Send,
  Workflow,
  MessageSquare,
  Clock3,
} from 'lucide-react'
import { Contract, Lead } from '../types'
import { celebrateSignature } from './ui/celebrate'
import { PageHeader, Notice, ActionButton } from './ui/PageHeader'
import { EmptyState } from './ui/ResponsiveTable'
import { ContractStatus } from './ui/Status'
import { brl } from './ui/Feedback'
import { Toast, useToast } from './ui/Toast'
import { authHeaders } from '../lib/conversation'
import { ContractStatusModal } from './ContractStatusModal'
import { Modal } from './ui/Modal'
import { getContractCountdown, useLocalDateKey } from '../lib/contractCountdown'

/** dd/mm sem o ano, que ocupa espaco e raramente muda dentro da lista. */
const formatDate = (value: string) => {
  if (!value) return '-'
  // Data pura (YYYY-MM-DD) parseada direto vira meia-noite UTC e, em
  // America/Sao_Paulo, retrocede um dia. O servidor faz o mesmo em
  // contracts.js:19.
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type ContractChecklistItem = {
  id: string
  label: string
  done: boolean
  required: boolean
}

const getContractChecklist = (contract: Contract, lead?: Lead): ContractChecklistItem[] => {
  const address = lead?.addressData
  const hasAddress = Boolean(
    (address?.street && address.number && address.city) ||
      (contract.address && !/não informado|curitiba - pr/i.test(contract.address)),
  )
  const quoteItems = lead?.quoteItems || []
  const hasItems = quoteItems.length > 0
    ? quoteItems.every((item) => item.unitPrice > 0)
    : Boolean(contract.equipmentNames && contract.monthlyValue > 0)

  return [
    { id: 'cliente', label: 'CPF ou CNPJ do cliente', done: Boolean((lead?.cpf || contract.clientCpf || '').replace(/[^\d]/g, '').length >= 11), required: true },
    { id: 'endereco', label: 'Endereço de entrega completo', done: hasAddress, required: true },
    { id: 'acesso', label: 'Acesso até o quarto definido', done: Boolean(lead?.access && lead.access !== 'nao_sei'), required: true },
    { id: 'itens', label: 'Produto e valor definidos', done: hasItems, required: true },
    { id: 'entrega', label: 'Data de entrega combinada', done: Boolean(lead?.deliveryDate || contract.startDate), required: true },
    { id: 'periodo', label: 'Período de locação definido', done: contract.type === 'venda' || Number(lead?.rentalMonths) >= 1 || contract.startDate !== contract.endDate, required: contract.type === 'locacao' },
    { id: 'proposta_aceita', label: 'Cliente aceitou a proposta', done: lead?.checklist?.proposta_aceita === true, required: true },
    { id: 'documento_conferido', label: 'Documento do cliente conferido', done: lead?.checklist?.documento_conferido === true, required: true },
    { id: 'pagamento_combinado', label: 'Forma de pagamento combinada', done: lead?.checklist?.pagamento_combinado === true, required: true },
    { id: 'acesso_confirmado', label: 'Medidas de porta e escada confirmadas', done: lead?.checklist?.acesso_confirmado === true, required: false },
  ]
}

const copyText = async (value: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Alguns tunnels e navegadores bloqueiam a Clipboard API. Tenta o fallback abaixo.
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

interface ContractsViewProps {
  contracts: Contract[]
  leads: Lead[]
  onRefreshContracts: () => void
  onOpenNewContractModal: () => void
  /** Abre a conversa do lead no atendimento. */
  onOpenLead?: (leadId: string) => void
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  contracts,
  leads,
  onRefreshContracts,
  onOpenNewContractModal,
  onOpenLead,
}) => {
  const { toast, show: showToast, dismiss: dismissToast } = useToast()
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null)
  const [statusContract, setStatusContract] = useState<Contract | null>(null)
  const [shareContract, setShareContract] = useState<Contract | null>(null)
  const [previewContract, setPreviewContract] = useState<Contract | null>(null)
  const [checklistContract, setChecklistContract] = useState<Contract | null>(null)
  const today = useLocalDateKey()
  const [shareCopied, setShareCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  // Manda o link de assinatura direto no WhatsApp do lead do contrato.
  const handleSendLink = async (contract: Contract) => {
    if (sendingLinkId) return
    setSendingLinkId(contract.id)
    try {
      const response = await fetch(`/api/contracts/${contract.id}/send-link`, { method: 'POST', headers: authHeaders() })
      const data = await response.json().catch(() => null)
      const openChat = data?.leadId && onOpenLead ? { label: 'Abrir conversa', onClick: () => onOpenLead(data.leadId) } : undefined
      if (!response.ok) {
        setShareContract(contract)
        showToast({
          tone: 'alert',
          message: data?.error || 'Não foi possível enviar o link.',
          action: data?.code === 'window_closed' && onOpenLead ? { label: 'Abrir conversa', onClick: () => onOpenLead(contract.leadId) } : undefined,
        })
        return
      }
      if (!data.delivered) {
        setShareContract(contract)
      }
      showToast(
        data.delivered
          ? { tone: 'ok', message: `Link de assinatura enviado para ${contract.clientName} pelo WhatsApp.`, action: openChat }
          : { tone: 'wait', message: 'O WhatsApp está desconectado: o link ficou registrado na conversa, mas ainda não saiu.', action: openChat },
      )
      onRefreshContracts()
    } catch {
      showToast({ tone: 'alert', message: 'Falha de comunicação com o servidor.' })
    } finally {
      setSendingLinkId(null)
    }
  }

  const [signingContract, setSigningContract] = useState<Contract | null>(null)
  const [signerName, setSignerName] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const signatureReadyRef = useRef(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [submittingSign, setSubmittingSign] = useState(false)
  const [publicBaseUrl, setPublicBaseUrl] = useState('')
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const setSignatureReady = (ready: boolean) => {
    signatureReadyRef.current = ready
    setHasSignature(ready)
  }

  // Ajusta o quadro ao tamanho real, inclusive no celular e em telas de alta densidade.
  useEffect(() => {
    if (!signingContract || !canvasRef.current) return

    const canvas = canvasRef.current
    let initialized = false
    const configureCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
      const width = Math.round(rect.width * pixelRatio)
      const height = Math.round(rect.height * pixelRatio)
      const canvasSizeChanged = canvas.width !== width || canvas.height !== height
      const hadSignature = canvasSizeChanged && initialized && signatureReadyRef.current
      const previousSignature = hadSignature
        ? canvas.toDataURL('image/png')
        : null
      if (canvasSizeChanged) {
        canvas.width = width
        canvas.height = height
      }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (previousSignature) {
          const image = new Image()
          image.onload = () => {
            ctx.drawImage(image, 0, 0, rect.width, rect.height)
            ctx.beginPath()
          }
          image.src = previousSignature
        } else if (hadSignature) {
          setSignatureReady(false)
          setSignError('O quadro foi redimensionado. Desenhe a assinatura novamente.')
        }
      }
      initialized = true
    }

    const frame = window.requestAnimationFrame(configureCanvas)
    window.addEventListener('resize', configureCanvas)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', configureCanvas)
    }
  }, [signingContract])

  useEffect(() => {
    fetch('/api/runtime/public-url', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPublicBaseUrl(data?.url || ''))
      .catch(() => setPublicBaseUrl(''))
  }, [])

  const getSigningUrl = (contract: Contract) => {
    if (!contract.signingToken) return ''
    const baseUrl = (publicBaseUrl || window.location.origin).replace(/\/$/, '')
    return `${baseUrl}/assinar/${encodeURIComponent(contract.signingToken)}`
  }

  const getContractHtmlUrl = (contract: Contract) => contract.signingToken
    ? `/api/contracts/signing/${encodeURIComponent(contract.signingToken)}/html`
    : `/api/contracts/${contract.id}/html`

  const handleCopySigningLink = async (contract: Contract) => {
    const signingUrl = getSigningUrl(contract)
    if (!signingUrl) {
      setLinkError('Este contrato ainda não possui um link de assinatura. Atualize a lista e tente novamente.')
      return
    }

    try {
      const copied = await copyText(signingUrl)
      if (!copied) throw new Error('clipboard unavailable')
      setCopiedLinkId(contract.id)
      setLinkError(null)
      setTimeout(() => setCopiedLinkId(null), 3500)
    } catch (error) {
      console.error('Erro ao copiar link de assinatura:', error)
      setLinkError('Não foi possível copiar o link. Abra o documento e copie o endereço do navegador.')
    }
  }

  const openSigningDialog = (contract: Contract) => {
    setSigningContract(contract)
    setSignerName(contract.clientName || '')
    setSignatureReady(false)
    setIsDrawing(false)
    setSignError(null)
  }

  const closeSigningDialog = () => {
    if (submittingSign) return
    setSigningContract(null)
    setSignerName('')
    setSignatureReady(false)
    setIsDrawing(false)
    setSignError(null)
  }

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
    if (!signatureReadyRef.current) setSignatureReady(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureReady(false)
    setSignError(null)
  }

  const handleSignSubmit = async () => {
    if (!signingContract || !canvasRef.current || !hasSignature) return
    setSubmittingSign(true)
    setSignError(null)

    const signatureDataUrl = canvasRef.current.toDataURL('image/png')

    try {
      const res = await fetch(`/api/contracts/${signingContract.id}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          signatureDataUrl,
          signerName: signerName || signingContract.clientName,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSignError(data?.error || 'Não foi possível registrar a assinatura. Confira os dados e tente novamente.')
        return
      }

      if (res.ok) {
        setSigningContract(null)
        setSignerName('')
        setSignatureReady(false)
        setIsDrawing(false)
        onRefreshContracts()
        celebrateSignature()
      }
    } catch (e) {
      console.error('Erro ao assinar contrato:', e)
      setSignError('Falha de comunicação com o servidor. A assinatura não foi registrada.')
    } finally {
      setSubmittingSign(false)
    }
  }

  const renderContractActions = (contract: Contract) => (
    <>
      {contract.status === 'pendente_assinatura' && (
        <button
          onClick={() => handleSendLink(contract)}
          disabled={sendingLinkId === contract.id || !contract.leadId}
          className="inline-flex min-w-[132px] items-center justify-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors disabled:opacity-50"
          style={{ background: 'var(--ok-surface)', color: 'var(--ok)', border: '1px solid var(--ok-border)' }}
          title={contract.leadId ? 'Manda o link de assinatura no WhatsApp do cliente deste contrato' : 'Contrato sem contato vinculado'}
        >
          <Send className="h-3.5 w-3.5" />
          {sendingLinkId === contract.id ? 'Enviando' : contract.linkSentAt ? 'Reenviar ao cliente' : 'Enviar ao cliente'}
        </button>
      )}

      {contract.status === 'pendente_assinatura' && (
        <button
          onClick={() => handleCopySigningLink(contract)}
          disabled={!contract.signingToken}
          className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors disabled:opacity-40"
          style={{ background: 'var(--yr-050)', color: 'var(--yr-700)', border: '1px solid var(--yr-100)' }}
          title="Copiar o link para o cliente assinar no celular"
        >
          {copiedLinkId === contract.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedLinkId === contract.id ? 'Copiado' : 'Copiar link'}
        </button>
      )}

      <button
        onClick={() => {
          setShareError(null)
          setShareCopied(false)
          setShareContract(contract)
        }}
        disabled={!contract.signingToken}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors disabled:opacity-40"
        style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)', border: '1px solid var(--border-subtle)' }}
        title="Abrir as opções de envio e compartilhamento"
      >
        <Send className="h-3.5 w-3.5" />
        Compartilhar
      </button>

      <button
        onClick={() => setPreviewContract(contract)}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
        style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)', border: '1px solid var(--border-subtle)' }}
        title="Ver o template preenchido do contrato"
      >
        <Eye className="h-3.5 w-3.5" />
        Ver contrato
      </button>

      <button
        onClick={() => setChecklistContract(contract)}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
        style={{ background: 'var(--yr-050)', color: 'var(--yr-700)', border: '1px solid var(--yr-100)' }}
        title="Conferir o checklist de fechamento deste contrato"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Checklist
      </button>

      {contract.status === 'pendente_assinatura' && (
        <button
          onClick={() => openSigningDialog(contract)}
          className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
          style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
        >
          Assinar na tela
        </button>
      )}

      {onOpenLead && contract.leadId && (
        <button
          onClick={() => onOpenLead(contract.leadId)}
          className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
          style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)', border: '1px solid var(--border-subtle)' }}
          title="Abrir a conversa deste cliente no atendimento"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Conversa
        </button>
      )}

      {(contract.nextStatuses?.length ?? 0) > 0 && (
        <button
          onClick={() => setStatusContract(contract)}
          className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
          style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}
          title="Cancelar, encerrar ou reativar este contrato"
        >
          <Workflow className="h-3.5 w-3.5" />
          Status
        </button>
      )}
    </>
  )

  return (
    <div className="pb-12">
      <PageHeader
        icon={<FileSignature className="h-5 w-5" />}
        eyebrow="Contratos"
        title="Contratos e assinatura"
        description="Gere o termo, colha a assinatura na tela ou mande o link direto no WhatsApp do cliente. O status muda pelo botão Status de cada contrato."
        actions={
          <ActionButton onClick={onOpenNewContractModal}>
            <Plus className="h-4 w-4" />
            Gerar contrato
          </ActionButton>
        }
      />

      <Notice tone={publicBaseUrl ? 'ok' : 'wait'}>
        {publicBaseUrl
          ? `Link externo pronto para envio ao cliente: ${publicBaseUrl}`
          : 'Tunnel público não detectado. O link copiado funciona apenas neste computador até o launcher iniciar um tunnel.'}
      </Notice>

      {linkError && <Notice tone="alert">{linkError}</Notice>}

      {contracts.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="h-5 w-5" />}
          title="Nenhum contrato ainda"
          description="Gere o primeiro termo a partir de um lead do funil. Ele nasce como rascunho e segue para assinatura."
          action={(
            <ActionButton onClick={onOpenNewContractModal}>
              <Plus className="h-4 w-4" />
              Gerar contrato
            </ActionButton>
          )}
        />
      ) : (
        <section className="yr-contract-list" aria-label="Contratos gerados">
          {contracts.map((contract) => {
            const countdown = getContractCountdown(contract, today)
            return (
              <article className="yr-contract-card" key={contract.id}>
                <header className="yr-contract-card__head">
                  <div className="yr-contract-card__identity">
                    <p>Contrato</p>
                    <strong>{contract.number}</strong>
                    <h3>{contract.clientName}</h3>
                    {contract.clientCpf && <span>CPF {contract.clientCpf}</span>}
                  </div>
                  <div className="yr-contract-card__status" aria-label={`Status ${contract.status}`}>
                    <ContractStatus status={contract.status} />
                    {countdown && (
                      <span className={`yr-contract-countdown is-${countdown.phase}`}>
                        <Clock3 aria-hidden="true" />
                        {countdown.label}
                      </span>
                    )}
                    {contract.statusReason && (contract.status === 'cancelado' || contract.status === 'encerrado') && (
                      <span className="yr-contract-card__reason" title={contract.statusReason}>{contract.statusReason}</span>
                    )}
                  </div>
                </header>

                <dl className="yr-contract-card__facts">
                  <div className="yr-contract-card__fact yr-contract-card__fact--equipment">
                    <dt>Equipamento</dt>
                    <dd title={contract.equipmentNames}>{contract.equipmentNames || 'Não informado'}</dd>
                  </div>
                  <div className="yr-contract-card__fact">
                    <dt>Vigência</dt>
                    <dd className="tnum">{formatDate(contract.startDate)} a {formatDate(contract.endDate)}</dd>
                  </div>
                  <div className="yr-contract-card__fact yr-contract-card__fact--amount">
                    <dt>Valor mensal</dt>
                    <dd className="tnum">{brl(contract.monthlyValue)}</dd>
                  </div>
                </dl>

                <footer className="yr-contract-card__footer" aria-label={`Ações do contrato ${contract.number}`}>
                  <div className="yr-contract-card__actions">{renderContractActions(contract)}</div>
                </footer>
              </article>
            )
          })}
        </section>
      )}

      <ContractStatusModal
        contract={statusContract}
        onClose={() => setStatusContract(null)}
        onChanged={(summary) => {
          showToast({ tone: 'ok', message: summary })
          onRefreshContracts()
        }}
      />
      <Toast toast={toast} onDismiss={dismissToast} />

      {shareContract && (
        <Modal
          open
          onClose={() => setShareContract(null)}
          title={`Enviar ${shareContract.number}`}
          subtitle={`Link de assinatura para ${shareContract.clientName}`}
          icon={<Send className="h-4 w-4" />}
          size="md"
          footer={(
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareContract(null)}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = shareContract
                  setShareContract(null)
                  void handleSendLink(current)
                }}
                disabled={sendingLinkId === shareContract.id}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:opacity-50"
                style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
              >
                <Send className="h-3.5 w-3.5" />
                {sendingLinkId === shareContract.id ? 'Enviando...' : 'Enviar pelo WhatsApp'}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              Copie o endereço abaixo e envie por WhatsApp, e-mail ou outro canal. O cliente abre o link no celular, confere o contrato e assina na própria tela.
            </p>
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-faint)' }}>
                Link público de assinatura
              </label>
              <input
                readOnly
                value={getSigningUrl(shareContract)}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-xl border px-3 py-3 text-[12px] font-semibold outline-none"
                style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border-subtle)', color: 'var(--ink)' }}
              />
            </div>
            {shareError && <p className="text-xs font-semibold" style={{ color: 'var(--alert)' }}>{shareError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const copied = await copyText(getSigningUrl(shareContract))
                  if (copied) {
                    setShareCopied(true)
                    setShareError(null)
                    window.setTimeout(() => setShareCopied(false), 3500)
                  } else {
                    setShareError('Não foi possível copiar automaticamente. Clique no campo, selecione o endereço e use Ctrl+C.')
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-extrabold"
                style={{ background: 'var(--yr-050)', borderColor: 'var(--yr-100)', color: 'var(--yr-700)' }}
              >
                {shareCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {shareCopied ? 'Link copiado' : 'Copiar link'}
              </button>
              <a
                href={getSigningUrl(shareContract)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-extrabold"
                style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir link
              </a>
            </div>
          </div>
        </Modal>
      )}

      {previewContract && (
        <Modal
          open
          onClose={() => setPreviewContract(null)}
          title={`Template do contrato ${previewContract.number}`}
          subtitle={`${previewContract.clientName} · confira antes de enviar ou imprimir`}
          icon={<Eye className="h-4 w-4" />}
          size="lg"
          footer={(
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewContract(null)}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
              >
                Fechar
              </button>
              <a
                href={getContractHtmlUrl(previewContract)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold"
                style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
              >
                <Printer className="h-3.5 w-3.5" />
                Abrir para imprimir
              </a>
            </div>
          )}
        >
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-subtle)', background: '#fff' }}>
            <iframe
              title={`Template preenchido do contrato ${previewContract.number}`}
              src={getContractHtmlUrl(previewContract)}
              className="h-[58vh] min-h-[420px] w-full bg-white sm:h-[62vh]"
            />
          </div>
        </Modal>
      )}

      {checklistContract && (
        <Modal
          open
          onClose={() => setChecklistContract(null)}
          title={`Checklist ${checklistContract.number}`}
          subtitle={`Conferência de fechamento · ${checklistContract.clientName}`}
          icon={<ClipboardList className="h-4 w-4" />}
          size="md"
          footer={(
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setChecklistContract(null)}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
              >
                Fechar
              </button>
            </div>
          )}
        >
          {(() => {
            const lead = leads.find((item) => item.id === checklistContract.leadId)
            const items = getContractChecklist(checklistContract, lead)
            const done = items.filter((item) => item.done).length
            const requiredMissing = items.filter((item) => item.required && !item.done).length
            return (
              <div className="space-y-4">
                <div className="rounded-xl border p-3.5" style={{ background: requiredMissing ? 'var(--wait-surface)' : 'var(--ok-surface)', borderColor: requiredMissing ? 'var(--wait-border)' : 'var(--ok-border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-extrabold" style={{ color: requiredMissing ? 'var(--wait)' : 'var(--ok)' }}>
                      {requiredMissing ? `${requiredMissing} item(ns) obrigatório(s) pendente(s)` : 'Checklist obrigatório completo'}
                    </span>
                    <span className="tnum text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>{done}/{items.length}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-raised)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((done / items.length) * 100)}%`, background: requiredMissing ? 'var(--wait)' : 'var(--ok)' }} />
                  </div>
                </div>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-sunken)' }}>
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: item.done ? 'var(--ok)' : 'var(--surface-raised)', color: item.done ? 'var(--ink-on-brand)' : 'var(--ink-faint)', border: item.done ? 'none' : '1px solid var(--border-strong)' }}>
                        {item.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />}
                      </span>
                      <span className="min-w-0 text-[12.5px] font-semibold" style={{ color: item.done ? 'var(--ink)' : 'var(--ink-muted)' }}>
                        {item.label}
                        {!item.required && <em className="ml-1 not-italic text-[11px]" style={{ color: 'var(--ink-faint)' }}>opcional</em>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
        </Modal>
      )}

      {signingContract && (
        <Modal
          open
          onClose={closeSigningDialog}
          title={`Assinatura do contrato ${signingContract.number}`}
          subtitle={signingContract.clientName}
          icon={<FileSignature className="h-4 w-4" />}
          size="md"
          footer={(
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeSigningDialog}
                disabled={submittingSign}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-50"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!hasSignature || submittingSign}
                onClick={handleSignSubmit}
                className="rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
              >
                {submittingSign ? 'Registrando...' : 'Confirmar assinatura'}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="contract-signer-name" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-faint)' }}>
                Nome de quem assina
              </label>
              <input
                id="contract-signer-name"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-[13px] font-semibold outline-none focus-visible:ring-2"
                style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border-subtle)', color: 'var(--ink)' }}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label id="contract-signature-label" className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>
                  Desenhe a assinatura no quadro
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold"
                  style={{ color: 'var(--alert)' }}
                  aria-label="Limpar assinatura"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Limpar
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border-2 border-dashed" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border-strong)' }}>
                <canvas
                  ref={canvasRef}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                  onLostPointerCapture={stopDrawing}
                  className="block h-[150px] w-full touch-none"
                  aria-labelledby="contract-signature-label"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                Use o dedo ou o mouse. A assinatura fica habilitada depois que um traço for desenhado.
              </p>
            </div>

            {signError && <Notice tone="alert">{signError}</Notice>}

            <div className="flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed" style={{ background: 'var(--yr-050)', borderColor: 'var(--yr-100)', color: 'var(--yr-700)' }}>
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                A assinatura é vinculada ao registro digital do contrato com data e hora. Confira os dados antes de confirmar.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
