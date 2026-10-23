import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CircleDashed,
  Download,
  FileSignature,
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
import { Lead, QuoteItem, LeadAddress, LeadAccess, Equipment, Contract } from '../types'
import { brl } from './ui/Feedback'
import { displayContactName, maskPhone } from '../lib/conversation'
import { qualificationValue, qualificationLabel, mergeSheetDraft } from '../lib/qualification'
import { freightAmounts, addCalendarMonths } from '../lib/freight'
import { productCatalog } from '../lib/productCatalog'
import { LeadFiles } from './LeadFiles'
import { ContractQuickShare } from './ContractQuickShare'

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
// Initial legacy draft remains intact. Available choices/prices come from the
// actual equipment API, never a parallel hard-coded website catalog.
const productCodeFor = (_name: string) => ''

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
  name: string
  phone: string
  closingNotes: string
  cpf: string
  email: string
  addressData: LeadAddress
  access: LeadAccess
  floor: string
  quoteItems: QuoteItem[]
  deliveryFreight: string
  pickupFreight: string
  pickupFreightDueDate: string
  rentalMonths: string
  deliveryDate: string
  deliveryNotes: string
  checklist: Record<string, boolean>
}

const fromLead = (lead: Lead): SheetState => ({
  name: lead.name || '',
  phone: lead.phone || '',
  closingNotes: lead.closingNotes || '',
  cpf: lead.cpf ?? '',
  email: lead.email ?? '',
  addressData: Object.fromEntries(Object.keys(EMPTY_ADDRESS).map(key => [key, lead.addressData?.[key as keyof LeadAddress] || qualificationValue(lead.qualificationData, key)])) as unknown as LeadAddress,
  access: lead.access ?? 'nao_sei',
  floor: lead.floor ?? '',
  quoteItems:
    lead.quoteItems && lead.quoteItems.length > 0
      ? lead.quoteItems.map((item) => ({
          ...item,
          productCode: item.productCode || productCodeFor(item.product),
        }))
      : lead.equipmentInterest && lead.value > 0
        ? [
            {
              product: lead.equipmentInterest,
              productCode: productCodeFor(lead.equipmentInterest),
              modality: lead.modality === 'locacao' ? 'locacao' : 'compra',
              qty: 1,
              unitPrice: lead.value || 0,
            },
          ]
        : [],
  deliveryFreight: String(freightAmounts(lead).delivery || ''),
  pickupFreight: String(freightAmounts(lead).pickup || ''),
  pickupFreightDueDate: lead.pickupFreightDueDate || '',
  rentalMonths: lead.rentalMonths ? String(lead.rentalMonths) : '',
  deliveryDate: lead.deliveryDate ?? '',
  deliveryNotes: lead.deliveryNotes ?? '',
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
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogRefresh, setCatalogRefresh] = useState(0)
  const [createdContract, setCreatedContract] = useState<Contract | null>(null)
  const creationKey = useRef(crypto.randomUUID())
  const creatingRef = useRef(false)
  const scrollToShare = useCallback((element: HTMLDivElement | null) => {
    element?.scrollIntoView({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [])
  const catalog = useMemo(() => productCatalog(equipments), [equipments])
  const canRent = (name: string) => catalog.find(item => item.name === name)?.rent ?? true
  useEffect(() => {
    const controller = new AbortController()
    setCatalogStatus('loading')
    fetch('/api/equipments', { headers: authHeaders(), signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Catálogo indisponível')
      setEquipments(await response.json()); setCatalogStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setCatalogStatus('error') })
    return () => controller.abort()
  }, [catalogRefresh])
  const [contractError, setContractError] = useState<string | null>(null)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [downloadingChecklist, setDownloadingChecklist] = useState(false)
  const dirty = useRef(false)
  const edited = useRef(new Set<string>())
  const activeLeadId = useRef(lead.id)
  activeLeadId.current = lead.id
  const stateRef = useRef(state)
  stateRef.current = state

  // Recarrega a ficha so quando troca de LEAD. O mesmo lead chega de novo a
  // cada evento de socket; recarregar nesses casos apagaria o que esta sendo
  // digitado.
  useEffect(() => {
    setState(fromLead(lead))
    setSave('idle')
    setContractError(null)
    setCreatedContract(null)
    creationKey.current = crypto.randomUUID()
    dirty.current = false
    edited.current.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  useEffect(() => {
    setState(current => {
      const next = mergeSheetDraft(current, fromLead(lead), edited.current)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [lead])

  const patch = (partial: Partial<SheetState>) => {
    for (const key of Object.keys(partial) as (keyof SheetState)[]) {
      if (key === 'addressData') {
        for (const field of Object.keys(partial.addressData || {}) as (keyof LeadAddress)[]) if (partial.addressData?.[field] !== stateRef.current.addressData[field]) edited.current.add('addressData.' + field)
      } else edited.current.add(key)
    }
    dirty.current = true
    setState((current) => ({ ...current, ...partial }))
  }

  const persist = async (): Promise<boolean> => {
    const current = stateRef.current
    const savedKeys = [...edited.current]
    const savingLeadId = lead.id
    if (!savedKeys.length) return true
    const body: Record<string, unknown> = {}
    for (const key of savedKeys) {
      if (key.startsWith('addressData.')) { const field = key.slice(12) as keyof LeadAddress; body.addressData = { ...(body.addressData as object || {}), [field]: current.addressData[field] } }
      else body[key] = key === 'deliveryFreight' || key === 'pickupFreight' || key === 'rentalMonths' ? Number(current[key]) || 0 : current[key as keyof SheetState]
    }
    setSave('saving')
    try {
      const response = await fetch(`/api/leads/${lead.id}/details`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(String(response.status))
      if (activeLeadId.current !== savingLeadId) return true
      for (const key of savedKeys) {
        const read = (s: SheetState) => key.startsWith('addressData.') ? s.addressData[key.slice(12) as keyof LeadAddress] : s[key as keyof SheetState]
        if (JSON.stringify(read(current)) === JSON.stringify(read(stateRef.current))) edited.current.delete(key)
      }
      dirty.current = edited.current.size > 0
      setSave(dirty.current ? 'idle' : 'saved')
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
        if (partial.modality && partial.modality !== item.modality) {
          const product = catalog.find(entry => entry.code === item.productCode || entry.name === item.product)
          next.unitPrice = product ? partial.modality === 'locacao' ? product.monthlyPrice : product.salePrice : 0
        }
        return next
      }),
    })

  const addItem = (product: string) => {
    const entry = catalog.find((item) => item.name === product)
    if (!entry) return
    patch({
      quoteItems: [
        ...state.quoteItems,
        { product: entry.name, productCode: entry.code, modality: lead.modality === 'compra' ? 'compra' : 'locacao', qty: 1, unitPrice: lead.modality === 'compra' ? entry.salePrice : entry.monthlyPrice },
      ],
    })
  }

  const downloadChecklist = async () => {
    if (downloadingChecklist) return
    setDownloadingChecklist(true)
    setChecklistError(null)
    try {
      if (!(await persist())) throw new Error('Salve a ficha antes de baixar o checklist.')
      const response = await fetch(`/api/leads/${lead.id}/checklist.pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Não foi possível gerar o checklist.')
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      const safeName = (lead.name || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-')
      link.href = objectUrl
      link.download = `checklist-entrega-${safeName}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : 'Falha ao baixar o checklist.')
    } finally {
      setDownloadingChecklist(false)
    }
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
  const deliveryFreight = Number(state.deliveryFreight) || 0
  const pickupFreight = hasRental ? Number(state.pickupFreight) || 0 : 0
  const oneTime = purchaseTotal + deliveryFreight
  const pickupDueDate = state.pickupFreightDueDate || addCalendarMonths(state.deliveryDate, Math.max(1, (Number(state.rentalMonths) || 1) - 1))

  const checks = useMemo(() => {
    const address = state.addressData
    return [
      { id: 'cliente', label: 'Nome, telefone e CPF/CNPJ do cliente', done: state.name.trim().length >= 2 && state.phone.replace(/\D/g, '').length >= 10 && state.cpf.replace(/\D/g, '').length >= 11, required: true },
      { id: 'endereco', label: 'Endereço de entrega completo', done: Boolean(address.street && address.number && address.city), required: true },
      { id: 'acesso', label: 'Acesso até o quarto definido', done: state.access !== 'nao_sei', required: true },
      { id: 'itens', label: 'Produto e valor definidos', done: state.quoteItems.length > 0 && state.quoteItems.every((item) => item.unitPrice > 0), required: true },
      { id: 'entrega', label: 'Data de entrega combinada', done: Boolean(state.deliveryDate), required: true },
      ...(hasRental && pickupFreight > 0 ? [{ id: 'retirada', label: 'Vencimento do frete de retirada definido', done: Boolean(addCalendarMonths(pickupDueDate, 0)) && pickupDueDate >= state.deliveryDate, required: true }] : []),
      ...(hasRental
        ? [{ id: 'periodo', label: 'Período de locação definido', done: Number.isInteger(Number(state.rentalMonths)) && Number(state.rentalMonths) >= 1 && Number(state.rentalMonths) <= 120, required: true }]
        : []),
      ...MANUAL.map((item) => ({ id: item.id, label: item.label, done: state.checklist[item.id] === true, required: item.required, manual: true })),
    ] as { id: string; label: string; done: boolean; required: boolean; manual?: boolean }[]
  }, [state, hasRental, pickupFreight, pickupDueDate])

  const doneCount = checks.filter((item) => item.done).length
  const missing = checks.filter((item) => item.required && !item.done)
  const ready = missing.length === 0

  const createContract = async () => {
    if (!ready || creatingRef.current || createdContract) return
    creatingRef.current = true
    setCreating(true)
    setContractError(null)
    try {
      // A ficha vai primeiro: o contrato le cpf e endereco direto do lead.
      if (!(await persist())) throw new Error('save')

      const start = state.deliveryDate || new Date().toISOString().split('T')[0]
      const end = addCalendarMonths(start, Math.max(1, Number(state.rentalMonths) || 1))

      const accessLabel = ACCESS.find((item) => item.id === state.access)?.label ?? ''
      const clauses = [
        hasRental && purchaseTotal > 0 ? `Itens de compra (cobrança única): ${brl(purchaseTotal)}.` : '',
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
          useQuoteItems: true,
          creationRequestId: creationKey.current,
          startDate: start,
          endDate: hasRental ? end : start,
          // Com locacao, o valor do contrato e so a parte mensal. Sem locacao
          // (venda pura) o contrato leva o total da compra.
          monthlyValue: hasRental ? rentalMonthly : purchaseTotal,
          deliveryFreight,
          pickupFreight,
          pickupFreightDueDate: hasRental && pickupFreight > 0 ? pickupDueDate : '',
          customClauses: clauses,
        }),
      })
      const contract = await response.json()
      if (!response.ok) throw new Error(contract.error || 'Não foi possível gerar o contrato.')
      setCreatedContract(contract)

      // O servidor inclui a ida na primeira e cobra a volta separadamente.
      // Apenas os itens de compra do pedido misto ficam na fatura avulsa.
      const extra = contract.itemDetailsVersion === 1 ? 0 : hasRental ? purchaseTotal : 0
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
    } catch (error) {
      setContractError(error instanceof Error && error.message !== 'save' ? error.message : 'Não foi possível salvar a ficha. Confira a conexão e tente de novo.')
    } finally {
      setCreating(false)
      creatingRef.current = false
    }
  }

  const available = catalog.filter((entry) => !state.quoteItems.some((item) => item.product === entry.name || (entry.code && item.productCode === entry.code)))

  return (
    <aside className="sheet" aria-label="Ficha de fechamento">
      <header className="sheet-head">
        <div className="min-w-0">
          <p className="sheet-eyebrow">Ficha de fechamento</p>
          <h3 className="serif truncate">{displayContactName(lead.name)}</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{maskPhone(lead.phone) || 'Número não informado'}</p>
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
        {lead.yriaOrderDraft?<Section icon={<Package className="h-3.5 w-3.5"/>} title="Pedido preparado pela YRIA">
          <p className="sheet-summary">{lead.yriaOrderDraft.quantity} unidade(s) de {lead.yriaOrderDraft.product} · {lead.yriaOrderDraft.productCode || 'Sem código'}<br/>Valor unitário: {brl(lead.yriaOrderDraft.unitPrice)}{lead.yriaOrderDraft.modality==='locacao'?' / mês':''}<br/>Entrega: {brl(lead.yriaOrderDraft.deliveryFreight)} · Retirada: {brl(lead.yriaOrderDraft.pickupFreight)}<br/>Total previsto: {brl(lead.yriaOrderDraft.total)}</p>
          <p className="sheet-summary">Pedido para revisão. Não confirma assinatura ou pagamento. Confira: {lead.yriaOrderDraft.pendingChecks.join(', ')}.</p>
          <button type="button" className="sheet-link" onClick={()=>{const d=lead.yriaOrderDraft!;patch({quoteItems:[{product:d.product,productCode:d.productCode,modality:d.modality,qty:d.quantity,unitPrice:d.unitPrice}],deliveryFreight:String(d.deliveryFreight),pickupFreight:String(d.pickupFreight),rentalMonths:d.rentalMonths?String(d.rentalMonths):''})}}>Conferi: usar estes itens na cotação</button>
        </Section>:null}
        <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="Síntese da IA">
          <p className="sheet-summary">
            {(aiSummary ?? lead.aiSummary) || 'Ainda sem resumo desta conversa.'}
          </p>
          {lead.qualificationData && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60" aria-live="polite">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Qualificação comercial</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                {[qualificationValue(lead.qualificationData, 'name'), qualificationValue(lead.qualificationData, 'equipmentInterest'), qualificationValue(lead.qualificationData, 'modality') === 'locacao' ? 'Locação' : qualificationValue(lead.qualificationData, 'modality') === 'compra' ? 'Compra' : '', qualificationValue(lead.qualificationData, 'estimatedPeriod'), [qualificationValue(lead.qualificationData, 'district'), qualificationValue(lead.qualificationData, 'city')].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || 'Aguardando dados explícitos do cliente.'}
              </p>
              {lead.qualificationData.missingFields?.length ? (
                <p className="mt-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Falta confirmar: {lead.qualificationData.missingFields.map(qualificationLabel).join(', ')}
                </p>
              ) : lead.qualificationData.qualified ? (
                <p className="mt-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Pronto para o vendedor assumir.</p>
              ) : null}
            </div>
          )}
          <button type="button" className="sheet-link" onClick={onGenerateSummary} disabled={generatingSummary}>
            {generatingSummary ? 'Gerando…' : 'Atualizar resumo'}
          </button>
        </Section>

        <Section icon={<User className="h-3.5 w-3.5" />} title="Cliente" done={checks[0].done}>
          <div className="sheet-grid">
            <Input wide label="Nome completo do cliente" value={state.name} maxLength={120} placeholder="Nome ou razão social" onChange={event => patch({ name: event.target.value })} />
            <Input label="Telefone do cliente" type="tel" inputMode="tel" value={state.phone} maxLength={25} placeholder="(41) 99999-0000" onChange={event => patch({ phone: event.target.value })} />
            <Input label="CPF ou CNPJ" value={state.cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(event) => patch({ cpf: event.target.value })} />
            <Input label="E-mail" type="email" value={state.email} placeholder="cliente@email.com" onChange={(event) => patch({ email: event.target.value })} />
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
          {catalogStatus === 'loading' ? <p className="sheet-note">Carregando produtos cadastrados…</p> : catalogStatus === 'error' ? <p role="alert" className="sheet-error">Não foi possível carregar o catálogo. Reabra a ficha para tentar novamente.</p> : !catalog.length ? <p className="sheet-note">Cadastre os produtos em Equipamentos para adicioná-los à ficha.</p> : null}
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
                  <Input label="Quantidade" type="number" min={1} max={99} inputMode="numeric" value={item.qty} onChange={(event) => setItem(index, { qty: Math.min(99, Math.max(1, Math.trunc(Number(event.target.value) || 1))) })} />
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
                {!item.unitPrice ? <p className="sheet-note">Preço sob consulta. Confirme e informe o valor antes de gerar o contrato.</p> : null}
              </li>
            ))}
          </ul>

          {available.length > 0 && (
            <div className="sheet-add">
              {available.map((entry) => (
                <button key={entry.code || entry.name} type="button" disabled={entry.available < 1} onClick={() => addItem(entry.name)}>
                  <Plus className="h-3 w-3" />
                  <span>{entry.name}</span>
                  <small className="font-mono text-[9px] opacity-70">{entry.code}</small>
                  <small className="text-[9px] opacity-70">{entry.available} disponível(is)</small>
                </button>
              ))}
            </div>
          )}
        </Section>

        <button type="button" className="sheet-link min-h-10" disabled={catalogStatus === 'loading'} onClick={() => setCatalogRefresh(current => current + 1)}>Atualizar catálogo</button>
        <Section icon={<Truck className="h-3.5 w-3.5" />} title="Entrega, retirada e fretes" done={checks[4].done}>
          <div className="sheet-grid">
            <Input label="Data de entrega" type="date" value={state.deliveryDate} onChange={(event) => patch({ deliveryDate: event.target.value })} />
            <Input label="Frete de entrega / ida (R$)" type="number" min={0} step="0.01" inputMode="decimal" value={state.deliveryFreight} placeholder="0,00" onChange={(event) => patch({ deliveryFreight: event.target.value })} />
            {hasRental ? <Input label="Frete de retirada / volta (R$)" type="number" min={0} step="0.01" inputMode="decimal" value={state.pickupFreight} placeholder="0,00" onChange={(event) => patch({ pickupFreight: event.target.value })} /> : null}
            {hasRental && pickupFreight > 0 ? <Input label="Vencimento do frete de retirada" type="date" min={state.deliveryDate || undefined} value={pickupDueDate} onChange={event => patch({ pickupFreightDueDate: event.target.value })} /> : null}
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
          <p className="sheet-note">Frete de ida na primeira cobrança.{hasRental ? ' Frete de volta somente na segunda, cobrado uma única vez.' : ''}</p>
        </Section>

        <Section icon={<FileSignature className="h-3.5 w-3.5" />} title="Observações do fechamento">
          <label className="sheet-field"><span>Observações do fechamento</span><textarea className="field-control sheet-input" rows={3} maxLength={2000} value={state.closingNotes} placeholder="Condições combinadas, detalhes do pedido e informações para o cliente" onChange={event => patch({ closingNotes: event.target.value })} /></label>
          <p className="sheet-note">Este texto aparece no contrato e no checklist. Não coloque anotações internas ou informações sigilosas.</p>
        </Section>
        <Section icon={<Paperclip className="h-3.5 w-3.5" />} title="Anexos do cliente"><LeadFiles key={lead.id} leadId={lead.id} /></Section>
        <Section icon={<Check className="h-3.5 w-3.5" />} title="Checklist do contrato">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              Baixe a ficha para acompanhar valores, endereço e confirmação no local da entrega.
            </p>
            <button
              type="button"
              onClick={downloadChecklist}
              disabled={downloadingChecklist}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--yr-700)', background: 'var(--surface-raised)' }}
            >
              <Download className="h-3.5 w-3.5" />
              {downloadingChecklist ? 'Gerando PDF…' : 'Baixar checklist PDF'}
            </button>
          </div>
          {checklistError && <p className="mb-3 text-xs font-semibold text-rose-600" role="alert">{checklistError}</p>}
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
        {createdContract ? <div ref={scrollToShare}><ContractQuickShare key={createdContract.id} contract={createdContract} email={state.email} /></div> : null}
      </div>

      <footer className="sheet-foot">
        {!createdContract ? <dl>
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
            <dt>Frete de entrega (ida)</dt>
            <dd className="tnum">{brl(deliveryFreight)}</dd>
          </div>
          <div className="is-total">
            <dt>Primeira cobrança</dt>
            <dd className="tnum">{brl(rentalMonthly + oneTime)}</dd>
          </div>
          {hasRental && Number(state.rentalMonths) > 1 ? <div><dt>Próximas mensalidades (sem frete)</dt><dd className="tnum">{brl(rentalMonthly)}</dd></div> : null}
          {hasRental && pickupFreight > 0 ? <div className="is-total"><dt>Retirada — cobrança única{pickupDueDate ? ` · ${new Date(`${pickupDueDate}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}</dt><dd className="tnum">{brl(pickupFreight)}</dd></div> : null}
        </dl> : null}

        {contractError && <p className="sheet-error" role="alert">{contractError}</p>}

        <button type="button" className="action-btn action-btn--primary sheet-cta" disabled={!ready || creating || Boolean(createdContract) || catalogStatus !== 'ready'} onClick={createContract}>
          {creating ? <LoaderCircle className="spin h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
          {createdContract ? 'Contrato gerado — envio acima' : ready ? 'Gerar contrato' : `Faltam ${missing.length} ${missing.length === 1 ? 'item' : 'itens'}`}
        </button>
      </footer>
    </aside>
  )
}
