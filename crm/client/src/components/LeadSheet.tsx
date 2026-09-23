import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CircleDashed,
  Download,
  FileSignature,
  FileText,
  LoaderCircle,
  MapPin,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Truck,
  User,
  X,
  Paperclip,
} from 'lucide-react'
import { Lead, QuoteItem, LeadAddress, LeadAccess, LeadAttachment } from '../types'
import { brl } from './ui/Feedback'

/**
 * Ficha de fechamento: tudo que falta entre a conversa e o contrato.
 *
 * O contrato do servidor ja lia `lead.cpf` e `lead.address`, mas nenhuma tela
 * preenchia esses campos: todo contrato saia com "Nao informado" e
 * "Curitiba - PR". Aqui o atendente registra cliente, endereco, acesso, itens,
 * entrega e frete enquanto conversa, e o checklist diz o que ainda falta.
 *
 * A ficha salva sozinha (com atraso curto apos a ultima tecla). O servidor
 * saneia tudo de novo: esta tela nao e a linha de defesa.
 */

// Mesmo catalogo do site. `rent: false` = sai apenas em compra.
// O codigo identifica o modelo; a quantidade identifica quantas unidades
// entram na cotacao, sem perder a rastreabilidade de cada patrimonio.
const CATALOG: { name: string; code: string; rent: boolean }[] = [
  { name: 'Cama elétrica luxo', code: 'YR-CAM-ELE', rent: true },
  { name: 'Cama manual 3 movimentos', code: 'YR-CAM-MAN-3M', rent: true },
  { name: 'Colchão pneumático', code: 'YR-COL-PNE', rent: false },
  { name: 'Cadeira de banho', code: 'YR-CAD-BAN', rent: true },
]
const canRent = (name: string) => CATALOG.find((item) => item.name === name)?.rent ?? true
const productCodeFor = (name: string) => CATALOG.find((item) => item.name === name)?.code ?? ''

const ACCESS: { id: LeadAccess; label: string }[] = [
  { id: 'terreo', label: 'Térreo' },
  { id: 'escada', label: 'Escada' },
  { id: 'elevador', label: 'Elevador' },
  { id: 'nao_sei', label: 'Não sei' },
]

const MANUAL: { id: string; label: string; required: boolean }[] = [
  { id: 'proposta_aceita', label: 'Cliente aceitou a proposta', required: true },
  { id: 'documento_conferido', label: 'Documento do cliente conferido', required: true },
  { id: 'pagamento_combinado', label: 'Forma de pagamento combinada', required: true },
  { id: 'acesso_confirmado', label: 'Medidas de porta e escada confirmadas', required: false },
]

const EMPTY_ADDRESS: LeadAddress = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' }

interface SheetState {
  cpf: string
  email: string
  addressData: LeadAddress
  access: LeadAccess
  floor: string
  quoteItems: QuoteItem[]
  freight: string
  rentalMonths: string
  deliveryDate: string
  deliveryNotes: string
  internalNotes: string
  checklist: Record<string, boolean>
}

const fromLead = (lead: Lead): SheetState => ({
  cpf: lead.cpf ?? '',
  email: lead.email ?? '',
  addressData: { ...EMPTY_ADDRESS, ...(lead.addressData ?? {}) },
  access: lead.access ?? 'nao_sei',
  floor: lead.floor ?? '',
  quoteItems:
    lead.quoteItems && lead.quoteItems.length > 0
      ? lead.quoteItems.map((item) => ({
          ...item,
          productCode: item.productCode || productCodeFor(item.product),
        }))
      : CATALOG.some((item) => item.name === lead.equipmentInterest)
        ? [
            {
              product: lead.equipmentInterest,
              productCode: productCodeFor(lead.equipmentInterest),
              modality: canRent(lead.equipmentInterest) && lead.modality === 'locacao' ? 'locacao' : 'compra',
              qty: 1,
              unitPrice: lead.value || 0,
            },
          ]
        : [],
  freight: lead.freight ? String(lead.freight) : '',
  rentalMonths: lead.rentalMonths ? String(lead.rentalMonths) : '',
  deliveryDate: lead.deliveryDate ?? '',
  deliveryNotes: lead.deliveryNotes ?? '',
  internalNotes: lead.internalNotes ?? lead.notes ?? '',
  checklist: { ...(lead.checklist ?? {}) },
})

interface LeadSheetProps {
  lead: Lead
  aiSummary: string | null
  generatingSummary: boolean
  onGenerateSummary: () => void
  onContractCreated?: () => void
  onClose?: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
})

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character])

const Section: React.FC<{ icon: React.ReactNode; title: string; done?: boolean; children: React.ReactNode }> = ({
  icon,
  title,
  done,
  children,
}) => (
  <section className="sheet-section">
    <h4>
      <span className="sheet-section-icon">{icon}</span>
      {title}
      {done !== undefined && (
        <span className={`sheet-dot ${done ? 'is-done' : ''}`} aria-label={done ? 'completo' : 'pendente'}>
          {done ? <Check className="h-3 w-3" /> : null}
        </span>
      )}
    </h4>
    {children}
  </section>
)

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean }> = ({
  label,
  wide,
  ...rest
}) => (
  <label className={`sheet-field ${wide ? 'is-wide' : ''}`}>
    <span>{label}</span>
    <input {...rest} className="field-control sheet-input" />
  </label>
)

export const LeadSheet: React.FC<LeadSheetProps> = ({
  lead,
  aiSummary,
  generatingSummary,
  onGenerateSummary,
  onContractCreated,
  onClose,
}) => {
  const [state, setState] = useState<SheetState>(() => fromLead(lead))
  const [save, setSave] = useState<SaveState>('idle')
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound'>('idle')
  const [creating, setCreating] = useState(false)
  const [contractError, setContractError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<LeadAttachment[]>([])
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  // Recarrega a ficha so quando troca de LEAD. O mesmo lead chega de novo a
  // cada evento de socket; recarregar nesses casos apagaria o que esta sendo
  // digitado.
  useEffect(() => {
    setState(fromLead(lead))
    setSave('idle')
    setContractError(null)
    setAttachments([])
    setAttachmentError(null)
    dirty.current = false
    fetch(`/api/leads/${encodeURIComponent(lead.id)}/attachments`, { headers: authHeaders() })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setAttachments(Array.isArray(data) ? data : []))
      .catch(() => setAttachmentError('Não foi possível carregar os anexos deste cliente.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  const patch = (partial: Partial<SheetState>) => {
    dirty.current = true
    setState((current) => ({ ...current, ...partial }))
  }

  const persist = async (): Promise<boolean> => {
    const current = stateRef.current
    setSave('saving')
    try {
      const response = await fetch(`/api/leads/${lead.id}/details`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          ...current,
          freight: Number(current.freight) || 0,
          rentalMonths: Number(current.rentalMonths) || 0,
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      dirty.current = false
      setSave('saved')
      return true
    } catch {
      setSave('error')
      return false
    }
  }

  // Salva sozinha, 900ms depois da ultima alteracao.
  useEffect(() => {
    if (!dirty.current) return undefined
    const timer = window.setTimeout(persist, 900)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // CEP completo preenche rua, bairro, cidade e UF. A resposta vem de fora,
  // entao so entram strings, com tamanho limitado.
  const lookupCep = async (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepStatus('loading')
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await response.json()
      if (!response.ok || data.erro) {
        setCepStatus('notfound')
        return
      }
      const pick = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')
      patch({
        addressData: {
          ...stateRef.current.addressData,
          cep: `${digits.slice(0, 5)}-${digits.slice(5)}`,
          street: pick(data.logradouro, 120) || stateRef.current.addressData.street,
          district: pick(data.bairro, 80) || stateRef.current.addressData.district,
          city: pick(data.localidade, 80) || stateRef.current.addressData.city,
          state: pick(data.uf, 2) || stateRef.current.addressData.state,
        },
      })
      setCepStatus('idle')
    } catch {
      // Sem internet ou servico fora: o atendente preenche na mao, sem drama.
      setCepStatus('idle')
    }
  }

  const setAddress = (partial: Partial<LeadAddress>) => patch({ addressData: { ...state.addressData, ...partial } })

  const setItem = (index: number, partial: Partial<QuoteItem>) =>
    patch({
      quoteItems: state.quoteItems.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...partial }
        if (!canRent(next.product)) next.modality = 'compra'
        return next
      }),
    })

  const addItem = (product: string) => {
    const entry = CATALOG.find((item) => item.name === product)
    if (!entry) return
    patch({
      quoteItems: [
        ...state.quoteItems,
        { product: entry.name, productCode: entry.code, modality: entry.rent ? 'locacao' : 'compra', qty: 1, unitPrice: 0 },
      ],
    })
  }

  const removeItem = (index: number) => patch({ quoteItems: state.quoteItems.filter((_, i) => i !== index) })

  const hasRental = state.quoteItems.some((item) => item.modality === 'locacao')
  const sumOf = (modality: QuoteItem['modality']) =>
    state.quoteItems
      .filter((item) => item.modality === modality)
      .reduce((total, item) => total + item.qty * (item.unitPrice || 0), 0)
  // Locacao se repete todo mes; compra e frete sao cobrados uma vez so.
  // Somar tudo como "valor mensal" cobraria o colchao todo mes.
  const rentalMonthly = sumOf('locacao')
  const purchaseTotal = sumOf('compra')
  const freight = Number(state.freight) || 0
  const oneTime = purchaseTotal + freight

  const checks = useMemo(() => {
    const address = state.addressData
    return [
      { id: 'cliente', label: 'CPF ou CNPJ do cliente', done: state.cpf.replace(/\D/g, '').length >= 11, required: true },
      { id: 'endereco', label: 'Endereço de entrega completo', done: Boolean(address.street && address.number && address.city), required: true },
      { id: 'acesso', label: 'Acesso até o quarto definido', done: state.access !== 'nao_sei', required: true },
      { id: 'itens', label: 'Produto e valor definidos', done: state.quoteItems.length > 0 && state.quoteItems.every((item) => item.unitPrice > 0), required: true },
      { id: 'entrega', label: 'Data de entrega combinada', done: Boolean(state.deliveryDate), required: true },
      ...(hasRental
        ? [{ id: 'periodo', label: 'Período de locação definido', done: Number(state.rentalMonths) >= 1, required: true }]
        : []),
      ...MANUAL.map((item) => ({ id: item.id, label: item.label, done: state.checklist[item.id] === true, required: item.required, manual: true })),
    ] as { id: string; label: string; done: boolean; required: boolean; manual?: boolean }[]
  }, [state, hasRental])

  const doneCount = checks.filter((item) => item.done).length
  const missing = checks.filter((item) => item.required && !item.done)
  const ready = missing.length === 0

  const uploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAttachmentBusy(true)
    setAttachmentError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
        body: form,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Não foi possível anexar o arquivo.')
      }
      const attachment = await response.json() as LeadAttachment
      setAttachments((current) => [attachment, ...current])
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Não foi possível anexar o arquivo.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const downloadChecklist = () => {
    const address = state.addressData
    const fullAddress = [
      [address.street, address.number].filter(Boolean).join(', '), address.complement,
      address.district, [address.city, address.state].filter(Boolean).join(' - '), address.cep,
    ].filter(Boolean).join(' · ') || 'Endereço não informado'
    const rows = checks.map((item) => `<tr><td>${item.done ? 'Concluído' : 'Pendente'}</td><td>${escapeHtml(item.label)}</td></tr>`).join('')
    const productRows = state.quoteItems.map((item) => `<tr><td>${escapeHtml(item.product)}</td><td>${escapeHtml(item.productCode || productCodeFor(item.product))}</td><td>${item.qty}</td><td>${item.modality === 'locacao' ? 'Locação' : 'Compra'}</td><td>${escapeHtml(brl(item.unitPrice * item.qty))}${item.modality === 'locacao' ? ' / mês' : ''}</td></tr>`).join('')
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Checklist de entrega - ${escapeHtml(lead.name)}</title><style>
      body{font:14px Arial,sans-serif;color:#15243a;margin:36px auto;padding:0 24px;max-width:850px}header{border-bottom:3px solid #1d5fae;padding-bottom:16px;margin-bottom:22px}h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;color:#164f91;margin:24px 0 8px}.muted{color:#65758b;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{border:1px solid #dce5ef;border-radius:9px;padding:12px;min-width:0}.label{display:block;color:#65758b;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce5ef;padding:8px;text-align:left}th{background:#eef4fb}.notes{white-space:pre-wrap}@media print{body{margin:12mm auto;padding:0}.no-print{display:none}}
      </style></head><body><header><h1>Checklist de entrega e atendimento</h1><div class="muted">Grupo YR Hospitalar · Gerado em ${new Date().toLocaleString('pt-BR')}</div></header>
      <h2>Cliente e local</h2><div class="grid"><div class="card"><span class="label">Cliente</span>${escapeHtml(lead.name)}</div><div class="card"><span class="label">Telefone</span>${escapeHtml(lead.phone)}</div><div class="card"><span class="label">CPF/CNPJ</span>${escapeHtml(state.cpf || 'Não informado')}</div><div class="card"><span class="label">E-mail</span>${escapeHtml(state.email || 'Não informado')}</div><div class="card" style="grid-column:1/-1"><span class="label">Endereço da entrega</span>${escapeHtml(fullAddress)}</div><div class="card"><span class="label">Acesso até o quarto</span>${escapeHtml(ACCESS.find((entry) => entry.id === state.access)?.label || 'Não definido')} ${escapeHtml(state.floor)}</div><div class="card"><span class="label">Data prevista da entrega</span>${escapeHtml(state.deliveryDate ? new Date(`${state.deliveryDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Não definida')}</div></div>
      <h2>Produtos e valores</h2><table><thead><tr><th>Produto</th><th>Código</th><th>Qtd.</th><th>Modalidade</th><th>Valor</th></tr></thead><tbody>${productRows || '<tr><td colspan="5">Nenhum produto informado.</td></tr>'}</tbody></table>
      <div class="grid" style="margin-top:10px"><div class="card"><span class="label">Frete</span>${escapeHtml(brl(freight))}</div><div class="card"><span class="label">Locação mensal</span>${escapeHtml(brl(rentalMonthly))}</div><div class="card"><span class="label">Compra</span>${escapeHtml(brl(purchaseTotal))}</div><div class="card"><span class="label">Primeira cobrança estimada</span>${escapeHtml(brl(rentalMonthly + oneTime))}</div><div class="card"><span class="label">Período da locação</span>${state.rentalMonths ? `${escapeHtml(state.rentalMonths)} mês(es)` : 'Não informado'}</div><div class="card"><span class="label">Observações de entrega</span>${escapeHtml(state.deliveryNotes || 'Nenhuma')}</div></div>
      <h2>Conferência operacional</h2><table><thead><tr><th>Status</th><th>Item</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Informações internas do cliente</h2><div class="card notes">${escapeHtml(state.internalNotes || 'Nenhuma informação registrada.')}</div><p class="muted no-print">Para gerar PDF, use Imprimir → Salvar como PDF no navegador.</p></body></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    const base = lead.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    link.href = url
    link.download = `checklist-entrega-${base || 'cliente'}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  const createContract = async () => {
    if (!ready || creating) return
    setCreating(true)
    setContractError(null)
    try {
      // A ficha vai primeiro: o contrato le cpf e endereco direto do lead.
      if (!(await persist())) throw new Error('save')

      const start = state.deliveryDate || new Date().toISOString().split('T')[0]
      const end = new Date(`${start}T00:00:00`)
      end.setMonth(end.getMonth() + Math.max(1, Number(state.rentalMonths) || 1))

      const accessLabel = ACCESS.find((item) => item.id === state.access)?.label ?? ''
      const clauses = [
        hasRental && purchaseTotal > 0 ? `Itens de compra (cobrança única): ${brl(purchaseTotal)}.` : '',
        freight > 0 ? `Frete (cobrança única): ${brl(freight)}.` : 'Frete: sem custo informado.',
        `Entrega prevista: ${new Date(`${start}T00:00:00`).toLocaleDateString('pt-BR')}.`,
        `Acesso: ${accessLabel}${state.floor ? `, ${state.floor}` : ''}.`,
        state.deliveryNotes ? `Observações: ${state.deliveryNotes}` : '',
      ]
        .filter(Boolean)
        .join(' ')

      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          leadId: lead.id,
          type: hasRental ? 'locacao' : 'venda',
          equipmentIds: [],
          startDate: start,
          endDate: hasRental ? end.toISOString().split('T')[0] : start,
          // Com locacao, o valor do contrato e so a parte mensal. Sem locacao
          // (venda pura) o contrato leva o total da compra.
          monthlyValue: hasRental ? rentalMonthly : purchaseTotal,
          customClauses: clauses,
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const contract = await response.json()

      // O que e cobrado uma vez so vira fatura avulsa do mesmo contrato:
      // compra + frete quando ha locacao; so o frete na venda pura (o total
      // da compra ja foi na fatura que o servidor cria com o contrato).
      const extra = hasRental ? oneTime : freight
      if (extra > 0) {
        await fetch('/api/finance/invoices', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            contractNumber: contract.number,
            clientName: lead.name,
            leadId: lead.id,
            amount: extra,
            dueDate: start,
            status: 'pendente',
          }),
        })
      }
      onContractCreated?.()
    } catch {
      setContractError('Não foi possível gerar o contrato. Confira a conexão e tente de novo.')
    } finally {
      setCreating(false)
    }
  }

  const available = CATALOG.filter((entry) => !state.quoteItems.some((item) => item.product === entry.name))

  return (
    <aside className="sheet" aria-label="Ficha de fechamento">
      <header className="sheet-head">
        <div className="min-w-0">
          <p className="sheet-eyebrow">Ficha de fechamento</p>
          <h3 className="serif truncate">{lead.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`sheet-save is-${save}`} role="status">
            {save === 'saving' && 'Salvando…'}
            {save === 'saved' && 'Salvo'}
            {save === 'error' && 'Não salvou'}
          </span>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Fechar ficha" className="sheet-close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Progresso: quanto falta para o contrato poder nascer. */}
      <div className="sheet-progress" aria-hidden="true">
        <span style={{ width: `${(doneCount / checks.length) * 100}%` }} />
      </div>
      <p className="sheet-progress-label">
        {doneCount} de {checks.length} itens prontos
      </p>

      <div className="sheet-scroll">
        <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="Síntese da IA">
          <p className="sheet-summary">
            {(aiSummary ?? lead.aiSummary) || 'Ainda sem resumo desta conversa.'}
          </p>
          <button type="button" className="sheet-link" onClick={onGenerateSummary} disabled={generatingSummary}>
            {generatingSummary ? 'Gerando…' : 'Atualizar resumo'}
          </button>
        </Section>

        <Section icon={<User className="h-3.5 w-3.5" />} title="Cliente" done={checks[0].done}>
          <div className="sheet-grid">
            <Input label="CPF ou CNPJ" value={state.cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(event) => patch({ cpf: event.target.value })} />
            <Input label="E-mail" type="email" value={state.email} placeholder="cliente@email.com" onChange={(event) => patch({ email: event.target.value })} />
            <label className="sheet-field is-wide">
              <span>Informações internas do cliente</span>
              <textarea className="field-control sheet-input" rows={3} maxLength={3000} value={state.internalNotes} placeholder="Preferências, combinações e informações úteis para a equipe comercial" onChange={(event) => patch({ internalNotes: event.target.value })} />
            </label>
          </div>
        </Section>

        <Section icon={<MapPin className="h-3.5 w-3.5" />} title="Endereço e acesso" done={checks[1].done && checks[2].done}>
          <div className="sheet-grid">
            <Input
              label={cepStatus === 'loading' ? 'CEP (buscando…)' : cepStatus === 'notfound' ? 'CEP (não encontrado)' : 'CEP'}
              value={state.addressData.cep}
              inputMode="numeric"
              placeholder="80000-000"
              onChange={(event) => {
                setAddress({ cep: event.target.value })
                lookupCep(event.target.value)
              }}
            />
            <Input label="Número" value={state.addressData.number} onChange={(event) => setAddress({ number: event.target.value })} />
            <Input wide label="Rua" value={state.addressData.street} onChange={(event) => setAddress({ street: event.target.value })} />
            <Input label="Complemento" value={state.addressData.complement} placeholder="Apto, bloco" onChange={(event) => setAddress({ complement: event.target.value })} />
            <Input label="Bairro" value={state.addressData.district} onChange={(event) => setAddress({ district: event.target.value })} />
            <Input label="Cidade" value={state.addressData.city} onChange={(event) => setAddress({ city: event.target.value })} />
            <Input label="UF" value={state.addressData.state} maxLength={2} onChange={(event) => setAddress({ state: event.target.value.toUpperCase() })} />
          </div>

          <p className="sheet-sublabel">Como é o acesso até o quarto?</p>
          <div className="sheet-chips" role="group" aria-label="Acesso até o quarto">
            {ACCESS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={state.access === option.id}
                className={state.access === option.id ? 'is-on' : ''}
                onClick={() => patch({ access: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {state.access !== 'terreo' && state.access !== 'nao_sei' && (
            <div className="sheet-grid mt-2">
              <Input wide label="Andar ou detalhe do acesso" value={state.floor} placeholder="Ex.: 2º andar, escada estreita" onChange={(event) => patch({ floor: event.target.value })} />
            </div>
          )}
        </Section>

        <Section icon={<Package className="h-3.5 w-3.5" />} title="Produtos" done={checks[3].done}>
          {state.quoteItems.length === 0 && <p className="sheet-empty">Nenhum produto na cotação ainda.</p>}

          <ul className="sheet-items">
            {state.quoteItems.map((item, index) => (
              <li key={`${item.product}-${index}`}>
                <div className="sheet-item-head">
                  <div className="min-w-0">
                    <strong className="block truncate">{item.product}</strong>
                    <span className="mt-1 block font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                      Código: {item.productCode || productCodeFor(item.product) || 'PENDENTE'}
                    </span>
                  </div>
                  <button type="button" onClick={() => removeItem(index)} aria-label={`Remover ${item.product}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="sheet-item-row">
                  <label className="sheet-field">
                    <span>Modalidade</span>
                    <select
                      className="field-control sheet-input"
                      value={item.modality}
                      disabled={!canRent(item.product)}
                      onChange={(event) => setItem(index, { modality: event.target.value as QuoteItem['modality'] })}
                    >
                      {canRent(item.product) && <option value="locacao">Locação</option>}
                      <option value="compra">Compra</option>
                    </select>
                  </label>
                  <Input label="Quantidade" type="number" min={1} max={99} inputMode="numeric" value={item.qty} onChange={(event) => setItem(index, { qty: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} />
                  <Input
                    label={item.modality === 'locacao' ? 'R$ / mês' : 'R$ unidade'}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={item.unitPrice || ''}
                    placeholder="0,00"
                    onChange={(event) => setItem(index, { unitPrice: Number(event.target.value) || 0 })}
                  />
                </div>
                {!canRent(item.product) && <p className="sheet-note">Este item sai apenas em compra.</p>}
              </li>
            ))}
          </ul>

          {available.length > 0 && (
            <div className="sheet-add">
              {available.map((entry) => (
                <button key={entry.name} type="button" onClick={() => addItem(entry.name)}>
                  <Plus className="h-3 w-3" />
                  <span>{entry.name}</span>
                  <small className="font-mono text-[9px] opacity-70">{entry.code}</small>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section icon={<Truck className="h-3.5 w-3.5" />} title="Entrega e frete" done={checks[4].done}>
          <div className="sheet-grid">
            <Input label="Data de entrega" type="date" value={state.deliveryDate} onChange={(event) => patch({ deliveryDate: event.target.value })} />
            <Input label="Frete (R$)" type="number" min={0} step="0.01" inputMode="decimal" value={state.freight} placeholder="0,00" onChange={(event) => patch({ freight: event.target.value })} />
            {hasRental && (
              <Input label="Meses de locação" type="number" min={1} max={120} value={state.rentalMonths} placeholder="Ex.: 3" onChange={(event) => patch({ rentalMonths: event.target.value })} />
            )}
            <label className="sheet-field is-wide">
              <span>Observações da entrega</span>
              <textarea
                className="field-control sheet-input"
                rows={2}
                value={state.deliveryNotes}
                placeholder="Portaria, horário, quem recebe"
                onChange={(event) => patch({ deliveryNotes: event.target.value })}
              />
            </label>
          </div>
        </Section>

        <Section icon={<Check className="h-3.5 w-3.5" />} title="Checklist do contrato">
          <button type="button" onClick={downloadChecklist} className="mb-3 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50">
            <Download className="h-3.5 w-3.5" />Baixar checklist de entrega
          </button>
          <ul className="sheet-checklist">
            {checks.map((item) =>
              item.manual ? (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(event) => patch({ checklist: { ...state.checklist, [item.id]: event.target.checked } })}
                    />
                    <span className={`sheet-tick ${item.done ? 'is-done' : ''}`}>{item.done && <Check className="h-3 w-3" />}</span>
                    <span className={item.done ? 'is-struck' : ''}>
                      {item.label}
                      {!item.required && <em> (opcional)</em>}
                    </span>
                  </label>
                </li>
              ) : (
                <li key={item.id} className="is-auto">
                  <span className={`sheet-tick ${item.done ? 'is-done' : ''}`}>
                    {item.done ? <Check className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                  </span>
                  <span className={item.done ? 'is-struck' : ''}>{item.label}</span>
                </li>
              ),
            )}
          </ul>
        </Section>

        <Section icon={<Paperclip className="h-3.5 w-3.5" />} title="Arquivos do cliente">
          <input ref={attachmentInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={uploadAttachment} className="hidden" />
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">Anexe documentos, comprovantes e imagens úteis para este atendimento. Os arquivos ficam privados e só aparecem para usuários autenticados do CRM.</p>
          <button type="button" disabled={attachmentBusy} onClick={() => attachmentInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {attachmentBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {attachmentBusy ? 'Enviando arquivo…' : 'Adicionar arquivo'}
          </button>
          {attachmentError && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300">{attachmentError}</p>}
          {attachments.length === 0 ? <p className="sheet-empty mt-3">Nenhum arquivo anexado.</p> : (
            <ul className="mt-3 grid gap-2">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a href={`/api/leads/${encodeURIComponent(lead.id)}/attachments/${encodeURIComponent(attachment.id)}`} onClick={async (event) => {
                    event.preventDefault()
                    try {
                      const response = await fetch(event.currentTarget.href, { headers: authHeaders() })
                      if (!response.ok) throw new Error('download')
                      const url = URL.createObjectURL(await response.blob())
                      const link = document.createElement('a')
                      link.href = url
                      link.download = attachment.fileName
                      link.click()
                      URL.revokeObjectURL(url)
                    } catch {
                      setAttachmentError('Não foi possível baixar este arquivo.')
                    }
                  }} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900">
                    <FileText className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{attachment.fileName}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{(attachment.size / 1024 / 1024).toFixed(1)} MB</span>
                    <Download className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <footer className="sheet-foot">
        <dl>
          {rentalMonthly > 0 && (
            <div>
              <dt>Locação (todo mês)</dt>
              <dd className="tnum">{brl(rentalMonthly)}</dd>
            </div>
          )}
          {purchaseTotal > 0 && (
            <div>
              <dt>Compra (uma vez)</dt>
              <dd className="tnum">{brl(purchaseTotal)}</dd>
            </div>
          )}
          <div>
            <dt>Frete (uma vez)</dt>
            <dd className="tnum">{brl(freight)}</dd>
          </div>
          <div className="is-total">
            <dt>Primeira cobrança</dt>
            <dd className="tnum">{brl(rentalMonthly + oneTime)}</dd>
          </div>
        </dl>

        {contractError && <p className="sheet-error" role="alert">{contractError}</p>}

        <button type="button" className="action-btn action-btn--primary sheet-cta" disabled={!ready || creating} onClick={createContract}>
          {creating ? <LoaderCircle className="spin h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
          {ready ? 'Gerar contrato' : `Faltam ${missing.length} ${missing.length === 1 ? 'item' : 'itens'}`}
        </button>
      </footer>
    </aside>
  )
}
