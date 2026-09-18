import React, { useState, useRef, useEffect } from 'react'
import {
  FileSignature,
  Plus,
  CheckCircle2,
  Printer,
  ShieldCheck,
  Trash2,
  X,
  Copy,
} from 'lucide-react'
import { Contract, Lead, Equipment } from '../types'
import { celebrateSignature } from './ui/celebrate'
import { PageHeader, Notice, ActionButton } from './ui/PageHeader'
import { ResponsiveTable, EmptyState } from './ui/ResponsiveTable'
import { ContractStatus } from './ui/Status'
import { brl } from './ui/Feedback'

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

interface ContractsViewProps {
  contracts: Contract[]
  leads: Lead[]
  equipments: Equipment[]
  onRefreshContracts: () => void
  onOpenNewContractModal: () => void
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  contracts,
  leads,
  equipments,
  onRefreshContracts,
  onOpenNewContractModal,
}) => {
  const [signingContract, setSigningContract] = useState<Contract | null>(null)
  const [signerName, setSignerName] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [submittingSign, setSubmittingSign] = useState(false)
  const [publicBaseUrl, setPublicBaseUrl] = useState('')
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  // Initialize canvas for signature
  useEffect(() => {
    if (signingContract && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
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

  const handleCopySigningLink = async (contract: Contract) => {
    const signingUrl = getSigningUrl(contract)
    if (!signingUrl) {
      setLinkError('Este contrato ainda não possui um link de assinatura. Atualize a lista e tente novamente.')
      return
    }

    try {
      await navigator.clipboard.writeText(signingUrl)
      setCopiedLinkId(contract.id)
      setLinkError(null)
      setTimeout(() => setCopiedLinkId(null), 3500)
    } catch (error) {
      console.error('Erro ao copiar link de assinatura:', error)
      setLinkError('Não foi possível copiar o link. Abra o documento e copie o endereço do navegador.')
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
    setHasSignature(true)
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
    setHasSignature(false)
  }

  const handleSignSubmit = async () => {
    if (!signingContract || !canvasRef.current || !hasSignature) return
    setSubmittingSign(true)

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

      if (res.ok) {
        setSigningContract(null)
        clearCanvas()
        onRefreshContracts()
        celebrateSignature()
      }
    } catch (e) {
      console.error('Erro ao assinar contrato:', e)
    } finally {
      setSubmittingSign(false)
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        icon={<FileSignature className="h-5 w-5" />}
        eyebrow="Contratos"
        title="Contratos e assinatura"
        description="Gere o termo, colha a assinatura na tela ou envie o link para o celular do cliente."
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

      <ResponsiveTable
        items={contracts}
        getKey={(contract) => contract.id}
        caption="Contratos gerados"
        empty={
          <EmptyState
            icon={<FileSignature className="h-5 w-5" />}
            title="Nenhum contrato ainda"
            description="Gere o primeiro termo a partir de um lead do funil. Ele nasce como rascunho e segue para assinatura."
            action={
              <ActionButton onClick={onOpenNewContractModal}>
                <Plus className="h-4 w-4" />
                Gerar contrato
              </ActionButton>
            }
          />
        }
        columns={[
          {
            header: 'Contrato',
            primary: true,
            cell: (contract) => (
              <span className="font-mono font-bold" style={{ color: 'var(--yr-500)' }}>
                {contract.number}
              </span>
            ),
          },
          {
            header: 'Cliente',
            secondary: true,
            cell: (contract) => (
              <span>
                {contract.clientName}
                {contract.clientCpf && (
                  <span className="tnum" style={{ color: 'var(--ink-faint)' }}>
                    {' '}· CPF {contract.clientCpf}
                  </span>
                )}
              </span>
            ),
          },
          {
            header: 'Equipamento',
            cell: (contract) => (
              <span className="block max-w-xs truncate" title={contract.equipmentNames}>
                {contract.equipmentNames}
              </span>
            ),
          },
          {
            header: 'Vigência',
            cell: (contract) => (
              <span className="tnum whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
                {formatDate(contract.startDate)} a {formatDate(contract.endDate)}
              </span>
            ),
          },
          {
            header: 'Valor mensal',
            align: 'right',
            cell: (contract) => (
              <span className="tnum font-bold" style={{ color: 'var(--ink)' }}>
                {brl(contract.monthlyValue)}
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (contract) => <ContractStatus status={contract.status} />,
          },
        ]}
        actions={(contract) => (
          <>
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

            {contract.status !== 'assinado' && (
              <button
                onClick={() => {
                  setSigningContract(contract)
                  setSignerName(contract.clientName)
                }}
                className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
                style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
              >
                Assinar na tela
              </button>
            )}

            <a
              href={
                contract.signingToken
                  ? `/api/contracts/signing/${encodeURIComponent(contract.signingToken)}/html`
                  : `/api/contracts/${contract.id}/html`
              }
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
              style={{
                background: 'var(--surface-sunken)',
                color: 'var(--ink-muted)',
                border: '1px solid var(--border-subtle)',
              }}
              title="Abrir o contrato completo para conferir ou imprimir"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </a>
          </>
        )}
      />

      {/* Signature Modal */}
      {signingContract && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Assinatura Digital do Contrato
                </h3>
                <p className="text-xs text-slate-500">{signingContract.number} • {signingContract.clientName}</p>
              </div>
              <button
                onClick={() => setSigningContract(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome do Signatário
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                placeholder="Nome completo de quem está assinando"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Desenhe sua assinatura no quadro abaixo (touch ou mouse):
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-[10px] text-rose-500 hover:underline flex items-center gap-0.5 font-semibold"
                >
                  <Trash2 className="w-3 h-3" /> Limpar
                </button>
              </div>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-950 overflow-hidden cursor-crosshair">
                <canvas
                  ref={canvasRef}
                  width={380}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-[150px] touch-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                A assinatura será vinculada a um hash criptográfico SHA-256 com registro de data/hora oficial e endereço IP para validade jurídica.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSigningContract(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!hasSignature || submittingSign}
                onClick={handleSignSubmit}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-emerald-500/20"
              >
                {submittingSign ? 'Registrando...' : 'Confirmar & Assinar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
