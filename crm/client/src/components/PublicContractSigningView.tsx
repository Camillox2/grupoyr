import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileSignature, LoaderCircle, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { Contract } from '../types'

interface PublicContractSigningViewProps {
  token: string
}

const formatCurrency = (value: number) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Não informado'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

export const PublicContractSigningView: React.FC<PublicContractSigningViewProps> = ({ token }) => {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const documentUrl = `/api/contracts/signing/${encodeURIComponent(token)}/html`

  useEffect(() => {
    fetch(`/api/contracts/signing/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Link de assinatura inválido ou expirado.')
        return data.contract as Contract
      })
      .then((data) => {
        setContract(data)
        setSignerName(data.clientName || '')
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o contrato.'))
      .finally(() => setLoading(false))
  }, [token])

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const point = getCanvasPoint(event)
    if (!canvas || !point) return
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')
    if (!context) return
    context.beginPath()
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const point = getCanvasPoint(event)
    const context = canvasRef.current?.getContext('2d')
    if (!point || !context) return
    context.lineTo(point.x, point.y)
    context.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => setIsDrawing(false)

  const clearSignature = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    context.strokeStyle = '#0f172a'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }, [contract])

  const handleSubmit = async () => {
    if (!contract || contract.status === 'assinado' || !hasSignature || !accepted || !signerName.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/contracts/signing/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureDataUrl: canvasRef.current?.toDataURL('image/png'),
          signerName: signerName.trim(),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível registrar a assinatura.')
      setContract(data.contract)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a assinatura.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#edf3f8] flex items-center justify-center text-slate-600">
        <div className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle className="h-5 w-5 animate-spin text-blue-600" /> Carregando contrato...</div>
      </div>
    )
  }

  if (error && !contract) {
    return (
      <div className="min-h-screen bg-[#edf3f8] flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-7 text-center shadow-sm">
          <XCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">Não foi possível abrir o contrato</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!contract) return null

  const isSigned = contract.status === 'assinado'

  return (
    <div className="min-h-screen bg-[#edf3f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <img src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg" alt="Grupo YR Hospitalar" className="h-11 w-11 rounded-xl border border-slate-200 object-contain" />
          <div>
            <p className="text-sm font-bold text-[#102a4c]">Grupo YR Hospitalar</p>
            <p className="text-xs text-slate-500">Assinatura eletrônica de contrato</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div>
              <h1 className="text-base font-bold text-slate-900">Contrato {contract.number}</h1>
              <p className="mt-0.5 text-xs text-slate-500">Confira todo o documento antes de assinar.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${isSigned ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {isSigned ? 'Assinado' : 'Aguardando assinatura'}
            </span>
          </div>
          <iframe title={`Contrato ${contract.number}`} src={documentUrl} className="h-[min(72vh,780px)] w-full bg-white" />
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-bold">Resumo da contratação</h2>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Contratante</dt><dd className="text-right font-semibold">{contract.clientName}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Equipamento</dt><dd className="text-right font-semibold">{contract.equipmentNames}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Vigência</dt><dd className="text-right font-semibold">{formatDate(contract.startDate)} a {formatDate(contract.endDate)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Valor</dt><dd className="text-right font-bold text-emerald-600">{formatCurrency(contract.monthlyValue)}</dd></div>
            </dl>
          </div>

          {isSigned ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <h2 className="mt-3 text-sm font-bold text-emerald-900">Contrato assinado com sucesso</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-800">A assinatura foi registrada em {formatDate(contract.signedAt)}. Você pode abrir o documento final abaixo.</p>
              <a href={documentUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">Abrir documento final</a>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold">Assinar contrato</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Use o dedo no celular ou o mouse para desenhar sua assinatura.</p>

              <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="public-signer-name">Nome completo</label>
              <input id="public-signer-name" value={signerName} onChange={(event) => setSignerName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />

              <div className="mt-4 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">Assinatura</label>
                <button type="button" onClick={clearSignature} className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Limpar</button>
              </div>
              <div className="mt-1 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={220}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                  onPointerLeave={stopDrawing}
                  className="aspect-[800/220] w-full touch-none"
                  aria-label="Quadro para desenhar assinatura"
                />
              </div>

              <label className="mt-4 flex items-start gap-2 text-[11px] leading-4 text-slate-600">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
                <span>Declaro que li o contrato completo, conferi meus dados e concordo com as condições apresentadas.</span>
              </label>

              {error && <p className="mt-3 text-xs font-semibold text-rose-600" role="alert">{error}</p>}
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-4 text-blue-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>O CRM registra o horário, o nome informado, o IP e o hash SHA-256 do documento assinado.</span>
              </div>
              <button type="button" onClick={handleSubmit} disabled={!hasSignature || !accepted || !signerName.trim() || submitting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
                {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {submitting ? 'Registrando assinatura...' : 'Confirmar e assinar'}
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
