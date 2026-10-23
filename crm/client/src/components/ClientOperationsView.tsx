import { useEffect, useState } from 'react'
import { BellRing, RefreshCw, CheckCheck, Receipt, MessageSquare, TrendingUp } from 'lucide-react'
import { customerApi, reais } from '../lib/customerApi'
import { PageHeader } from './ui/PageHeader'
import { type ServiceRequest } from '../lib/serviceRequests'
import { ServiceRequestManager } from './ServiceRequestManager'
import { useSocket } from '../contexts/SocketContext'
import './inspection.css'

interface Operations {
  alerts: { id: string; title: string; detail: string; date: string }[]
  requests: ServiceRequest[]
  users: { id: string; name: string }[]
  appointments: { id:string; title:string; date:string; status:string; clientName:string; notes:string }[]
  entries: { id: string; source: string; reference: string; description: string; amountCents: number; date: string; status: string }[]
  contracts: { id: string; number: string; clientName: string; receivedCents: number; pendingCents: number; costCents: number; netCents: number }[]
  invoices: { id: string; clientName: string; contractNumber: string; amount: number; status: string; dueDate: string }[]
}

export function ClientOperationsView() {
  const {socket}=useSocket()
  const [data, setData] = useState<Operations | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ source: '', reference: '', amount: '', date: new Date().toLocaleDateString('en-CA'), description: '' })
  const load = async () => {
    try { setData(await customerApi<Operations>('/api/client-operations')); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }
  useEffect(() => {
    let active=true,pending=false
    const refresh=async()=>{if(!active||pending||document.hidden)return;pending=true;try{const next=await customerApi<Operations>('/api/client-operations');if(active){setData(next);setError('')}}catch(e){if(active)setError((e as Error).message)}finally{pending=false}}
    void refresh()
    const timer=setInterval(()=>void refresh(),15000)
    socket?.on('customer:updated',refresh)
    return()=>{active=false;clearInterval(timer);socket?.off('customer:updated',refresh)}
  }, [socket])
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setError(''); setNotice('')
    try { await fn(); await load() }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy('') }
  }
  return <div className="yr-care yr-operations">
    <PageHeader icon={<Receipt />} eyebrow="Pós-venda e controle financeiro" title="Operação e conciliação"
      description="Prazos, solicitações e recebimentos reais por contrato."
      actions={<button onClick={() => void act('load', load)} disabled={!!busy}><RefreshCw size={16} />Atualizar</button>} />
    {error ? <p role="alert" className="yr-care-notice yr-care-error">{error}</p> : null}
    {notice ? <p role="status" className="yr-care-notice yr-care-success">{notice}</p> : null}
    {!data ? <p role="status">Carregando operação…</p> : <>
      <div className="yr-care-metrics">
        <div className="yr-care-card"><small>Prazos e pendências</small><strong>{data.alerts.length}</strong></div>
        <div className="yr-care-card"><small>Movimentações não conciliadas</small><strong>{data.entries.filter(entry => entry.status === 'pending').length}</strong></div>
        <div className="yr-care-card"><small>Solicitações em andamento</small><strong>{data.requests.filter(request => request.status !== 'resolved').length}</strong></div>
      </div>
      <div className="yr-operation-columns">
        <div className="yr-care-stack">
          <section className="yr-care-card" aria-label="Conciliação com o extrato">
            <h2><Receipt size={20} style={{ display: 'inline', marginRight: 9 }} />Conciliação com o extrato</h2>
            <div className="yr-care-notice">Conferência manual, sem conexão bancária automática. Registre a movimentação do extrato, vincule uma cobrança de mesmo valor e confirme a conferência. Identificador repetido é bloqueado. Comprovante enviado pelo cliente não confirma pagamento sozinho.</div>
            <form className="yr-care-form" onSubmit={event => {
              event.preventDefault()
              void act('entry', async () => {
                await customerApi('/api/client-operations/entries', 'POST', { ...form, amountCents: Math.round(Number(form.amount.replace(',', '.')) * 100) })
                setForm(current => ({ ...current, reference: '', amount: '', description: '' }))
                setNotice('Movimentação registrada. Vincule e confira a cobrança abaixo.')
              })
            }}>
              <label>Banco / origem<input required maxLength={80} value={form.source} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} placeholder="Ex.: extrato da conta da empresa" /></label>
              <label>Identificador da transação<input required maxLength={120} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} placeholder="ID Pix ou identificador do extrato" /></label>
              <label>Valor recebido (R$)<input required inputMode="decimal" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="0,00" /></label>
              <label>Data do recebimento<input required type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
              <label className="yr-care-wide">Descrição<input maxLength={300} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
              <button className="yr-care-primary yr-care-wide" disabled={!!busy}>Registrar movimentação</button>
            </form>
            {data.entries.map(entry => <div className="yr-care-item" key={entry.id}>
              <div className="yr-care-row">
                <div><strong>{reais(entry.amountCents)} · {entry.source}</strong><p>{entry.date} · {entry.reference}</p><small>{entry.description}</small></div>
                <span className="yr-care-tag">{entry.status === 'reconciled' ? 'Conciliada' : 'Conferência pendente'}</span>
              </div>
              {entry.status === 'pending' ? <div className="yr-care-row yr-reconcile-match" style={{ marginTop: 12 }}>
                <select aria-label={'Cobrança para ' + entry.reference} value={matches[entry.id] || ''} onChange={event => {
                  const value = event.target.value
                  setMatches(current => ({ ...current, [entry.id]: value }))
                }}>
                  <option value="">Selecione a cobrança de mesmo valor</option>
                  {data.invoices.filter(invoice => ['pendente', 'atrasada'].includes(invoice.status) && Math.round(invoice.amount * 100) === entry.amountCents)
                    .map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.clientName} · {invoice.contractNumber || 'Sem contrato'} · {invoice.dueDate}</option>)}
                </select>
                <button className="yr-care-primary" disabled={!!busy || !matches[entry.id]} onClick={() => {
                  if (window.confirm('Confirma que conferiu esta movimentação no extrato e que ela quita integralmente a cobrança selecionada?')) {
                    void act(entry.id, async () => {
                      await customerApi('/api/client-operations/entries/' + entry.id + '/reconcile', 'POST', { invoiceId: matches[entry.id], confirmed: true })
                      setNotice('Recebimento conciliado. Baixa e trilha de conferência registradas juntas.')
                    })
                  }
                }}><CheckCheck size={16} />Conferir e conciliar</button>
              </div> : null}
            </div>)}
          </section>
          <section className="yr-care-card" aria-label="Resultado por contrato">
            <h2><TrendingUp size={20} style={{ display: 'inline', marginRight: 9 }} />Resultado por contrato</h2>
            <p>Recebido menos os custos registrados do contrato. Não inclui despesas gerais, impostos ou custos ainda não cadastrados.</p>
            {data.contracts.length ? data.contracts.map(contract => <div className="yr-care-item" key={contract.id}>
              <h3>{contract.number} · {contract.clientName}</h3>
              <div className="yr-care-form">
                <p>Recebido: <strong>{reais(contract.receivedCents)}</strong><br />Em aberto: {reais(contract.pendingCents)}</p>
                <p>Custos registrados: {reais(contract.costCents)}<br />Resultado: <strong>{reais(contract.netCents)}</strong></p>
              </div>
            </div>) : <p>Os resultados aparecerão quando houver contratos reais.</p>}
          </section>
        </div>
        <div className="yr-care-stack">
          <section className="yr-care-card" aria-label="Alertas da operação">
            <h2><BellRing size={20} style={{ display: 'inline', marginRight: 9 }} />Alertas da operação</h2>
            <p>Renovações em até 7 dias, pagamentos vencidos e compromissos de entrega, retirada e manutenção. Também vão para as notificações do CRM e push quando habilitado.</p>
            {data.alerts.length ? data.alerts.map(alert => <div className="yr-care-item" key={alert.id}>
              <strong>{alert.title}</strong><p>{alert.detail}</p><small>{alert.date}</small>
            </div>) : <div className="yr-care-empty"><BellRing size={24} /><p>Nenhum prazo ou pagamento pendente encontrado nos registros atuais.</p></div>}
          </section>
          <section className="yr-care-card" aria-label="Agenda do pós-venda">
            <h2>Agenda do pós-venda</h2><p>Pedidos aprovados aparecem aqui e na agenda do sistema. Não alteram a vigência ou o estoque por conta própria.</p>
            {(data.appointments||[]).length ? [...data.appointments].sort((a,b)=>a.date.localeCompare(b.date)).map(event=><div className="yr-care-item" key={event.id}><div className="yr-care-row"><strong>{event.title}</strong><span className="yr-care-tag">{event.status==='done'?'Realizado':event.status==='cancelled'?'Cancelado':'Agendado'}</span></div><p>{event.clientName} · {new Date(event.date+'T12:00:00').toLocaleDateString('pt-BR')}</p><small>{event.notes}</small></div>) : <p>Nenhum pedido aprovado com compromisso na agenda ainda.</p>}
          </section>
        </div>
      </div>
      <section className="yr-care-card" aria-label="Solicitações do portal">
        <h2><MessageSquare size={20} style={{ display: 'inline', marginRight: 9 }} />Solicitações do portal</h2>
        {data.requests.length ? <div className="yr-service-grid">{data.requests.map(request => <ServiceRequestManager key={request.id} request={request} users={data.users||[]} onChange={load}/>)}</div> : <p>Nenhuma solicitação recebida.</p>}
      </section>
    </>}
  </div>
}
