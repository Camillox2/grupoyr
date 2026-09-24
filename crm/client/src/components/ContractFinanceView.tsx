import React, { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { Contract, ContractExpense, ContractExpenseCategory, Invoice, Lead } from '../types'
import { isValidIsoDate, toLocalDateKey } from '../lib/operations'
import { Modal } from './ui/Modal'
import { Toast, useToast } from './ui/Toast'

interface Props {
  contracts: Contract[]
  invoices: Invoice[]
  expenses: ContractExpense[]
  leads: Lead[]
  onRefresh: () => void
  onOpenLead?: (leadId: string) => void
}

type ExpenseForm = { contractId: string; category: ContractExpenseCategory; amount: string; date: string; description: string }
const EMPTY_FORM = (): ExpenseForm => ({ contractId: '', category: 'entrega', amount: '', date: new Date().toISOString().slice(0, 10), description: '' })
const CATEGORY_LABEL: Record<ContractExpenseCategory, string> = { entrega: 'Entrega', retirada: 'Retirada', manutencao: 'Manutenção', outro: 'Outro' }
const money = (amount: number) => Number(amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayKey = () => toLocalDateKey(new Date())

function totalContractValue(contract: Contract): number | null {
  const value = Number(contract.monthlyValue)
  if (!Number.isFinite(value) || value < 0) return null
  if (contract.type === 'venda') return value
  if (!isValidIsoDate(contract.startDate) || !isValidIsoDate(contract.endDate) || contract.endDate < contract.startDate) return null
  const start = new Date(`${contract.startDate}T00:00:00.000Z`)
  const end = new Date(`${contract.endDate}T00:00:00.000Z`)
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
  return value * Math.max(1, Math.ceil(days / 30))
}

const dueIsOver = (invoice: Invoice) => invoice.status === 'atrasada' || (invoice.status === 'pendente' && isValidIsoDate(invoice.dueDate) && invoice.dueDate < todayKey())

export const ContractFinanceView: React.FC<Props> = ({ contracts, invoices, expenses, leads, onRefresh, onOpenLead }) => {
  const { toast, show, dismiss } = useToast()
  const [editing, setEditing] = useState<ContractExpense | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => contracts
    .filter((contract) => ['assinado', 'encerrado', 'pendente_assinatura'].includes(contract.status))
    .map((contract) => {
      const contractInvoices = invoices.filter((invoice) => invoice.contractNumber === contract.number && invoice.status !== 'cancelada')
      const contractCosts = expenses.filter((expense) => expense.contractId === contract.id)
      const total = totalContractValue(contract)
      const received = contractInvoices.filter((invoice) => invoice.status === 'paga').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
      const receivable = contractInvoices.filter((invoice) => invoice.status === 'pendente' || invoice.status === 'atrasada').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
      const overdue = contractInvoices.filter(dueIsOver).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
      const costTotal = contractCosts.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
      const invoiced = received + receivable
      const uninvoiced = total === null ? null : Math.max(0, total - invoiced)
      return { contract, contractInvoices, contractCosts, total, received, receivable, overdue, costTotal, uninvoiced, estimate: total === null ? null : total - costTotal }
    })
    .sort((left, right) => right.contract.createdAt.localeCompare(left.contract.createdAt)), [contracts, invoices, expenses])

  const confirmedRows = rows.filter((row) => row.contract.status === 'assinado' || row.contract.status === 'encerrado')
  const revenueAndCosts = rows.reduce((sum, row) => ({
    received: sum.received + row.received,
    receivable: sum.receivable + row.receivable,
    overdue: sum.overdue + row.overdue,
    costs: sum.costs + row.costTotal,
  }), { received: 0, receivable: 0, overdue: 0, costs: 0 })
  const contractedTotal = confirmedRows.reduce((sum, row) => sum + (row.total || 0), 0)
  const pendingReservations = rows.filter((row) => row.contract.status === 'pendente_assinatura').length

  const openExpense = (expense?: ContractExpense, contractId?: string) => {
    setEditing(expense || null)
    setForm(expense ? { contractId: expense.contractId, category: expense.category, amount: String(expense.amount), date: expense.date, description: expense.description } : { ...EMPTY_FORM(), contractId: contractId || '' })
    setError('')
    setModalOpen(true)
  }

  const saveExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(editing ? `/api/finance/contract-expenses/${editing.id}` : '/api/finance/contract-expenses', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o custo.')
      setModalOpen(false)
      show({ tone: 'ok', message: editing ? 'Custo atualizado.' : 'Custo registrado no contrato.' })
      onRefresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o custo.')
    } finally {
      setSaving(false)
    }
  }

  const deleteExpense = async (expense: ContractExpense) => {
    if (!window.confirm(`Remover o custo “${expense.description}”?`)) return
    try {
      const response = await fetch(`/api/finance/contract-expenses/${expense.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` } })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover o custo.')
      show({ tone: 'ok', message: 'Custo removido.' })
      onRefresh()
    } catch (caught) {
      show({ tone: 'alert', message: caught instanceof Error ? caught.message : 'Não foi possível remover o custo.' })
    }
  }

  return (
    <div className="yr-finance-contract-view space-y-4">
      <section className="yr-finance-contract-intro">
        <div><p className="yr-finance-kicker">Carteira contratada</p><h2>Receitas e custos acompanhados contrato a contrato</h2><p>Receita recebida vem de faturas pagas; valores em aberto e vencidos continuam separados.</p></div>
        <button type="button" className="yr-dialog-primary" onClick={() => openExpense()}><Plus className="h-4 w-4" /> Registrar custo</button>
      </section>

      <section className="yr-finance-contract-metrics" aria-label="Totais dos contratos assinados e encerrados">
        <article><span>Contratado</span><strong>{money(contractedTotal)}</strong><small>Contratos assinados e encerrados</small></article>
        <article><span>Recebido</span><strong className="is-positive">{money(revenueAndCosts.received)}</strong><small>Faturas com baixa registrada</small></article>
        <article><span>A receber</span><strong>{money(revenueAndCosts.receivable)}</strong><small>Faturas abertas em contratos</small></article>
        <article><span>Vencido</span><strong className="is-alert">{money(revenueAndCosts.overdue)}</strong><small>Faturas vencidas sem baixa</small></article>
        <article><span>Custos diretos</span><strong>{money(revenueAndCosts.costs)}</strong><small>Custos lançados nos contratos</small></article>
      </section>

      <div className="yr-finance-calculation"><ReceiptText className="h-4 w-4" /><span><strong>Saldo estimado após custos registrados</strong> = valor contratado − custos diretos cadastrados. É uma estimativa operacional, não lucro realizado. Receita recebida = somente faturas pagas; a receber = faturas pendentes ou atrasadas.</span></div>
      {pendingReservations > 0 && <p className="yr-finance-pending-note"><AlertTriangle className="h-4 w-4" /> {pendingReservations} {pendingReservations === 1 ? 'contrato aguarda' : 'contratos aguardam'} assinatura e permanecem fora do total contratado.</p>}

      {rows.length ? <div className="yr-finance-contract-list">
        {rows.map(({ contract, contractInvoices, contractCosts, total, received, receivable, overdue, costTotal, uninvoiced, estimate }) => {
          const lead = leads.find((item) => item.id === contract.leadId)
          const confirmed = contract.status === 'assinado' || contract.status === 'encerrado'
          return (
            <article className="yr-finance-contract-card" key={contract.id}>
              <header className="yr-finance-contract-card__head">
                <div className="min-w-0"><span className={`yr-finance-contract-state ${confirmed ? 'is-confirmed' : 'is-pending'}`}>{confirmed ? 'Contratado' : 'Aguardando assinatura'}</span><h3>{contract.number} <span>· {contract.type === 'locacao' ? 'Locação' : 'Venda'}</span></h3><p>{contract.clientName}{contract.equipmentNames ? ` · ${contract.equipmentNames}` : ''}</p></div>
                {lead && onOpenLead && <button type="button" className="yr-finance-client-link" onClick={() => onOpenLead(lead.id)}>Abrir cliente <ArrowUpRight className="h-3.5 w-3.5" /></button>}
              </header>
              <div className="yr-finance-contract-facts">
                <div><span>{confirmed ? 'Contratado' : 'Valor previsto'}</span><strong>{total === null ? 'Período não registrado' : money(total)}</strong></div>
                <div><span>Recebido</span><strong className="is-positive">{money(received)}</strong></div>
                <div><span>A receber</span><strong>{money(receivable)}</strong></div>
                <div><span>Vencido</span><strong className={overdue ? 'is-alert' : ''}>{money(overdue)}</strong></div>
                <div><span>Custos diretos</span><strong>{money(costTotal)}</strong></div>
                <div><span>{confirmed ? 'Saldo estimado' : 'Saldo previsto'}</span><strong>{estimate === null ? '—' : money(estimate)}</strong></div>
              </div>
              {uninvoiced !== null && uninvoiced > 0 && <p className="yr-finance-uninvoiced"><ArrowDownLeft className="h-3.5 w-3.5" /> {money(uninvoiced)} do valor contratado ainda sem fatura associada.</p>}
              <section className="yr-finance-costs" aria-label={`Custos diretos do contrato ${contract.number}`}>
                <header><h4>Custos registrados <span>{contractCosts.length}</span></h4><button type="button" onClick={() => openExpense(undefined, contract.id)}>Adicionar custo</button></header>
                {contractCosts.length ? contractCosts.map((expense) => <div className="yr-finance-cost-row" key={expense.id}><span className="yr-finance-cost-date">{new Date(`${expense.date}T00:00:00`).toLocaleDateString('pt-BR')}</span><span className="yr-finance-cost-description"><strong>{expense.description}</strong><small>{CATEGORY_LABEL[expense.category]}</small></span><strong className="yr-finance-cost-amount">{money(expense.amount)}</strong><button type="button" aria-label={`Corrigir custo ${expense.description}`} onClick={() => openExpense(expense)}><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Remover custo ${expense.description}`} onClick={() => deleteExpense(expense)}><Trash2 className="h-3.5 w-3.5" /></button></div>) : <p className="yr-finance-cost-empty">Nenhum custo direto registrado para este contrato.</p>}
                <div className="yr-finance-invoice-foot"><CheckCircle2 className="h-3.5 w-3.5" /> {contractInvoices.length} {contractInvoices.length === 1 ? 'fatura vinculada' : 'faturas vinculadas'}</div>
              </section>
            </article>
          )
        })}
      </div> : <div className="yr-finance-contract-empty"><ReceiptText className="h-7 w-7" /><strong>Nenhum contrato com movimento financeiro</strong><span>Os contratos assinados e as reservas pendentes aparecem aqui quando existirem no CRM.</span></div>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Corrigir custo direto' : 'Novo custo direto'} subtitle="O custo será associado ao contrato e ao cliente selecionados." icon={<ReceiptText className="h-4 w-4" />} size="md" footer={<div className="flex justify-end gap-2"><button type="button" className="yr-dialog-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" form="yr-contract-cost-form" className="yr-dialog-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar custo'}</button></div>}>
        <form id="yr-contract-cost-form" className="yr-calendar-form" onSubmit={saveExpense}>
          {error && <p className="yr-calendar-form__error" role="alert">{error}</p>}
          <label className="yr-calendar-field yr-calendar-field--wide"><span>Contrato e cliente</span><select required value={form.contractId} onChange={(event) => setForm({ ...form, contractId: event.target.value })}><option value="">Selecione o contrato</option>{contracts.filter((contract) => contract.status !== 'cancelado').map((contract) => <option key={contract.id} value={contract.id}>{contract.number} · {contract.clientName}</option>)}</select></label>
          <label className="yr-calendar-field"><span>Tipo de custo</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ContractExpenseCategory })}>{Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="yr-calendar-field"><span>Data</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label className="yr-calendar-field"><span>Valor (R$)</span><input type="number" min="0.01" step="0.01" inputMode="decimal" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0,00" /></label>
          <label className="yr-calendar-field yr-calendar-field--wide"><span>Descrição</span><input required maxLength={240} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: frete de entrega" /></label>
        </form>
      </Modal>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  )
}
