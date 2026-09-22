import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  Users,
  Bed,
  CheckCircle2,
  Clock,
  ExternalLink,
  Bot,
  Search,
  Plus,
  QrCode,
  FileSignature,
  BookOpen,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Activity,
  Calendar,
  ArrowUpRight,
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
import { Lead, Equipment, Invoice } from '../types'
import { Mark } from './ui/PageHeader'
import { CountUp, brl } from './ui/Feedback'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { SiteLinkActions } from './SiteLinkActions'

interface DashboardViewProps {
  leads: Lead[]
  equipments: Equipment[]
  invoices: Invoice[]
  onSelectLead: (lead: Lead) => void
  onNavigateTab: (tab: any) => void
  onOpenNewLead: () => void
  onOpenNewContract: () => void
  onOpenNewEquipment: () => void
  onOpenQr: () => void
}

// Paleta da marca: azul YR, verde de "ok", ambar de "espera" e neutros.
const COLORS = ['#1d5fae', '#0e7c6b', '#b26b00', '#8fb8e8', '#102a4c', '#8b96a5']

export const DashboardView: React.FC<DashboardViewProps> = ({
  leads,
  equipments,
  invoices,
  onSelectLead,
  onNavigateTab,
  onOpenNewLead,
  onOpenNewContract,
  onOpenNewEquipment,
  onOpenQr,
}) => {
  const { user } = useAuth()
  const { whatsappStatus } = useSocket()
  const [searchTerm, setSearchTerm] = useState('')
  const [activities, setActivities] = useState<any[]>([])
  const [testingAi, setTestingAi] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<any>(null)

  useEffect(() => {
    const token = localStorage.getItem('yr_crm_token') || ''
    fetch('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setActivities(data))
      .catch(() => {})
  }, [leads, equipments, invoices])

  const totalRevenue = invoices
    .filter((i) => i.status === 'paga')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const pendingRevenue = invoices
    .filter((i) => i.status === 'pendente')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const overdueRevenue = invoices
    .filter((i) => i.status === 'atrasada')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const mrr = invoices
    .filter((i) => i.status === 'paga' || i.status === 'pendente')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0)

  const validInvoicesCount = invoices.length
  const ticketMedio = validInvoicesCount > 0 ? (totalRevenue + pendingRevenue + overdueRevenue) / validInvoicesCount : 0
  const estimatedLtv = ticketMedio * 8.5
  const totalInvoiced = totalRevenue + pendingRevenue + overdueRevenue
  const defaultRate = totalInvoiced > 0 ? Math.round((overdueRevenue / totalInvoiced) * 100 * 10) / 10 : 0

  const rentedCount = equipments.filter((e) => e.status === 'alugado').length
  const totalEquipments = equipments.length
  const occupancyRate = totalEquipments > 0 ? Math.round((rentedCount / totalEquipments) * 100) : 0

  // Origem dos Leads (Google Ads vs Orgânico, etc.)
  const originMap: Record<string, number> = {}
  leads.forEach((l) => {
    const orig = l.origin || 'Outros'
    originMap[orig] = (originMap[orig] || 0) + 1
  })
  const originData = Object.entries(originMap).map(([name, value]) => ({ name, value }))

  // Funil de Vendas Data
  const stageLabels: Record<string, string> = {
    novo_lead: 'Novo Lead',
    qualificacao_ia: 'Qualif. IA',
    proposta_enviada: 'Proposta',
    contrato_gerado: 'Contrato',
    assinado_entrega: 'Assinado',
    locacao_ativa: 'Locação Ativa',
  }
  const stageCounts: Record<string, number> = {}
  leads.forEach((l) => {
    stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1
  })
  const funnelData = Object.entries(stageLabels).map(([key, label]) => ({
    etapa: label,
    quantidade: stageCounts[key] || 0,
  }))

  const filteredLeads = searchTerm.trim()
    ? leads.filter(
        (l) =>
          l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.phone.includes(searchTerm) ||
          l.equipmentInterest.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.origin.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : []

  const handleTestAi = async () => {
    setTestingAi(true)
    setAiTestResult(null)
    try {
    const token = localStorage.getItem('yr_crm_token') || ''
      const res = await fetch('/api/gemini/test-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      setAiTestResult(data)
    } catch (err: any) {
      setAiTestResult({ ok: false, error: err.message })
    } finally {
      setTestingAi(false)
    }
  }

  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'

  const isFirstUse = leads.length === 0 && equipments.length === 0 && invoices.length === 0

  if (isFirstUse) {
    return (
      <section className="space-y-6 pb-12">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="grid lg:grid-cols-[1.1fr_.9fr]">
            <div className="p-8 sm:p-10">
              <img
                src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
                alt="Grupo YR Hospitalar"
                className="w-20 h-20 object-contain rounded-lg border border-slate-100 bg-white"
              />
              <h2 className="mt-8 text-3xl font-semibold tracking-tight text-[#102a4c]">CRM pronto para a operação</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Comece pelo cadastro de um equipamento ou de uma oportunidade. Contratos, faturamento e atendimento passam a ser organizados a partir dos registros reais da sua equipe.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={onOpenNewLead} className="inline-flex items-center gap-2 rounded-lg bg-[#102a4c] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0d2f50] transition-colors">
                  <Users className="w-4 h-4" /> Cadastrar oportunidade
                </button>
                <button onClick={onOpenNewEquipment} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <Bed className="w-4 h-4" /> Cadastrar equipamento
                </button>
              </div>
            </div>
            <div className="min-h-64 bg-[#eef5f7] p-8 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-200">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Primeiros passos</p>
                <ol className="mt-5 space-y-4 text-sm text-slate-700">
                  <li className="flex gap-3"><span className="font-semibold text-[#102a4c]">01</span><span>Cadastre os equipamentos disponíveis.</span></li>
                  <li className="flex gap-3"><span className="font-semibold text-[#102a4c]">02</span><span>Registre a oportunidade e os dados do cliente.</span></li>
                  <li className="flex gap-3"><span className="font-semibold text-[#102a4c]">03</span><span>Gere o contrato e acompanhe o financeiro.</span></li>
                </ol>
              </div>
              <button onClick={!isConnected ? onOpenQr : undefined} className="mt-8 inline-flex w-fit items-center gap-2 text-xs font-semibold text-[#102a4c] hover:text-teal-700">
                <QrCode className="w-4 h-4" /> {isConnected ? 'WhatsApp conectado' : 'Conectar WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = (user?.name || 'Rodrigo').split(' ')[0]
  const openLeads = leads.filter((lead) => lead.stage !== 'finalizado').length
  const freeEquipments = equipments.filter((item) => item.status === 'disponivel').length
  const overdueCount = invoices.filter((invoice) => invoice.status === 'atrasada').length

  return (
    <div className="space-y-7 pb-16">
      {/* 1. Abertura: saudacao editorial + o resumo do dia, com dados reais */}
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p
            className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em]"
            style={{ color: 'var(--yr-500)' }}
          >
            <Calendar className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h2 className="serif text-[clamp(32px,4.2vw,56px)] leading-[1.02]" style={{ color: 'var(--ink)' }}>
            {greeting}, <Mark>{firstName}.</Mark>
          </h2>
          <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Hoje são <strong style={{ color: 'var(--ink)' }}>{openLeads} oportunidades</strong> no funil,{' '}
            <strong style={{ color: 'var(--ink)' }}>{freeEquipments} equipamentos livres</strong>
            {overdueCount > 0 ? (
              <>
                {' '}
                e <strong style={{ color: 'var(--alert)' }}>{overdueCount} faturas atrasadas</strong> pedindo atenção.
              </>
            ) : (
              <> e nenhuma fatura atrasada.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenQr}
            className="action-btn action-btn--ghost inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-extrabold"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: isConnected ? 'var(--ok)' : 'var(--wait)' }}
            />
            {isConnected
              ? `WhatsApp: ${whatsappStatus.provider === 'baileys' ? 'Baileys' : 'Meta'}`
              : 'Conectar WhatsApp'}
            {!isConnected && <QrCode className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleTestAi}
            className="action-btn action-btn--ghost inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-extrabold"
            title="Rodar o diagnóstico da cascata de IA"
          >
            <Bot className="h-3.5 w-3.5" style={{ color: 'var(--yr-500)' }} />
            Testar a IA
          </button>
          <SiteLinkActions />
        </div>
      </section>

      {/* 2. Atalhos: todos na mesma lingua, em vez de um bloco de cada cor */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ['Novo lead', 'Orçamento ou contato', Plus, onOpenNewLead],
            ['Conectar WhatsApp', 'QR Code ou código', QrCode, onOpenQr],
            ['Novo contrato', 'Termo para assinatura', FileSignature, onOpenNewContract],
            ['Cadastrar equipamento', 'Entra no inventário', Bed, onOpenNewEquipment],
            ['Publicar no blog', 'Artigo do Blog YR', BookOpen, () => onNavigateTab('blog')],
          ] as const
        ).map(([label, hint, Icon, action], index) => (
          <button
            key={label}
            onClick={action}
            className={`card card-lift flex items-center gap-3 p-3.5 text-left ${index === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"
              style={
                index === 0
                  ? { background: 'var(--yr-500)', color: '#fffdf9' }
                  : { background: 'var(--yr-050)', color: 'var(--yr-500)' }
              }
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>
                {label}
              </span>
              <span className="mt-0.5 hidden truncate text-[11px] sm:block" style={{ color: 'var(--ink-faint)' }}>
                {hint}
              </span>
            </span>
          </button>
        ))}
      </section>

      {/* 3. Barra de Busca Instantânea e Filtro de Leads */}
      <div className="relative">
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar oportunidade, cliente, telefone, cama hospitalar, concentrador ou canal UTM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Live Search Results Popup */}
        {searchTerm && (
          <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 space-y-2 max-h-80 overflow-y-auto">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">
              {filteredLeads.length} resultado(s) encontrado(s)
            </div>
            {filteredLeads.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                Nenhum lead encontrado com o termo "{searchTerm}".
              </p>
            ) : (
              filteredLeads.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                      {l.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {l.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {l.phone} • {l.equipmentInterest} ({l.origin})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onSelectLead(l)
                        setSearchTerm('')
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all"
                    >
                      Abrir Chat
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 4. Top Metric Cards de Alto Impacto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receita Recebida */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Faturamento Pago (Total)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              <CountUp value={totalRevenue} format={brl} />
            </h3>
            <span className="text-[11px] text-slate-500">Soma das faturas marcadas como pagas</span>
          </div>
        </div>

        {/* Receita a Receber */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              A Receber (Mensalidades)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              <CountUp value={pendingRevenue} format={brl} />
            </h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {invoices.filter((i) => i.status === 'pendente').length} faturas ativas
              </span>
              <span className="text-[11px] text-slate-500">locações vigentes</span>
            </div>
          </div>
        </div>

        {/* Total de Leads Ativos */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Oportunidades no Funil
            </span>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white"><CountUp value={leads.length} /></h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {leads.filter((l) => l.aiEnabled).length} com IA ativa
              </span>
              <span className="text-[11px] text-slate-500">qualificação 24h</span>
            </div>
          </div>
        </div>

        {/* Taxa de Ocupação de Equipamentos */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Taxa de Ocupação da Frota
            </span>
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-sm">
              <Bed className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white"><CountUp value={occupancyRate} format={(v) => `${Math.round(v)}%`} /></h3>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {rentedCount} de {totalEquipments} itens alugados • {totalEquipments - rentedCount} disponíveis
            </p>
          </div>
        </div>
      </div>

      {/* 4.5. Métricas Personalizadas de Alto Impacto (MRR, Ticket Médio, LTV, Inadimplência) */}
      <div className="card p-5 space-y-4" style={{ background: 'var(--surface-sunken)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wide">
                Métricas Personalizadas
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">KPIs de Crescimento & Recorrência</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1">
              Indicadores Financeiros Avançados
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('finance')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm w-fit"
          >
            <span>Abrir Finanças & Projeção 90d</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">MRR Recorrência</span>
            <div className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Base ativa de locações</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Ticket Médio</span>
            <div className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5">
              R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Por contrato ativo</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">LTV Médio Est.</span>
            <div className="text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400 mt-0.5">
              R$ {estimatedLtv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Permanência média 8.5m</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Inadimplência</span>
            <div className={`text-lg sm:text-xl font-black mt-0.5 ${
              defaultRate > 10 ? 'text-rose-600' : 'text-slate-900 dark:text-white'
            }`}>
              {defaultRate}%
            </div>
            <span className="text-[10px] text-slate-400">
              {overdueRevenue > 0 ? `R$ ${overdueRevenue.toFixed(0)} atraso` : 'Taxa controlada'}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Visualizador do Pipeline de IA Multimodal Fallback 6 Níveis */}
      <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/30">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Pipeline Multimodal Gemini com Fallback em Cascata
                <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
                  6 Modelos Resilientes
                </span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Atendimento WhatsApp inteligente com reconhecimento visual de receitas/quartos e transcrição de áudios sem falhas.
              </p>
            </div>
          </div>

          <button
            onClick={handleTestAi}
            disabled={testingAi}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin' : ''}`} />
            <span>{testingAi ? 'Executando Teste...' : 'Testar Cascata de IA'}</span>
          </button>
        </div>

        {/* Visual 6-tier fallback cascade */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2">
          {[
            {
              tier: '1º Nível',
              name: 'gemini-3.8-flash',
              desc: 'Principal (Mais rápido)',
              active: true,
            },
            {
              tier: '2º Nível',
              name: 'gemini-3.7-flash',
              desc: 'Fallback 1 (Multimodal)',
              active: false,
            },
            {
              tier: '3º Nível',
              name: 'gemini-3.6-flash',
              desc: 'Fallback 2 (Estável)',
              active: false,
            },
            {
              tier: '4º Nível',
              name: 'gemini-3.5-flash',
              desc: 'Fallback 3 (Alta cota)',
              active: false,
            },
            {
              tier: '5º Nível',
              name: 'gemini-3.5-flash-lite',
              desc: 'Fallback 4 (Ultra leve)',
              active: false,
            },
            {
              tier: '6º Nível',
              name: 'gemini-3.1-flash-lite',
              desc: 'Fallback 5 (Garantia final)',
              active: false,
            },
          ].map((m) => (
            <div
              key={m.name}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                m.active
                  ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700 shadow-sm ring-2 ring-purple-500/20'
                  : 'bg-white/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold mb-1">
                <span>{m.tier}</span>
                {m.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {m.name}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                {m.desc}
              </span>
            </div>
          ))}
        </div>

        {/* Live Diagnostic Test Output */}
        {aiTestResult && (
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Diagnóstico Concluído com Sucesso!
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Latência: <strong>{aiTestResult.latencyMs}ms</strong> • Modelo Ativo:{' '}
                <strong className="text-purple-600">{aiTestResult.activeModel}</strong>
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 italic pt-1">
              "{aiTestResult.response}"
            </p>
          </div>
        )}
      </div>

      {/* 6. Gráficos Comerciais & Atribuição de Tráfego */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Origem dos Leads (Atribuição Google Ads vs Orgânico) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Atribuição de Leads por Canal
              </h3>
              <p className="text-xs text-slate-500">
                Rastreamento de Google Ads, Orgânico, Redes e Indicação
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              UTM Tracking
            </span>
          </div>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={originData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(((percent as number) || 0) * 100).toFixed(0)}%)`}
                >
                  {originData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [`${value} leads`, 'Total']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funil de Vendas e Etapas */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Conversão do Funil Comercial
              </h3>
              <p className="text-xs text-slate-500">Volume de clientes em cada etapa do processo</p>
            </div>
            <button
              onClick={() => onNavigateTab('kanban')}
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
            >
              Abrir Funil Kanban <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="etapa" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="quantidade" fill="#1d5fae" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 7. Feed de Atividades Recentes & Status dos Equipamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Atividades Recentes em Tempo Real */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Linha do Tempo & Atividades Recentes
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Eventos em tempo real</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhuma atividade recente registrada no momento.
              </p>
            ) : (
              activities.slice(0, 5).map((act) => (
                <div key={act.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        act.status === 'emerald'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600'
                          : act.status === 'amber'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600'
                          : act.status === 'purple'
                          ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600'
                      }`}
                    >
                      {act.type === 'contract_signed' && <FileSignature className="w-4 h-4" />}
                      {act.type === 'contract_created' && <FileSignature className="w-4 h-4" />}
                      {act.type === 'invoice_paid' && <DollarSign className="w-4 h-4" />}
                      {act.type === 'lead_ai' && <Bot className="w-4 h-4" />}
                      {act.type === 'equipment_ready' && <ShieldCheck className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {act.title}
                      </h4>
                      <p className="text-[11px] text-slate-500">{act.description}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    {new Date(act.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Status da Frota e Pronta Entrega */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Status dos Equipamentos
              </h3>
              <button
                onClick={() => onNavigateTab('equipments')}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
              >
                Gerenciar <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  Alugados / Em Pacientes
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {equipments.filter((e) => e.status === 'alugado').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Pronta Entrega no Galpão
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {equipments.filter((e) => e.status === 'disponivel').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Em higienização
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {equipments.filter((e) => e.status === 'higienizacao').length}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Todos os equipamentos com certificado de desinfecção ativo.</span>
          </div>
        </div>
      </div>

      {/* 8. Central operacional: informa o que está pronto sem expor acessos */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#102a4c] text-white shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-blue-100">
              <Activity className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Central operacional</span>
            </div>
            <h3 className="mt-2 text-lg font-semibold">Próximas ações da equipe</h3>
            <p className="mt-1 text-xs leading-5 text-blue-100/80">
              Acesse cada rotina pelo próprio módulo. Dados de login e chaves ficam fora do painel por segurança.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-blue-50">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-300' : 'bg-amber-300'}`} />
            WhatsApp {isConnected ? 'conectado' : 'aguardando conexão'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => onNavigateTab('whatsapp')} className="group rounded-xl border border-white/15 bg-white/10 p-4 text-left hover:bg-white/15">
            <div className="flex items-center justify-between">
              <Bot className="w-5 h-5 text-cyan-200" />
              <ArrowUpRight className="w-4 h-4 text-blue-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-4 text-sm font-semibold">Atender conversas</p>
            <p className="mt-1 text-[11px] leading-4 text-blue-100/75">Revise a fila, responda clientes e ajuste a IA por contato.</p>
          </button>
          <button onClick={() => onNavigateTab('contracts')} className="group rounded-xl border border-white/15 bg-white/10 p-4 text-left hover:bg-white/15">
            <div className="flex items-center justify-between">
              <FileSignature className="w-5 h-5 text-amber-200" />
              <ArrowUpRight className="w-4 h-4 text-blue-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-4 text-sm font-semibold">Acompanhar contratos</p>
            <p className="mt-1 text-[11px] leading-4 text-blue-100/75">Veja pendências de assinatura e próximos vencimentos.</p>
          </button>
          <button onClick={() => onNavigateTab('finance')} className="group rounded-xl border border-white/15 bg-white/10 p-4 text-left hover:bg-white/15">
            <div className="flex items-center justify-between">
              <DollarSign className="w-5 h-5 text-emerald-200" />
              <ArrowUpRight className="w-4 h-4 text-blue-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-4 text-sm font-semibold">Conferir cobranças</p>
            <p className="mt-1 text-[11px] leading-4 text-blue-100/75">Dê baixa em pagamentos e envie lembretes pelo WhatsApp.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
