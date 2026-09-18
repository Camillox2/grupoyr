import React, { useState, useRef, useEffect } from 'react'
import {
  FileSignature,
  Plus,
  CheckCircle2,
  Clock,
  Printer,
  ShieldCheck,
  Trash2,
  X,
  Copy,
} from 'lucide-react'
import { Contract, Lead, Equipment } from '../types'

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
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
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
      }
    } catch (e) {
      console.error('Erro ao assinar contrato:', e)
    } finally {
      setSubmittingSign(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-blue-600" />
            Contratos & Assinatura Digital
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gere termos de locação com certificação ANVISA, colha assinaturas na tela ou envie link para o celular do cliente.
          </p>
        </div>

        <button
          onClick={onOpenNewContractModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Gerar Novo Contrato
        </button>
      </div>

      <div className={`rounded-2xl border p-3.5 text-xs ${publicBaseUrl
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
      }`}>
        {publicBaseUrl
          ? `Link externo pronto para envio ao cliente: ${publicBaseUrl}`
          : 'Tunnel público não detectado. O link copiado funcionará apenas neste computador até o launcher iniciar um tunnel.'}
      </div>

      {linkError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {linkError}
        </div>
      )}

      {/* Contracts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Nº Contrato</th>
                <th className="p-4">Cliente / Contratante</th>
                <th className="p-4">Equipamento(s)</th>
                <th className="p-4">Vigência</th>
                <th className="p-4">Valor Mensal</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contracts.map((ctr) => {
                const isSigned = ctr.status === 'assinado'
                return (
                  <tr
                    key={ctr.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {ctr.number}
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-white">
                      <div>{ctr.clientName}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        CPF: {ctr.clientCpf}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {ctr.equipmentNames}
                    </td>
                    <td className="p-4 text-slate-500">
                      {ctr.startDate} até {ctr.endDate}
                    </td>
                    <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {ctr.monthlyValue.toFixed(2)}
                    </td>
                    <td className="p-4">
                      {isSigned ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Assinado Digitalmente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3 text-amber-500" />
                          Aguardando Assinatura
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleCopySigningLink(ctr)}
                        disabled={!ctr.signingToken}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-semibold text-[11px] transition-all border border-blue-200 dark:border-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Copiar link individual para o cliente assinar no celular"
                      >
                        {copiedLinkId === ctr.id ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedLinkId === ctr.id ? 'Link copiado' : 'Copiar link'}
                      </button>

                      {!isSigned && (
                        <button
                          onClick={() => {
                            setSigningContract(ctr)
                            setSignerName(ctr.clientName)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shadow-sm transition-all"
                        >
                          Assinar na Tela
                        </button>
                      )}
                      <a
                        href={ctr.signingToken
                          ? `/api/contracts/signing/${encodeURIComponent(ctr.signingToken)}/html`
                          : `/api/contracts/${ctr.id}/html`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold text-[11px] transition-all border border-slate-200 dark:border-slate-700"
                        title="Ver ou Imprimir Contrato Completo"
                      >
                        <Printer className="w-3 h-3" />
                        Imprimir / PDF
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
