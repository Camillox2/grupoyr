import React, { useEffect, useState } from 'react'
import { RotateCcw, Trash2, ShieldCheck } from 'lucide-react'
import { Lead } from '../types'
import { Modal } from './ui/Modal'
import { Notice } from './ui/PageHeader'
import { SubmitButton } from './ui/Feedback'
import { EmptyState } from './ui/ResponsiveTable'

type Impact = {
  revision:string; hasLinkedRecords:boolean
  contracts:{id:string;number:string;status:string}[]
  invoices:{id:string;status:string}[]
  equipmentCount:number; eventCount:number; expenseCount:number
}
async function request<T>(path:string, body?:unknown):Promise<T> {
  const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${localStorage.getItem('yr_crm_token') || ''}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const data=await response.json().catch(()=>null)
  if(!response.ok) throw new Error(data?.error || 'Não foi possível atualizar o funil.')
  return data
}
const inputStyle={background:'var(--surface-canvas)',color:'var(--ink)',border:'1px solid var(--border-strong)'}
const labels:Record<string,string>={paga:'paga',pendente:'em aberto',atrasada:'atrasada',cancelada:'cancelada',assinado:'assinado',pendente_assinatura:'aguardando assinatura',cancelado:'cancelado',encerrado:'encerrado',rascunho:'rascunho'}

export function FunnelArchiveDialog({lead,onClose,onUpdated,onNavigate}:{lead:Lead|null;onClose:()=>void;onUpdated:(lead:Lead,message:string)=>void;onNavigate:(tab:'contracts'|'finance')=>void}) {
  const [impact,setImpact]=useState<Impact|null>(null)
  const [reason,setReason]=useState('Cadastro incorreto')
  const [custom,setCustom]=useState('')
  const [acknowledge,setAcknowledge]=useState(false)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    if(!lead) return
    let active=true
    setImpact(null);setLoading(true);setError('');setReason('Cadastro incorreto');setCustom('');setAcknowledge(false)
    request<Impact>(`/api/leads/${encodeURIComponent(lead.id)}/funnel-impact`).then(data=>{if(active)setImpact(data)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[lead?.id,retry])
  const close=()=>{if(!busy)onClose()}
  const submit=async()=>{
    if(!lead || !impact || busy) return
    setBusy(true);setError('')
    try {
      const result=await request<{lead:Lead}>(`/api/leads/${encodeURIComponent(lead.id)}/funnel-archive`,{reason:reason==='Outro'?custom:reason,revision:impact.revision,acknowledgeLinked:acknowledge})
      onUpdated(result.lead,'Cartão excluído do funil. Você pode recuperá-lo na Lixeira.');onClose()
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível excluir.')}
    finally{setBusy(false)}
  }
  return <Modal open={!!lead} onClose={close} title="Excluir do funil" subtitle={lead?.name} icon={<Trash2 size={18}/>} size="md" footer={<div className="flex flex-wrap justify-end gap-2"><SubmitButton type="button" loading={false} disabled={busy} variant="ghost" onClick={close}>Cancelar</SubmitButton><SubmitButton type="button" loading={busy} disabled={!impact || loading || (impact.hasLinkedRecords&&!acknowledge) || (reason==='Outro'&&custom.trim().length<3)} onClick={submit}>Excluir do funil</SubmitButton></div>}>
    <p className="text-sm leading-relaxed" style={{color:'var(--ink)'}}>O cartão de <strong>{lead?.name}</strong> sairá do quadro e dos totais de oportunidades. A exclusão é reversível pela Lixeira.</p>
    <div className="mt-4 rounded-xl p-3 text-xs leading-relaxed" style={{background:'var(--yr-050)',color:'var(--yr-700)'}}><ShieldCheck size={16} className="mb-2"/>O cliente, as conversas e os anexos são preservados. A YRIA ficará pausada nesta conversa. Nenhuma mensagem será enviada.</div>
    {loading?<p role="status" className="mt-4 text-xs">Conferindo vínculos antes de excluir…</p>:null}
    {error?<div className="mt-4"><Notice tone="alert">{error}</Notice>{!impact?<button type="button" className="text-xs underline" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button>:null}</div>:null}
    {impact?.hasLinkedRecords?<div className="mt-4 rounded-xl border p-3 text-xs leading-relaxed" style={{borderColor:'var(--wait-border)',background:'var(--wait-surface)',color:'var(--ink)'}}>
      <strong>Excluir o cartão não cancela a venda, o contrato ou a cobrança.</strong>
      <ul className="mt-2 space-y-1">
        {impact.contracts.map(c=><li key={c.id}>Contrato {c.number}: {labels[c.status]||c.status}.</li>)}
        {impact.invoices.length?<li>{impact.invoices.length} cobrança(s), sendo {impact.invoices.filter(i=>i.status==='paga').length} paga(s). Permanecem no financeiro.</li>:null}
        {impact.equipmentCount?<li>{impact.equipmentCount} equipamento(s) vinculado(s). A reserva não será liberada.</li>:null}
        {impact.eventCount||impact.expenseCount?<li>{impact.eventCount} evento(s) e {impact.expenseCount} despesa(s) preservados.</li>:null}
      </ul>
      <div className="mt-3 flex flex-wrap gap-3"><button type="button" className="underline" disabled={busy} onClick={()=>{close();onNavigate('contracts')}}>Conferir contratos</button><button type="button" className="underline" disabled={busy} onClick={()=>{close();onNavigate('finance')}}>Conferir financeiro</button></div>
      <label className="mt-4 flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={acknowledge} onChange={e=>setAcknowledge(e.target.checked)}/><span>Entendi que isto remove apenas o cartão e não cancela contratos, cobranças ou reservas.</span></label>
    </div>:null}
    <label className="mt-4 block text-xs font-bold" htmlFor="funnel-reason">Motivo da exclusão</label>
    <select id="funnel-reason" className="mt-2 w-full rounded-xl p-3 text-sm" style={inputStyle} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}>
      {['Cadastro incorreto','Venda lançada por engano','Cadastro duplicado','Teste da equipe','Outro'].map(r=><option key={r}>{r}</option>)}
    </select>
    {reason==='Outro'?<><label className="mt-3 block text-xs" htmlFor="funnel-custom-reason">Descreva o motivo</label><textarea id="funnel-custom-reason" rows={3} maxLength={250} className="mt-2 w-full rounded-xl p-3 text-sm" style={inputStyle} value={custom} onChange={e=>setCustom(e.target.value)} disabled={busy}/></>:null}
  </Modal>
}

export function FunnelTrashView({leads,canManage,onUpdated}:{leads:Lead[];canManage:(lead:Lead)=>boolean;onUpdated:(lead:Lead,message:string)=>void}) {
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const restore=async(lead:Lead)=>{
    if(busy)return
    setBusy(lead.id);setError('')
    try{
      const result=await request<{lead:Lead}>(`/api/leads/${encodeURIComponent(lead.id)}/funnel-restore`,{revision:lead.funnelRevision||''})
      onUpdated(result.lead,'Cartão restaurado na etapa anterior. A YRIA continua pausada; reative apenas se desejar.')
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível restaurar.')}
    finally{setBusy('')}
  }
  return <section aria-label="Lixeira do funil">
    <Notice tone="info">Registros recuperáveis, sem apagar clientes ou documentos. Restaurar devolve o cartão à etapa anterior e não reativa a IA automaticamente.</Notice>
    {error?<Notice tone="alert">{error}</Notice>:null}
    {!leads.length?<EmptyState icon={<Trash2 size={20}/>} title="Nenhum cartão na Lixeira" description="Cartões excluídos aparecerão aqui. Ajuste a busca caso tenha aplicado um filtro."/>:<ul className="space-y-3">{leads.map(lead=><li key={lead.id} className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{background:'var(--surface-raised)',borderColor:'var(--border-subtle)'}}>
      <div className="min-w-0 text-xs leading-relaxed"><h3 className="break-words text-sm font-extrabold">{lead.name}</h3><p className="mt-1 break-words" style={{color:'var(--ink-muted)'}}>{lead.equipmentInterest} · {lead.phone}</p><p className="mt-2 break-words">{lead.funnelArchive?.reason}</p><p className="mt-1" style={{color:'var(--ink-muted)'}}>Excluído em {lead.funnelArchive?.at?new Date(lead.funnelArchive.at).toLocaleString('pt-BR'):''} por {lead.funnelArchive?.byName||'Equipe'}.</p></div>
      <SubmitButton type="button" loading={busy===lead.id} disabled={!!busy || !canManage(lead)} variant="ghost" onClick={()=>void restore(lead)}><RotateCcw size={16}/>Restaurar {lead.name}</SubmitButton>
    </li>)}</ul>}
  </section>
}
