import React, { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Send,
  Plus,
  Filter,
  Download,
  ArrowUpRight,
  Sparkles,
  PieChart as PieChartIcon,
  BarChart3,
  Percent,
  Calculator,
  Search,
  X,
} from 'lucide-react'
import { ResponsiveTable, EmptyState } from './ui/ResponsiveTable'
import { InvoiceStatus } from './ui/Status'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Invoice, Lead } from '../types'
import { PageHeader, ActionButton } from './ui/PageHeader'
import { Modal } from './ui/Modal'
import { TextField, SelectField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'

interface FinanceViewProps {
  invoices: Invoice[]
  leads: Lead[]
  onRefreshInvoices: () => void
}

export const FinanceView: React.FC<FinanceViewProps> = ({ invoices, leads, onRefreshInvoices }) => {
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | 'month' | 'quarter' | 'year'>('month')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paga' | 'pendente' | 'atrasada'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [reminderSuccess, setReminderSuccess] = useState<string | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [newInvoiceData, setNewInvoiceData] = useState({
    contractNumber: '',
    clientName: '',
    leadId: '',
    amount: '',
    dueDate: new Date().toISOString().split('T')[0],
    status: 'pendente' as 'pendente' | 'paga',
  })

  // Filtered invoices based on period, status, and search
  const filteredInvoices = useMemo(() => {
    const now = new Date()
    return invoices.filter((inv) => {
      // Status filter
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matches =
          inv.clientName.toLowerCase().includes(term) ||
          inv.contractNumber.toLowerCase().includes(term) ||
          inv.amount.toString().includes(term)
        if (!matches) return false
      }

      // Period filter
      if (periodFilter === 'all') return true
      const due = new Date(inv.dueDate)
      if (periodFilter === '7d') {
        const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24)
        return diffDays >= -7 && diffDays <= 7
      }
      if (periodFilter === 'month') {
        return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()
      }
      if (periodFilter === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3)
        const dueQuarter = Math.floor(due.getMonth() / 3)
        return currentQuarter === dueQuarter && due.getFullYear() === now.getFullYear()
      }
      if (periodFilter === 'year') {
        return due.getFullYear() === now.getFullYear()
      }
      return true
    })
  }, [invoices, periodFilter, statusFilter, searchTerm])

  // Custom Key Metrics
  const paidTotal = filteredInvoices
    .filter((i) => i.status === 'paga')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const pendingTotal = filteredInvoices
    .filter((i) => i.status === 'pendente')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const overdueTotal = filteredInvoices
    .filter((i) => i.status === 'atrasada')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const totalFilteredSum = paidTotal + pendingTotal + overdueTotal

  // MRR (Monthly Recurring Revenue de locações)
  const mrr = invoices
    .filter((i) => i.status === 'paga' || i.status === 'pendente')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  // Ticket Médio
  const validInvoicesCount = filteredInvoices.length
  const ticketMedio = validInvoicesCount > 0 ? totalFilteredSum / validInvoicesCount : 0

  // LTV Médio Estimado (Tempo médio de locação hospitalar de 8.5 meses x ticket médio)
  const estimatedLTV = ticketMedio * 8.5

  // Taxa de Inadimplência (%)
  const defaultRate =
    totalFilteredSum > 0 ? Math.round((overdueTotal / totalFilteredSum) * 100 * 10) / 10 : 0

  // Cenários simples, baseados somente no valor em aberto carregado do banco.
  // Eles não substituem um calendário de faturamento por contrato.
  const forecast30 = pendingTotal
  const forecast60 = pendingTotal * 2
  const forecast90 = pendingTotal * 3

  // Gráficos calculados apenas com as faturas reais carregadas do banco.
  const cashFlowData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 5 }, (_, offset) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - 2 + offset, 1)
      const monthInvoices = invoices.filter((invoice) => {
        const dueDate = new Date(invoice.dueDate)
        return dueDate.getFullYear() === monthDate.getFullYear() && dueDate.getMonth() === monthDate.getMonth()
      })

      return {
        mes: monthDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        realizado: monthInvoices.filter((invoice) => invoice.status === 'paga').reduce((sum, invoice) => sum + (invoice.amount || 0), 0),
        previsto: monthInvoices.filter((invoice) => invoice.status !== 'paga').reduce((sum, invoice) => sum + (invoice.amount || 0), 0),
      }
    })
  }, [invoices])

  const billingStatusData = [
    { name: 'Pagas', value: paidTotal, color: '#0e7c6b' },
    { name: 'Em aberto', value: pendingTotal, color: '#1d5fae' },
    { name: 'Atrasadas', value: overdueTotal, color: '#b3261e' },
  ].filter((item) => item.value > 0)

  const handleMarkPaid = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/invoices/${id}/pay`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
      })
      if (res.ok) {
        onRefreshInvoices()
      }
    } catch (e) {
      console.error('Erro ao dar baixa na fatura:', e)
    }
  }

  const handleSendReminder = async (invoice: Invoice) => {
    if (!invoice.leadId) {
      setReminderError(`A fatura de ${invoice.clientName} não está vinculada a um cliente do CRM.`)
      setTimeout(() => setReminderError(null), 5000)
      return
    }

    setSendingReminderId(invoice.id)
    setReminderError(null)
    try {
      const res = await fetch(`/api/finance/invoices/${invoice.id}/send-reminder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
      })
      if (res.ok) {
        setReminderSuccess(`Lembrete de cobrança e Chave Pix enviados para ${invoice.clientName} via WhatsApp!`)
        setTimeout(() => setReminderSuccess(null), 4000)
      } else {
        const data = await res.json().catch(() => null)
        setReminderError(data?.error || 'Não foi possível enviar o lembrete pelo WhatsApp.')
        setTimeout(() => setReminderError(null), 5000)
      }
    } catch (e) {
      console.error('Erro ao enviar lembrete:', e)
      setReminderError('Não foi possível enviar o lembrete pelo WhatsApp.')
      setTimeout(() => setReminderError(null), 5000)
    } finally {
      setSendingReminderId(null)
    }
  }

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          contractNumber: newInvoiceData.contractNumber,
          clientName: newInvoiceData.clientName,
          leadId: newInvoiceData.leadId || null,
          amount: parseFloat(newInvoiceData.amount) || 0,
          dueDate: newInvoiceData.dueDate,
          status: newInvoiceData.status,
        }),
      })
      if (res.ok) {
        setShowNewModal(false)
        setNewInvoiceData({
          contractNumber: '',
          clientName: '',
          leadId: '',
          amount: '',
          dueDate: new Date().toISOString().split('T')[0],
          status: 'pendente',
        })
        onRefreshInvoices()
      } else {
        const data = await res.json().catch(() => null)
        setFormError(data?.error || 'Não foi possível salvar a fatura.')
      }
    } catch (e) {
      console.error('Erro ao cadastrar fatura:', e)
      setFormError('Não foi possível salvar a fatura. Verifique a conexão com o servidor.')
    }
  }

  const handleExportCsv = () => {
    const headers = 'ID;Contrato;Cliente;Vencimento;Valor;Status;PagoEm\n'
    const rows = filteredInvoices
      .map(
        (i) =>
          `${i.id};${i.contractNumber};"${i.clientName}";${i.dueDate};${i.amount};${i.status};${i.paidAt || ''}`
      )
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `relatorio_financeiro_yr_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icon={<DollarSign className="h-5 w-5" />}
        eyebrow="Financeiro"
        title="Receita e cobrança"
        description="O que entrou, o que está para entrar e o que atrasou. A cobrança pelo WhatsApp sai daqui."
        actions={
          <>
            <ActionButton variant="ghost" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </ActionButton>
            <ActionButton onClick={() => setShowNewModal(true)}>
              <Plus className="h-4 w-4" />
              Nova cobrança
            </ActionButton>
          </>
        }
      />

      {reminderSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{reminderSuccess}</span>
        </div>
      )}

      {reminderError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200">
          {reminderError}
        </div>
      )}

      {/* 2. Filtros de Período Personalizáveis */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Período:
          </span>
          {(
            [
              { key: 'all', label: 'Todos' },
              { key: '7d', label: 'Últimos 7 dias' },
              { key: 'month', label: 'Este Mês' },
              { key: 'quarter', label: 'Trimestre' },
              { key: 'year', label: 'Ano Atual' },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodFilter(p.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                periodFilter === p.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(
              [
                { key: 'all', label: 'Todas' },
                { key: 'paga', label: 'Pagas' },
                { key: 'pendente', label: 'Em Aberto' },
                { key: 'atrasada', label: 'Atrasadas' },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === s.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por cliente ou CTR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-none text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {/* 3. Cards de Métricas Personalizadas & KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR de Locações */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              MRR (Recorrência Mensal)
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Contratos de locação ativos</span>
            </div>
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Ticket Médio por Locação
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Valor médio mensal por contrato</p>
          </div>
        </div>

        {/* LTV Estimado */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              LTV Médio Estimado
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400">
              R$ {estimatedLTV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Tempo médio de permanência: 8.5 meses</p>
          </div>
        </div>

        {/* Taxa de Inadimplência */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Taxa de Inadimplência
            </span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              defaultRate > 10
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
            }`}>
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className={`text-2xl font-black ${
              defaultRate > 10 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            }`}>
              {defaultRate}%
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              {overdueTotal > 0
                ? `R$ ${overdueTotal.toFixed(2)} em atraso`
                : 'Nenhum atraso registrado'}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Projeção de Faturamento & Previsibilidade de Caixa */}
      <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-3xl border border-blue-200/80 dark:border-blue-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Projeção de Faturamento Recorrente (Previsibilidade de Caixa)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">Cenário calculado com o valor em aberto carregado</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Próximos 30 Dias (D+30)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              R$ {forecast30.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold">Base em aberto atual</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Próximos 60 Dias (D+60)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              R$ {forecast60.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-blue-600 font-semibold">Duas mensalidades na mesma base</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Próximos 90 Dias (D+90)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              R$ {forecast90.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-purple-600 font-semibold">Três mensalidades na mesma base</span>
          </div>
        </div>
      </div>

      {/* 5. Gráficos de Fluxo de Caixa e Mix de Receita */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Barras: Fluxo de Caixa Mensal */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Fluxo de Caixa Mensal (Realizado vs Previsto)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Comparativo de valores já quitados e faturas a vencer
              </p>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlowData}>
                <XAxis dataKey="mes" stroke="#8b96a5" fontSize={11} />
                <YAxis stroke="#8b96a5" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(value: any) => [
                    `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  ]}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                    border: 'none',
                  }}
                />
                <Bar dataKey="realizado" name="Faturamento Pago" fill="#0e7c6b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="previsto" name="A Receber / Previsão" fill="#1d5fae" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Rosca: Composição de Receita */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-600" />
              Distribuição das Cobranças
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Valores agrupados por status das faturas
            </p>
          </div>

          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={billingStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {billingStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                    border: 'none',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {billingStatusData.length === 0 ? (
              <p className="text-[11px] text-slate-400">Sem cobranças no período selecionado.</p>
            ) : billingStatusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">
                  R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Extrato de faturas: tabela no desktop, cards no mobile */}
      <section className="mt-6">
        <div className="mb-3">
          <h3 className="text-[15px] font-extrabold tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
            Extrato de cobranças ({filteredInvoices.length})
          </h3>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            Dispare o lembrete no WhatsApp e dê baixa no pagamento.
          </p>
        </div>

        <ResponsiveTable
          items={filteredInvoices}
          getKey={(invoice) => invoice.id}
          caption="Faturas e cobranças"
          empty={
            <EmptyState
              icon={<DollarSign className="h-5 w-5" />}
              title="Nenhuma fatura neste filtro"
              description="Ajuste a busca ou o status acima, ou crie a primeira cobrança do período."
            />
          }
          columns={[
            {
              header: 'Contrato',
              primary: true,
              cell: (invoice) => (
                <span className="font-mono font-bold" style={{ color: 'var(--yr-500)' }}>
                  {invoice.contractNumber}
                </span>
              ),
            },
            {
              header: 'Cliente',
              secondary: true,
              cell: (invoice) => invoice.clientName,
            },
            {
              header: 'Vencimento',
              cell: (invoice) => (
                <span className="tnum whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
                  {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                </span>
              ),
            },
            {
              header: 'Valor',
              align: 'right',
              cell: (invoice) => (
                <span className="tnum font-bold" style={{ color: 'var(--ink)' }}>
                  {invoice.amount.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    minimumFractionDigits: 2,
                  })}
                </span>
              ),
            },
            {
              header: 'Status',
              cell: (invoice) => <InvoiceStatus status={invoice.status} />,
            },
          ]}
          actions={(invoice) =>
            invoice.status === 'paga' ? (
              <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                Quitada
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleSendReminder(invoice)}
                  disabled={sendingReminderId === invoice.id || !invoice.leadId}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--ok-surface)', color: 'var(--ok)', border: '1px solid var(--ok-border)' }}
                  title={
                    invoice.leadId
                      ? 'Envia a cobrança pelo WhatsApp do cliente'
                      : 'Vincule esta fatura a um cliente do CRM para cobrar pelo WhatsApp'
                  }
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingReminderId === invoice.id
                    ? 'Enviando...'
                    : invoice.leadId
                      ? 'Cobrar'
                      : 'Sem cliente'}
                </button>

                <button
                  onClick={() => handleMarkPaid(invoice.id)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-bold transition-colors"
                  style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}
                >
                  Dar baixa
                </button>
              </>
            )
          }
        />
      </section>

      {/* 7. Nova cobranca: dialogo no desktop, bottom sheet no celular */}
      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Nova cobrança"
        subtitle="Fatura avulsa ou mensalidade de um contrato"
        icon={<Plus className="h-4 w-4" />}
        footer={
          <div className="flex gap-3">
            <SubmitButton variant="ghost" type="button" loading={false} onClick={() => setShowNewModal(false)} className="flex-1">
              Cancelar
            </SubmitButton>
            <SubmitButton type="submit" form="form-nova-cobranca" loading={false} className="flex-[2]">
              Salvar cobrança
            </SubmitButton>
          </div>
        }
      >
        <form id="form-nova-cobranca" onSubmit={handleCreateInvoice} className="space-y-4">
          <FormError message={formError} />

          <SelectField
            label="Cliente do CRM"
            value={newInvoiceData.leadId}
            onChange={(event) => {
              const leadId = event.target.value
              const selectedLead = leads.find((lead) => lead.id === leadId)
              setNewInvoiceData({
                ...newInvoiceData,
                leadId,
                clientName: selectedLead?.name || newInvoiceData.clientName,
              })
            }}
            options={[
              { value: '', label: 'Sem vínculo (cobrança manual)' },
              ...leads.map((lead) => ({ value: lead.id, label: `${lead.name} (${lead.phone})` })),
            ]}
            hint="Sem vínculo a fatura vale do mesmo jeito, mas a cobrança pelo WhatsApp fica bloqueada."
          />

          <TextField
            label="Contrato ou referência"
            required
            placeholder="Ex.: YR-2026-1041"
            value={newInvoiceData.contractNumber}
            onChange={(event) => setNewInvoiceData({ ...newInvoiceData, contractNumber: event.target.value })}
          />

          <TextField
            label="Nome do cliente"
            required
            placeholder="Ex.: Clínica Vida"
            value={newInvoiceData.clientName}
            onChange={(event) => setNewInvoiceData({ ...newInvoiceData, clientName: event.target.value, leadId: '' })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Valor (R$)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              required
              placeholder="450,00"
              value={newInvoiceData.amount}
              onChange={(event) => setNewInvoiceData({ ...newInvoiceData, amount: event.target.value })}
            />
            <TextField
              label="Vencimento"
              type="date"
              required
              value={newInvoiceData.dueDate}
              onChange={(event) => setNewInvoiceData({ ...newInvoiceData, dueDate: event.target.value })}
            />
          </div>

          <SelectField
            label="Status inicial"
            value={newInvoiceData.status}
            onChange={(event) =>
              setNewInvoiceData({ ...newInvoiceData, status: event.target.value as 'pendente' | 'paga' })
            }
            options={[
              { value: 'pendente', label: 'Em aberto' },
              { value: 'paga', label: 'Já paga' },
            ]}
          />
        </form>
      </Modal>
    </div>
  )
}
