import React, { useCallback, useEffect, useState } from 'react'
import { BarChart3, ArrowUpRight, Download, RefreshCw, Link2, ShieldCheck, Copy, Check, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, Legend } from 'recharts'
import { requestInsights } from '../lib/insightsRequest'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader, ActionButton, Notice } from './ui/PageHeader'
import { TabType } from './Sidebar'

type AdsMetrics = {costMicros:number;clicks:number;impressions:number;conversions:number;conversionValue:number}
interface Insights {
  asOf:string
  range:{start:string;end:string;days:number}
  metrics:{newLeads:number;signedContracts:number;receivedCents:number;registeredCostCents:number;registeredBalanceCents:number;overdueCents:number;overdueCount:number;activeRentals:number;monthlyRentalBaseCents:number;fleet:number;rented:number;available:number;occupancy:number|null;cohortSignedPercent:number|null;pendingSignatures:number;unresponsive:number}
  alerts:{id:string;tone:string;title:string;text:string;target:TabType}[]
  sources:{name:string;value:number}[]
  daily:{date:string;receivedCents:number;costCents:number}[]
  leadPerformance?: {
    daily:{date:string;leads:number;signedContracts:number;adCostMicros:number|null;adConversions:number|null;partial:boolean}[]
    weekdays:{weekday:number;name:string;days:number;leads:number;averageLeads:number|null;coveredAdDays:number;adCostMicros:number|null;adConversions:number|null;costPerAdConversionMicros:number|null}[]
    bestDays:string[];maximumLeads:number;note:string
  }
  ads:{accountId:string;connectionConfigured:boolean;connected:boolean;complete:boolean;stale:boolean;lastSyncAt:string|null;generatedAt:string|null;totals:AdsMetrics|null;cpc:number|null;cpa:number|null;ctr:number|null;campaigns:{id:string;name:string;status:string;metrics:AdsMetrics|null}[];source:string;attribution:string}
  methodology:{financial:string;operations:string;conversion:string;database:string;paidWithoutDate:number;source:string}
}
const money = (value:number|null) => value===null ? '—' : (value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const count = (value:number|null) => value===null ? '—' : value.toLocaleString('pt-BR',{maximumFractionDigits:2})
const dateLabel = (value:string) => new Date(value+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
const statusLabel:Record<string,string> = {ENABLED:'Ativa',PAUSED:'Pausada',REMOVED:'Removida',UNKNOWN:'Desconhecida',UNSPECIFIED:'Não informado'}
function saveDownload(text:string,type:string,name:string) {
  const url=URL.createObjectURL(new Blob([text],{type}))
  const a=document.createElement('a');a.href=url;a.download=name;a.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),5000)
}
const csvCell = (value:unknown) => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""') + '"'
export const InsightsView:React.FC<{onNavigate:(tab:TabType)=>void}> = ({onNavigate}) => {
  const {user,token}=useAuth()
  const [days,setDays]=useState(30)
  const [data,setData]=useState<Insights|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [refresh,setRefresh]=useState(0)
  const [script,setScript]=useState('')
  const [creating,setCreating]=useState(false)
  const [copied,setCopied]=useState(false)
  const [notice,setNotice]=useState('')
  const headers=useCallback(()=>({Authorization:'Bearer '+(token || '')}),[token])
  useEffect(()=>{
    if(user?.role!=='admin' || !token) return
    const controller=new AbortController()
    setLoading(true);setError('')
    requestInsights<Insights>(token,days,controller.signal)
      .then(result=>{
        if(controller.signal.aborted)return
        if(!result?.metrics || !result?.ads || !result?.range || !Array.isArray(result.daily) || !Array.isArray(result.sources) || !Array.isArray(result.alerts))throw new Error('Resposta incompleta do servidor. Tente novamente.')
        setData(result)
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[days,refresh,user?.id,user?.role,token])
  async function createScript() {
    if(!window.confirm('Gerar uma chave restrita para receber relatórios da conta 707-147-2143? Uma chave anterior deixará de funcionar. O Google pedirá sua autorização antes de executar o script.')) return
    setCreating(true);setNotice('')
    try {
      const r=await fetch('/api/integrations/google-ads/script',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({confirmReadOnly:true})})
      if(!r.ok) throw new Error('Não foi possível preparar a conexão.')
      const result=await r.json();setScript(result.script);setCopied(false)
      setNotice('Script gerado. Proteja este código: ele contém a chave restrita de envio. A conexão só fica ativa após a execução confirmada pelo Google.')
    }catch(e){setNotice(e instanceof Error?e.message:'Falha ao preparar a conexão.')}finally{setCreating(false)}
  }
  async function copyScript(){
    try{await navigator.clipboard.writeText(script);setCopied(true)}catch{setNotice('O navegador não liberou a cópia. Use Baixar script.')}
  }
  function exportCsv(){
    if(!data)return
    const rows:unknown[][]=[['Grupo YR — Insights',data.range.start,data.range.end],['Atualizado em',data.asOf],['Fonte CRM',data.methodology.source],['Nota',data.methodology.financial],
      ['Data','Recebido (R$)','Custos cadastrados (R$)'],...data.daily.map(d=>[d.date,(d.receivedCents/100).toFixed(2),(d.costCents/100).toFixed(2)]),
      [],['Data de entrada','Leads no CRM','Contratos assinados','Gasto Google Ads (R$)','Conversões Google Ads','Dia parcial'],...(data.leadPerformance?.daily || []).map(d=>[d.date,d.leads,d.signedContracts,d.adCostMicros===null?null:(d.adCostMicros/1e6).toFixed(2),d.adConversions,d.partial?'Sim':'Não']),
      [],['Dia da semana','Dias completos','Leads','Média de leads por dia','Dias com gasto importado','Gasto Google Ads (R$)'],...(data.leadPerformance?.weekdays || []).map(d=>[d.name,d.days,d.leads,d.averageLeads,d.coveredAdDays,d.adCostMicros===null?null:(d.adCostMicros/1e6).toFixed(2)]),
      [],['Origem cadastrada (não atribuição Ads)','Leads'],...data.sources.map(s=>[s.name,s.value]),
      [],['Google Ads','Conta','Última sincronização','Período completo'],['Relatórios',data.ads.accountId,data.ads.lastSyncAt,data.ads.complete?'Sim':'Não'],
      ['Campanha','Status atual','Gasto (R$)','Cliques','Impressões','Conversões Google Ads'],...data.ads.campaigns.map(c=>[c.name,statusLabel[c.status],c.metrics?(c.metrics.costMicros/1e6).toFixed(2):null,c.metrics?.clicks,c.metrics?.impressions,c.metrics?.conversions]),
      ['Atribuição',data.ads.attribution]]
    saveDownload('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8','yr-insights-'+data.range.start+'-'+data.range.end+'.csv')
  }
  if(user?.role!=='admin')return <Notice tone="wait">Insights financeiros e integrações são exclusivos da administração.</Notice>
  const m=data?.metrics,ads=data?.ads
  const cards=m?[
    {label:'Recebido no período',value:money(m.receivedCents),note:'Pagamentos com data de baixa',accent:true},
    {label:'Novos leads',value:count(m.newLeads),note:'Criados no período selecionado'},
    {label:'Contratos assinados',value:count(m.signedContracts),note:'Pela data da assinatura'},
    {label:'Custos cadastrados',value:money(m.registeredCostCents),note:'Somente despesas vinculadas a contratos'},
  ]:[]
  return <div className="insights-view space-y-6 min-w-0" aria-busy={loading} style={{color:'var(--ink)'}}>
    <PageHeader icon={<BarChart3/>} eyebrow="Gestão com dados reais" title="Insights e Google Ads"
      description="O que entrou, o que pede atenção e como os anúncios estão performando."
      actions={<><ActionButton variant="ghost" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15} className={loading?'motion-safe:animate-spin':''}/>{loading&&data?'Atualizando…':'Atualizar'}</ActionButton><ActionButton disabled={!data || loading || data.range.days!==days} onClick={exportCsv}><Download size={15}/>Exportar CSV</ActionButton></>}/>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="text-sm font-semibold flex flex-wrap items-center gap-3">Período
        <select aria-label="Período dos insights" value={days} onChange={e=>setDays(Number(e.target.value))} className="rounded-xl border p-3" style={{background:'var(--surface)',borderColor:'var(--border)'}}>
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
        </select>
      </label>
      <p role="status" aria-live="polite" className="text-xs min-h-8" style={{color:'var(--ink-muted)'}}>{data?<>{dateLabel(data.range.start)+' a '+dateLabel(data.range.end)+' · Brasília · atualizado '+new Date(data.asOf).toLocaleTimeString('pt-BR')}{loading?' · Atualizando…':''}{data.range.days!==days?<span className="block font-semibold">Exibindo os últimos {data.range.days} dias até concluir a consulta de {days} dias.</span>:null}</>:'Carregando dados do CRM…'}</p>
    </div>
    {!data&&loading&&<div aria-label="Preparando indicadores" className="space-y-5">
      <div aria-hidden="true" className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3">{[0,1,2,3].map(i=><div key={i} className="card p-5 min-h-36"><div className="h-3 w-28 rounded" style={{background:'var(--surface-sunken)'}}/><div className="h-8 w-36 rounded my-4" style={{background:'var(--surface-sunken)'}}/><div className="h-3 w-44 max-w-full rounded" style={{background:'var(--surface-sunken)'}}/></div>)}</div>
      <div aria-hidden="true" className="grid lg:grid-cols-[1.3fr_1fr] gap-5">{[0,1].map(i=><div key={i} className="card p-5 min-h-80"><div className="h-4 w-48 max-w-full rounded" style={{background:'var(--surface-sunken)'}}/><div className="h-52 rounded-2xl mt-5" style={{background:'var(--surface-sunken)'}}/></div>)}</div>
    </div>}
    {error&&<Notice tone="alert">{error} <button className="underline ml-2" onClick={()=>setRefresh(n=>n+1)}>Tentar novamente</button></Notice>}
    {data&&m&&ads&&<>
      <div data-testid="insights-metrics" className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(c=><div key={c.label} className="card p-5 min-w-0" style={c.accent?{background:'#10345b',color:'#fff'}:{}}>
          <p className="text-xs font-bold uppercase tracking-wide">{c.label}</p>
          <p className="text-[clamp(23px,2.2vw,32px)] font-semibold my-3 break-words">{c.value}</p>
          <p className="text-xs opacity-75">{c.note}</p>
        </div>)}
      </div>
      {data.leadPerformance ? <section className="card min-w-0 p-4 sm:p-6" aria-labelledby="lead-performance-title">
        <h3 id="lead-performance-title" className="font-bold">Entrada de leads e gasto diário em Ads</h3>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>Mesmas datas, duas medidas: quantidade de novos leads e investimento importado do Google Ads. Não representa lucro nem comprova que o anúncio gerou cada contato.</p>
        {data.leadPerformance.bestDays.length ? <p className="mt-3 text-sm"><strong>Maior entrada em dia completo:</strong> {data.leadPerformance.bestDays.slice(0,3).map(dateLabel).join(', ')}{data.leadPerformance.bestDays.length>3?' e outros dias empatados':''} · {data.leadPerformance.maximumLeads} lead(s).</p> : <p className="mt-3 text-xs">Ainda não há leads registrados em dias completos deste período.</p>}
        <div className="mt-4 h-64 min-w-0 w-full" aria-label="Gráfico diário de leads e gasto em Google Ads">
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.leadPerformance.daily.map(row=>({...row,adSpend:row.adCostMicros===null?null:row.adCostMicros/1e6}))} margin={{top:8,right:0,left:0,bottom:8}}>
            <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={30} tick={{fontSize:10,fill:'var(--ink-muted)'}}/>
            <YAxis yAxisId="leads" allowDecimals={false} width={30} tick={{fontSize:10,fill:'var(--ink-muted)'}}/>
            <YAxis yAxisId="ads" orientation="right" width={60} tickFormatter={value=>'R$ '+Number(value).toLocaleString('pt-BR',{maximumFractionDigits:0})} tick={{fontSize:10,fill:'var(--ink-muted)'}}/>
            <Tooltip labelFormatter={value=>dateLabel(String(value))} formatter={(value,name)=>[name==='Gasto Google Ads'?money(Number(value)*100):count(Number(value)),name]} contentStyle={{background:'var(--surface)',borderRadius:12,borderColor:'var(--border)',color:'var(--ink)'}}/>
            <Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="leads" name="Novos leads" dataKey="leads" fill="#2168b4" radius={[4,4,0,0]} isAnimationActive={false}/>
            <Line yAxisId="ads" name="Gasto Google Ads" dataKey="adSpend" stroke="#40a69b" strokeWidth={2} dot={{r:2}} connectNulls={false} isAnimationActive={false}/>
          </ComposedChart></ResponsiveContainer>
        </div>
        {!data.leadPerformance.daily.some(row=>row.adCostMicros!==null) ? <p className="text-xs font-semibold" style={{color:'var(--ink-muted)'}}>Sem gasto importado para estas datas. A linha de Ads fica ausente, não em zero.</p> : null}
        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
          <div className="min-w-0"><h4 className="text-sm font-bold">Quais dias da semana recebem mais leads?</h4><p className="mt-1 text-xs" style={{color:'var(--ink-muted)'}}>Média por dia completo, para comparar semanas com quantidades diferentes de segundas, terças etc.</p>
            <div className="mt-3 h-56 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.leadPerformance.weekdays} margin={{top:8,right:8,left:0,bottom:8}}>
              <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="name" tickFormatter={name=>String(name).slice(0,3)} tick={{fontSize:10,fill:'var(--ink-muted)'}}/>
              <YAxis width={36} tickFormatter={value=>Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2})} tick={{fontSize:10,fill:'var(--ink-muted)'}}/><Tooltip formatter={value=>[count(Number(value)),'Leads por dia completo']} contentStyle={{background:'var(--surface)',borderRadius:12,borderColor:'var(--border)',color:'var(--ink)'}}/>
              <Bar dataKey="averageLeads" name="Leads por dia completo" fill="#2168b4" radius={[4,4,0,0]} isAnimationActive={false}/>
            </BarChart></ResponsiveContainer></div>
          </div>
          <div className="min-w-0"><h4 className="text-sm font-bold">Eficiência dos anúncios por dia da semana</h4><p className="mt-1 text-xs" style={{color:'var(--ink-muted)'}}>Custo por conversão registrada pelo Google, não por venda do CRM. Só aparece quando todos os dias comparados têm gasto importado.</p>
            <ul className="mt-3 space-y-2">{data.leadPerformance.weekdays.map(row=><li key={row.weekday} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs" style={{borderColor:'var(--border)'}}><span>{row.name} · {row.days} dia(s)</span><strong>{row.days===0?'Sem dias completos':row.costPerAdConversionMicros!==null?money(row.costPerAdConversionMicros/10000):row.coveredAdDays<row.days?'Sem cobertura completa':'Sem conversões'}</strong></li>)}</ul>
          </div>
        </div>
        <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold">Ver os números de cada dia</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead><tr><th className="p-2">Data</th><th className="p-2">Leads</th><th className="p-2">Assinados</th><th className="p-2">Gasto Ads</th><th className="p-2">Conversões Ads</th></tr></thead><tbody>{data.leadPerformance.daily.map(row=><tr key={row.date} className="border-t" style={{borderColor:'var(--border)'}}><td className="p-2">{dateLabel(row.date)}{row.partial?' · parcial':''}</td><td className="p-2">{row.leads}</td><td className="p-2">{row.signedContracts}</td><td className="p-2">{row.adCostMicros===null?'Sem dados':money(row.adCostMicros/10000)}</td><td className="p-2">{row.adConversions===null?'Sem dados':count(row.adConversions)}</td></tr>)}</tbody></table></div></details>
        <p className="mt-4 text-xs leading-relaxed" style={{color:'var(--ink-muted)'}}>{data.leadPerformance.note}</p>
      </section> : null}
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <section className="card p-5 min-w-0" aria-labelledby="cash-title">
          <h3 id="cash-title" className="font-bold">Entradas e custos registrados</h3>
          <p className="text-xs mt-1 mb-4" style={{color:'var(--ink-muted)'}}>Valores em reais. O saldo cadastrado não representa lucro.</p>
          {data.daily.some(d=>d.receivedCents || d.costCents)?<div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={data.daily.map(d=>({...d,received:d.receivedCents/100,cost:d.costCents/100}))} margin={{top:8,right:8,left:0,bottom:8}}>
              <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={30} tick={{fontSize:10,fill:'var(--ink-muted)'}}/>
              <YAxis width={45} tick={{fontSize:10,fill:'var(--ink-muted)'}}/><Tooltip labelFormatter={v=>dateLabel(String(v))} formatter={v=>money(Number(v)*100)} contentStyle={{background:'var(--surface)',borderRadius:12,borderColor:'var(--border)',color:'var(--ink)'}}/>
              <Bar name="Recebido" dataKey="received" fill="#2168b4" radius={[4,4,0,0]} isAnimationActive={false}/><Bar name="Custos cadastrados" dataKey="cost" fill="#40a69b" radius={[4,4,0,0]} isAnimationActive={false}/>
            </BarChart></ResponsiveContainer>
          </div>:<p className="rounded-2xl p-7 text-sm my-4" style={{background:'var(--surface-sunken)'}}>Nenhum recebimento ou custo cadastrado neste período. Cadastre os movimentos em Financeiro para começar.</p>}
          <div className="flex flex-wrap gap-4 text-xs font-semibold"><span style={{color:'#2168b4'}}>Recebimentos</span><span style={{color:'#308b81'}}>Custos cadastrados</span><span>Saldo parcial: {money(m.registeredBalanceCents)}</span></div>
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-4">Prioridades de agora</h3>
          {data.alerts.length?data.alerts.map(a=><button key={a.id} onClick={()=>onNavigate(a.target)} className="w-full text-left rounded-2xl border p-4 mb-3 hover:opacity-80" style={{borderColor:'var(--border)',background:a.tone==='warning'?'var(--surface-sunken)':'var(--surface)'}}>
            <span className="flex justify-between gap-3 font-semibold text-sm">{a.title}<ArrowUpRight size={17} className="shrink-0"/></span>
            <span className="block text-xs leading-relaxed mt-2" style={{color:'var(--ink-muted)'}}>{a.text}</span>
          </button>):<p className="text-sm leading-relaxed" style={{color:'var(--ink-muted)'}}>Nenhum alerta pelas regras de cobrança, assinatura, estoque e última interação. Isso não substitui a revisão das conversas.</p>}
        </section>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <section className="card p-5">
          <h3 className="font-bold mb-4">Operação atual</h3>
          <dl className="space-y-3 text-sm">
            {[['Equipamentos disponíveis',count(m.available)+' de '+m.fleet],['Ocupação da frota',m.occupancy===null?'Sem equipamentos':count(m.occupancy)+'%'],['Locações ativas',count(m.activeRentals)],['Base mensal contratada',money(m.monthlyRentalBaseCents)],['Cobranças vencidas',money(m.overdueCents)]].map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-bold text-right">{value}</dd></div>)}
          </dl><p className="text-xs leading-relaxed mt-5" style={{color:'var(--ink-muted)'}}>Base mensal = mensalidades de locações assinadas e vigentes hoje; não é caixa recebido. Equipamentos vendidos não entram na frota.</p>
        </section>
        <section className="card p-5">
          <h3 className="font-bold">Origem dos novos leads</h3>
          <p className="text-xs mt-1 mb-4" style={{color:'var(--ink-muted)'}}>Origem cadastrada no CRM, não atribuição validada do Ads.</p>
          {data.sources.length?data.sources.map(s=><div key={s.name} className="mb-4"><div className="flex justify-between gap-3 text-sm mb-2"><span className="break-words min-w-0">{s.name}</span><strong>{s.value}</strong></div><div className="h-1.5 rounded-full" style={{background:'var(--surface-sunken)'}}><div className="h-full rounded-full" style={{width:(s.value/m.newLeads*100)+'%',background:'#2168b4'}}/></div></div>):<p className="text-sm">Nenhum lead criado neste período.</p>}
          <p className="text-xs mt-5" style={{color:'var(--ink-muted)'}}>Leads do período com contrato assinado: {m.cohortSignedPercent===null?'—':count(m.cohortSignedPercent)+'%'}. {data.methodology.conversion}</p>
        </section>
      </div>
      <section className="card p-5 sm:p-6 min-w-0" aria-labelledby="ads-title">
        <div className="flex flex-wrap justify-between gap-4 items-start mb-5"><div><h3 id="ads-title" className="font-bold flex gap-2 items-center"><Link2 size={19}/>Google Ads · Grupo YR</h3><p className="text-xs mt-2" style={{color:'var(--ink-muted)'}}>Conta 707-147-2143 · BRL · horário de Brasília</p></div>
          <span className="rounded-full px-3 py-2 text-xs font-bold" style={{background:'var(--surface-sunken)'}}>{!ads.connected?(ads.connectionConfigured?'Aguardando primeiro relatório':'Autorização pendente'):ads.stale?'Dados desatualizados':'Relatório recebido'}</span></div>
        {!ads.connected&&<Notice tone="info">A conta foi identificada no Chrome. Autorize e execute o script no Google Ads para trazer números reais; nada será exibido como zero enquanto a conexão não receber dados.</Notice>}
        {ads.connected&&!ads.complete&&<Notice tone="wait">O período selecionado ainda não está completamente coberto. Execute o script novamente; totais incompletos não são apresentados como resultados.</Notice>}
        {ads.stale&&<Notice tone="wait">A última sincronização tem mais de 26 horas. “Atualizar” consulta o banco do CRM; a coleta deve ser executada no Google Ads.</Notice>}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">{[
          ['Investimento',money(ads.totals?ads.totals.costMicros/10000:null)],['Cliques',count(ads.totals?.clicks??null)],['Impressões',count(ads.totals?.impressions??null)],['Conversões do Ads',count(ads.totals?.conversions??null)],
        ].map(([label,value])=><div key={label} className="p-4 rounded-2xl border min-w-0" style={{borderColor:'var(--border)'}}><p className="text-xs">{label}</p><p className="text-xl font-semibold mt-2 break-words">{value}</p></div>)}</div>
        <p className="text-sm mb-4">CPC: {money(ads.cpc===null?null:ads.cpc*100)} · CTR: {ads.ctr===null?'—':count(ads.ctr)+'%'} · Custo por conversão Ads: {money(ads.cpa===null?null:ads.cpa*100)}</p>
        {ads.campaigns.length>0&&<div className="space-y-2 mb-5">{ads.campaigns.map(c=><div key={c.id} className="flex flex-col sm:flex-row sm:justify-between gap-2 rounded-xl p-3 text-sm" style={{background:'var(--surface-sunken)'}}><div className="min-w-0"><strong className="break-words">{c.name}</strong><p className="text-xs mt-1">{statusLabel[c.status]||c.status} · status atual</p></div><span className="shrink-0">{money(c.metrics?c.metrics.costMicros/10000:null)} · {count(c.metrics?.clicks??null)} cliques</span></div>)}</div>}
        <p className="text-xs leading-relaxed mb-4" style={{color:'var(--ink-muted)'}}>{ads.attribution} Os números de conversão podem mudar após a coleta por atraso de atribuição do Google.</p>
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="ghost" disabled={creating} onClick={createScript}><ShieldCheck size={16}/>{creating?'Preparando…':ads.connectionConfigured?'Gerar novo script':'Preparar conexão'}</ActionButton>
          <a href="https://ads.google.com/aw/bulk/scripts/management" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Abrir Google Ads<ExternalLink size={14}/></a>
        </div>
        {notice&&<p role="status" className="text-sm mt-4 leading-relaxed">{notice}</p>}
        {script&&<div className="mt-5 rounded-2xl border p-4" style={{borderColor:'var(--border)'}}>
          <h4 className="font-semibold">Instalação na conta 707-147-2143</h4>
          <ol className="list-decimal pl-5 text-sm leading-relaxed space-y-2 my-3"><li>Google Ads → Ferramentas → Ações em massa → Scripts → Novo script.</li><li>Cole o código, salve como “Grupo YR — Relatórios CRM” e confirme a autorização do Google pessoalmente.</li><li>Execute. Uma visualização prévia também envia o relatório ao CRM, sem alterar campanhas.</li><li>Volte aqui e clique em Atualizar. Se desejar, configure a frequência no Google Ads após autorizar.</li></ol>
          <div className="flex flex-wrap gap-2 mb-3"><ActionButton onClick={copyScript}>{copied?<Check size={15}/>:<Copy size={15}/>}Copiar script</ActionButton><ActionButton variant="ghost" onClick={()=>saveDownload(script,'text/javascript;charset=utf-8','grupo-yr-relatorios-crm.js')}><Download size={15}/>Baixar script</ActionButton><ActionButton variant="ghost" onClick={()=>setScript('')}>Ocultar código</ActionButton></div>
          <textarea readOnly aria-label="Script de relatórios Google Ads" value={script} className="w-full h-52 rounded-xl p-3 text-xs font-mono" style={{background:'var(--surface-sunken)'}}/>
        </div>}
        <p className="text-xs mt-4" style={{color:'var(--ink-muted)'}}>Último relatório: {ads.lastSyncAt?new Date(ads.lastSyncAt).toLocaleString('pt-BR'):'Ainda não recebido'}. Nenhuma campanha, lance, orçamento ou cobrança é alterada por esta integração.</p>
      </section>
      <details className="card p-5"><summary className="cursor-pointer font-semibold">Fontes, critérios e limites dos indicadores</summary><div className="text-xs leading-relaxed space-y-3 mt-4" style={{color:'var(--ink-muted)'}}><p>{data.methodology.source} Banco: {data.methodology.database}.</p><p>{data.methodology.financial}</p><p>{data.methodology.operations}</p><p>{ads.source}. Coleta e conversões podem ter atraso. Período inclui o dia de hoje, ainda parcial.</p><p>Pagamentos sem data de baixa excluídos do período: {data.methodology.paidWithoutDate}. Não há estimativa de LTV com multiplicadores arbitrários.</p></div></details>
    </>}
  </div>
}
