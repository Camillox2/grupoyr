import { useState } from 'react'
import { Download, Save } from 'lucide-react'
import { customerApi, downloadCustomerFile } from '../lib/customerApi'
import { requestStatuses, today, type ServiceRequest } from '../lib/serviceRequests'
import { ServiceRequestTimeline } from './ServiceRequestTimeline'
export function ServiceRequestManager({request,users,onChange}:{request:ServiceRequest;users:{id:string;name:string}[];onChange:()=>Promise<void>}) {
  const [form,setForm]=useState(()=>({revision:request.revision||0,status:request.status,assignedTo:request.assignedTo||'',response:request.response||'',scheduledDate:request.scheduledDate||request.requestedDate||'',receiptReview:''}))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const approval=['renewal','withdrawal'].includes(request.type) && (!request.decision || request.decision==='pending')
  const stale=form.revision!==(request.revision||0)
  const save=async(decision?:string)=>{
    if(decision && !window.confirm(decision==='approved'?'Aprovar o pedido e criar o compromisso na agenda? Não altera valores, vigência nem estoque automaticamente.':'Confirmar que este pedido não foi aprovado? A resposta será exibida ao cliente.'))return
    setBusy(true);setError('')
    try {
      const next=await customerApi<ServiceRequest>('/api/client-operations/requests/'+request.id,'PUT',{...form,...(decision?{decision,confirmed:true,status:decision==='approved'?'scheduled':'resolved'}:{})})
      setForm({...form,revision:next.revision,status:next.status,scheduledDate:next.scheduledDate||form.scheduledDate});await onChange()
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <article className="yr-care-card yr-service-editor"><h3>{request.clientName || 'Cliente'}</h3><ServiceRequestTimeline request={request}/>
    {request.receiptId?<button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await downloadCustomerFile('/api/client-operations/receipts/'+request.receiptId,'comprovante')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><Download size={16}/>Baixar comprovante privado</button>:null}
    {request.status!=='resolved'?<form className="yr-care-form" onSubmit={e=>{e.preventDefault();void save()}}>
      {stale?<div role="status" className="yr-care-notice yr-care-wide">Outra pessoa atualizou este atendimento. <button type="button" onClick={()=>setForm({revision:request.revision||0,status:request.status,assignedTo:request.assignedTo||'',response:request.response||'',scheduledDate:request.scheduledDate||request.requestedDate||'',receiptReview:''})}>Carregar atualização</button></div>:null}
      <label>Responsável<select aria-label="Responsável" value={form.assignedTo} onChange={e=>setForm({...form,assignedTo:e.target.value})}><option value="">Assumir atendimento</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>Andamento<select aria-label="Andamento" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(requestStatuses).filter(([key])=>!approval || !['scheduled','resolved'].includes(key)).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      <label className="yr-care-wide">Resposta visível ao cliente<textarea required={form.status!=='open'||approval} maxLength={1000} value={form.response} onChange={e=>setForm({...form,response:e.target.value})} placeholder="Explique o próximo passo ou a conclusão."/></label>
      {approval||form.status==='scheduled'?<label>Dia agendado<input type="date" min={today()} value={form.scheduledDate} onChange={e=>setForm({...form,scheduledDate:e.target.value})}/></label>:null}
      {request.receiptId && form.status==='resolved'?<label>Conferência do documento<select aria-label="Conferência do documento" required value={form.receiptReview} onChange={e=>setForm({...form,receiptReview:e.target.value})}><option value="">Selecione</option><option value="accepted">Documento conferido</option><option value="rejected">Documento não aceito</option></select><small>Não confirma pagamento. A baixa é feita na conciliação.</small></label>:null}
      <div className="yr-care-row yr-care-wide" style={{justifyContent:'flex-start'}}><button className="yr-care-primary" disabled={busy||stale}><Save size={16}/>{busy?'Salvando…':'Salvar atendimento'}</button>{approval?<><button type="button" disabled={busy||stale||!form.response||!form.scheduledDate} onClick={()=>void save('approved')}>Aprovar e agendar</button><button type="button" disabled={busy||stale||!form.response} onClick={()=>void save('declined')}>Não aprovar pedido</button></>:null}</div>
    </form>:null}
    {error?<p role="alert" className="yr-care-notice yr-care-error">{error}</p>:null}
  </article>
}
