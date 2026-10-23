import { Check, Clock3 } from 'lucide-react'
import { dateLabel, requestStatuses, requestTypes, type ServiceRequest } from '../lib/serviceRequests'
export function ServiceRequestTimeline({ request }: { request: ServiceRequest }) {
  const steps = ['open', 'in_progress', 'scheduled', 'resolved']
  const current = Math.max(0, steps.indexOf(request.status))
  const visited = new Set(['open',request.status,...(request.history||[]).map(event=>event.status)])
  return <div className="yr-request-timeline">
    <div className="yr-care-row"><strong>{requestTypes[request.type] || 'Atendimento'}{request.contractNumber ? ' · '+request.contractNumber : ''}</strong>
      <span className={'yr-care-tag'+(request.status==='resolved'?' yr-care-tag--ok':' yr-care-tag--wait')}>{requestStatuses[request.status] || 'Recebida'}</span></div>
    <p>{request.message}</p>
    {request.requestedDate ? <small>Data desejada: {dateLabel(request.requestedDate)}{request.requestedMonths ? ' · '+request.requestedMonths+' meses' : ''}</small> : null}
    <ol className="yr-request-steps" aria-label="Andamento da solicitação">{steps.map((step,index)=><li key={step} className={visited.has(step)?'is-done':''} aria-current={step===request.status?'step':undefined}><span>{index<current&&visited.has(step)?<Check size={12}/>:<Clock3 size={12}/>}</span><small>{requestStatuses[step]}</small></li>)}</ol>
    {request.assignedName ? <p><small>Responsável: <strong>{request.assignedName}</strong></small></p> : null}
    {request.response ? <div className="yr-care-notice"><strong>Resposta da equipe</strong><p>{request.response}</p>{request.scheduledDate ? <small>Agendamento: {dateLabel(request.scheduledDate)}</small> : null}</div> : null}
    {request.decision==='declined' ? <small>Pedido não aprovado. Confira a resposta da equipe.</small> : request.decision==='approved' ? <small>Pedido aprovado para atendimento. A renovação só vale após formalização pela equipe.</small> : ['renewal','withdrawal'].includes(request.type) ? <small>Aguardando aprovação. O envio deste pedido não altera seu contrato.</small> : null}
    <details><summary>Histórico do atendimento</summary><ol className="yr-request-history">{(request.history || [{at:request.createdAt,status:'open'}]).map((event,i)=><li key={event.at+'-'+i}><small>{dateLabel(event.at)} · {requestStatuses[event.status] || 'Recebida'}{event.assignedName?' · '+event.assignedName:''}</small>{event.response?<p>{event.response}</p>:null}</li>)}</ol></details>
  </div>
}
