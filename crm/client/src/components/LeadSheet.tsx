import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CircleDashed,
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
} from 'lucide-react'
import { Lead, QuoteItem, LeadAddress, LeadAccess } from '../types'
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
const CATALOG: { name: string; rent: boolean }[] = [
  { name: 'Cama elétrica luxo', rent: true },
  { name: 'Cama manual 3 movimentos', rent: true },
  { name: 'Colchão pneumático', rent: false },
  { name: 'Cadeira de banho', rent: true },
]
const canRent = (name: string) => CATALOG.find((item) => item.name === name)?.rent ?? true

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
      ? lead.quoteItems
      : CATALOG.some((item) => item.name === lead.equipmentInterest)
        ? [
            {
              product: lead.equipmentInterest,
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
  const [contractError, setContractError] = useState<string | null>(null)
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
    dirty.current = false
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

  const addItem = (product: string) =>
    patch({
      quoteItems: [...state.quoteItems, { product, modality: canRent(product) ? 'locacao' : 'compra', qty: 1, unitPrice: 0 }],
    })

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
              <li key={item.product}>
                <div className="sheet-item-head">
                  <strong>{item.product}</strong>
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
                  <Input label="Qtd." type="number" min={1} max={99} value={item.qty} onChange={(event) => setItem(index, { qty: Math.max(1, Number(event.target.value) || 1) })} />
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
                  {entry.name}
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
