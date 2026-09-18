import React, { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  Clock,
  AlertCircle,
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
    { name: 'Pagas', value: paidTotal, color: '#10b981' },
    { name: 'Em aberto', value: pendingTotal, color: '#0284c7' },
    { name: 'Atrasadas', value: overdueTotal, color: '#f43f5e' },
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
      {/* 1. Header com Ações */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wide">
              Métricas & Fluxo de Caixa
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Grupo YR Hospitalar</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            Gestão Financeira & Previsibilidade de Receita
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Acompanhe o MRR, faturamento realizado vs previsto, inadimplência e régua de cobrança automática por WhatsApp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Fatura / Cobrança</span>
          </button>
        </div>
      </div>

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
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
              R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
              R$ {estimatedLTV.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
      <div className="bg-gradient-to-r from-blue-900/10 via-indigo-900/10 to-purple-900/10 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 p-5 rounded-3xl border border-blue-200/80 dark:border-blue-800/60 space-y-3">
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
              R$ {forecast30.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold">Base em aberto atual</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Próximos 60 Dias (D+60)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              R$ {forecast60.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-blue-600 font-semibold">Duas mensalidades na mesma base</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Próximos 90 Dias (D+90)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              R$ {forecast90.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                <XAxis dataKey="mes" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(value: any) => [
                    `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  ]}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                    border: 'none',
                  }}
                />
                <Bar dataKey="realizado" name="Faturamento Pago" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="previsto" name="A Receber / Previsão" fill="#0284c7" radius={[6, 6, 0, 0]} />
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
                  formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]}
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
                  R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Tabela Completa de Faturas com Régua de Cobrança */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Extrato Detalhado de Cobranças & Faturas ({filteredInvoices.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Dispare lembretes instantâneos no WhatsApp e confirme pagamentos Pix com 1 clique
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Contrato</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Régua de Cobrança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredInvoices.map((inv) => {
                const isPaid = inv.status === 'paga'
                const isOverdue = inv.status === 'atrasada'
                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {inv.contractNumber}
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-white">
                      {inv.clientName}
                    </td>
                    <td className="p-4 text-slate-500 font-mono">
                      {new Date(inv.dueDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 font-bold text-slate-900 dark:text-white">
                      R$ {inv.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Quitada
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          Atrasada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3 text-amber-500" />
                          Em Aberto
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {!isPaid && (
                        <>
                          <button
                            onClick={() => handleSendReminder(inv)}
                            disabled={sendingReminderId === inv.id || !inv.leadId}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200 dark:border-emerald-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title={inv.leadId ? 'Dispara cobrança cordial com chave Pix no WhatsApp' : 'Vincule esta fatura a um cliente do CRM para cobrar pelo WhatsApp'}
                          >
                            <Send className="w-3 h-3" />
                            {sendingReminderId === inv.id ? 'Enviando...' : inv.leadId ? 'Cobrar WhatsApp' : 'Sem cliente vinculado'}
                          </button>

                          <button
                            onClick={() => handleMarkPaid(inv.id)}
                            className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-all shadow-sm"
                          >
                            Dar Baixa
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Modal de Nova Fatura / Cobrança */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Criar Nova Fatura / Mensalidade
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-semibold">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Vincular cliente do CRM (recomendado para cobrança WhatsApp)
                </label>
                <select
                  value={newInvoiceData.leadId}
                  onChange={(e) => {
                    const leadId = e.target.value
                    const selectedLead = leads.find((lead) => lead.id === leadId)
                    setNewInvoiceData({
                      ...newInvoiceData,
                      leadId,
                      clientName: selectedLead?.name || newInvoiceData.clientName,
                    })
                  }}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">Sem vínculo — cobrança manual</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name} — {lead.phone}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Sem vínculo, a fatura continua válida, mas o botão de cobrança WhatsApp ficará bloqueado.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Número do Contrato / Referência
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CTR-2026-092"
                  value={newInvoiceData.contractNumber}
                  onChange={(e) =>
                    setNewInvoiceData({ ...newInvoiceData, contractNumber: e.target.value })
                  }
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Cliente / Hospital
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Hospital Pilar / Clínica Vida"
                  value={newInvoiceData.clientName}
                  onChange={(e) =>
                    setNewInvoiceData({ ...newInvoiceData, clientName: e.target.value, leadId: '' })
                  }
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="450.00"
                    value={newInvoiceData.amount}
                    onChange={(e) =>
                      setNewInvoiceData({ ...newInvoiceData, amount: e.target.value })
                    }
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Vencimento
                  </label>
                  <input
                    type="date"
                    required
                    value={newInvoiceData.dueDate}
                    onChange={(e) =>
                      setNewInvoiceData({ ...newInvoiceData, dueDate: e.target.value })
                    }
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Status Inicial
                </label>
                <select
                  value={newInvoiceData.status}
                  onChange={(e) =>
                    setNewInvoiceData({
                      ...newInvoiceData,
                      status: e.target.value as 'pendente' | 'paga',
                    })
                  }
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="pendente">Em Aberto (Pendente)</option>
                  <option value="paga">Já Quitado (Pago)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-md shadow-emerald-500/20"
                >
                  Salvar Fatura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
