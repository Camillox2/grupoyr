import { useEffect, useState } from 'react'
import { FileText, ShieldCheck, Camera, MessageSquare, WalletCards, Moon, Sun, Download } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { customerApi, downloadCustomerFile, reais, type Inspection } from '../lib/customerApi'
import { type ServiceRequest, type PaymentReceipt, today } from '../lib/serviceRequests'
import { ServiceRequestTimeline } from './ServiceRequestTimeline'
import { PortalInvoiceReceipt } from './PortalInvoiceReceipt'
import { InspectionPhotos, PrivatePhoto } from './InspectionPhotos'
import { Mark } from './ui/PageHeader'
import './inspection.css'

interface Portal {
  client: { name: string }
  contracts: { id: string; number: string; type: string; status: string; equipmentNames: string; startDate: string; endDate: string }[]
  invoices: { id: string; contractNumber: string; kind?: string; amount: number; dueDate: string; status: string; paidAt?: string }[]
  requests: ServiceRequest[]
  receipts: PaymentReceipt[]
  inspections: Inspection[]
  notice: string
}
const labels: Record<string, string> = {
  pendente_assinatura: 'Aguardando assinatura', assinado: 'Assinado', cancelado: 'Cancelado',
  encerrado: 'Encerrado', rascunho: 'Rascunho', pendente: 'Em aberto', atrasada: 'Vencida',
  paga: 'Paga', cancelada: 'Cancelada',
}
const dateLabel = (value: string) => {
  if (!value) return 'Não informado'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

export function PublicCustomerView({ token, kind }: { token: string; kind: 'inspection' | 'portal' }) {
  const { theme, toggleTheme } = useTheme()
  const base = kind === 'inspection' ? '/api/public-inspections/' + encodeURIComponent(token) : '/api/client-portal/' + encodeURIComponent(token)
  const [row, setRow] = useState<Inspection | null>(null)
  const [portal, setPortal] = useState<Portal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('question')
  const [notice, setNotice] = useState('')
  const [requestForm, setRequestForm] = useState({contractId:'',requestedDate:'',requestedMonths:'1'})
  const refreshPortal = async () => setPortal(await customerApi<Portal>(base))
  useEffect(() => {
    if (kind !== 'portal' || loading) return
    let active = true, pending = false
    const refresh = async () => {
      if (!active || pending || document.hidden || !navigator.onLine) return
      pending = true
      try { const next = await customerApi<Portal>(base); if (active) setPortal(next) }
      catch { /* Keep the current record; explicit actions display errors. */ }
      finally { pending = false }
    }
    const timer = setInterval(() => void refresh(), 15000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active=false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [base,kind,loading])
  useEffect(() => {
    let active = true
    const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer'; document.head.append(referrer)
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex,nofollow,noarchive'; document.head.append(robots)
    customerApi<Inspection | Portal>(base).then(value => {
      if (!active) return
      if (kind === 'inspection') { setRow(value as Inspection); setName((value as Inspection).clientName || '') }
      else setPortal(value as Portal)
    }).catch(reason => { if (active) setError((reason as Error).message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; referrer.remove(); robots.remove() }
  }, [base, kind])
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <div className="yr-care-public">
    <header><div>
      <img src="/yr-hospitalar-logo.jpg" alt="Grupo YR Hospitalar" />
      <div className="yr-public-brand"><strong>Grupo YR Hospitalar</strong><p style={{ fontSize: 12, margin: 0 }}>{kind === 'inspection' ? 'Vistoria digital do equipamento' : 'Portal do cliente'}</p></div>
      <button type="button" className="yr-public-theme" aria-label={theme === 'light' ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'} onClick={event => {
        const box = event.currentTarget.getBoundingClientRect()
        toggleTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
      }}>
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>
    </div></header>
    <main className="yr-care">
      {loading ? <p role="status">Abrindo seu atendimento…</p> : null}
      {error ? <p role="alert" className="yr-care-notice yr-care-error">{error}</p> : null}
      {notice ? <p role="status" className="yr-care-notice yr-care-success">{notice}</p> : null}
      {row ? <>
        <div className="yr-care-head">
          <div><span className="yr-care-eyebrow">{row.phase === 'delivery' ? 'Entrega · antes' : 'Retirada · depois'}</span>
            <h1><Mark>Olá, {row.clientName.split(' ')[0]}</Mark></h1><p>{row.equipmentName} · Patrimônio {row.serialNumber}</p></div>
          <button disabled={busy} onClick={()=>void act(()=>downloadCustomerFile(base+'/report.pdf','vistoria.pdf'))}><Download size={17}/>Baixar vistoria PDF</button>
        </div>
        <div className="yr-public-inspection-layout">
          <section className="yr-care-card" aria-label="Fotos do equipamento">
            <InspectionPhotos row={row} base={base} onChange={setRow} publicMode />
          </section>
          <section className="yr-care-card yr-public-inspection-confirm" aria-label="Conferência da vistoria">
            <h2><ShieldCheck size={20} style={{ display: 'inline', marginRight: 9 }} />Conferência da vistoria</h2>
            {row.status === 'draft' ? <form onSubmit={event => {
              event.preventDefault()
              void act(async () => {
                setRow(await customerApi<Inspection>(base + '/complete', 'POST', { accepted, name, notes, revision: row.revision }))
                setNotice('Vistoria recebida. A equipe já pode consultar suas fotos no CRM.')
              })
            }}>
              <p>Confira as imagens antes de enviar. A equipe recebe as fotos no CRM, vinculadas ao seu equipamento.</p>
              <div className="yr-care-stack" style={{ marginTop: 16 }}>
                <label>Seu nome<input required minLength={3} value={name} onChange={event => setName(event.target.value)} /></label>
                <label>Observações (somente sobre o equipamento)<textarea maxLength={600} value={notes} onChange={event => setNotes(event.target.value)} /></label>
              </div>
              <label className="yr-care-check" style={{ margin: '16px 0' }}>
                <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
                <span>Conferi o patrimônio e as fotos enviadas. Após concluir, este registro ficará preservado.</span>
              </label>
              <button className="yr-care-primary" style={{ width: '100%' }} disabled={busy || !accepted || !row.photos.length}>
                <ShieldCheck size={17} />{busy ? 'Concluindo…' : 'Concluir e enviar vistoria'}
              </button>
            </form> : <div className="yr-care-notice yr-care-success">
              <p>Registro concluído e preservado.</p><small>Para incluir novas informações, entre em contato com a equipe responsável.</small>
            </div>}
          </section>
        </div>
      </> : null}
      {portal ? <>
        <div className="yr-care-head">
          <div><span className="yr-care-eyebrow">Seu atendimento em um só lugar</span>
            <h1><Mark>Olá, {portal.client.name.split(' ')[0]}</Mark></h1><p>Contratos, pagamentos e acompanhamento do seu equipamento.</p></div>
          <ShieldCheck size={28} />
        </div>
        <div className="yr-care-notice">{portal.notice}</div>
        <div className="yr-portal-grid">
          <section className="yr-care-card yr-portal-contracts">
            <h2><FileText size={20} style={{ display: 'inline', marginRight: 9 }} />Meus contratos</h2>
            {portal.contracts.length ? portal.contracts.map(contract => <div className="yr-care-item yr-care-row" key={contract.id}>
              <div><strong>{contract.number}</strong><p>{contract.equipmentNames}</p><small>{labels[contract.status] || contract.status} · {dateLabel(contract.startDate)} a {dateLabel(contract.endDate)}</small></div>
              <a className="yr-care-button" href={base + '/contracts/' + encodeURIComponent(contract.id) + '/html'} target="_blank" rel="noreferrer"><FileText size={16} />Ver contrato</a>
            </div>) : <p>Ainda não há contrato vinculado ao seu atendimento.</p>}
          </section>
          <section className="yr-care-card yr-portal-payments">
            <h2><WalletCards size={20} style={{ display: 'inline', marginRight: 9 }} />Pagamentos</h2>
            {portal.invoices.length ? portal.invoices.map(invoice => <div className="yr-care-item" key={invoice.id}><div className="yr-care-row">
              <div><strong>{reais(invoice.amount * 100)}</strong>{invoice.kind === 'frete_retirada' ? <p>Frete de retirada — cobrança única, não mensal</p> : invoice.kind === 'mensalidade' ? <p>Mensalidade</p> : null}<p>{invoice.contractNumber || 'Cobrança'} · Vencimento {dateLabel(invoice.dueDate)}</p></div>
              <span className={`yr-care-tag${invoice.status === 'paga' ? ' yr-care-tag--ok' : invoice.status === 'atrasada' ? ' yr-care-tag--alert' : invoice.status === 'pendente' ? ' yr-care-tag--wait' : ''}`}>{labels[invoice.status] || invoice.status}</span>
              </div><PortalInvoiceReceipt base={base} invoiceId={invoice.id} open={['pendente','atrasada'].includes(invoice.status)} receipts={(portal.receipts||[]).filter(receipt=>receipt.invoiceId===invoice.id)} onChange={refreshPortal}/>
            </div>) : <p>Nenhuma cobrança cadastrada.</p>}
            <small>Este painel não é um extrato bancário. Um pedido sobre pagamento não dá baixa automática.</small>
          </section>
          <section className="yr-care-card yr-portal-inspections">
            <h2><Camera size={20} style={{ display: 'inline', marginRight: 9 }} />Vistorias do meu equipamento</h2>
            {portal.inspections.length ? portal.inspections.map(inspection => <div className="yr-care-item" key={inspection.id}>
              <div className="yr-care-row"><h3>{inspection.phase === 'delivery' ? 'Entrega' : 'Retirada'} · {inspection.serialNumber}</h3>
                <span className="yr-care-tag">{inspection.status === 'completed' ? 'Concluída' : 'Em andamento'} · {inspection.photos.length} fotos</span></div>
              <div className="yr-care-photos">{inspection.photos.map(photo => <PrivatePhoto key={photo.id} photo={photo} url={base + '/inspections/' + inspection.id + '/photos/' + photo.id} />)}</div>
              <button disabled={busy} onClick={()=>void act(()=>downloadCustomerFile(base+'/inspections/'+inspection.id+'/report.pdf','vistoria.pdf'))}><Download size={16}/>Baixar vistoria PDF</button>
              {inspection.status === 'draft' ? <small>Peça à equipe o link da vistoria para enviar fotos.</small> : null}
            </div>) : <p>As fotos registradas pela equipe aparecerão aqui.</p>}
          </section>
          <section className="yr-care-card yr-portal-support">
            <h2><MessageSquare size={20} style={{ display: 'inline', marginRight: 9 }} />Falar com a equipe</h2>
            <form className="yr-care-stack" onSubmit={event => {
              event.preventDefault()
              void act(async () => {
                await customerApi(base + '/requests', 'POST', { type: subject, message, ...requestForm, requestedMonths:Number(requestForm.requestedMonths) })
                setMessage('')
                setNotice('Solicitação recebida. Um responsável dará continuidade ao seu atendimento.')
                setPortal(await customerApi<Portal>(base))
              })
            }}>
              <label>Assunto<select value={subject} onChange={event => setSubject(event.target.value)}>
                <option value="question">Dúvida / atendimento</option><option value="maintenance">Manutenção do equipamento</option><option value="payment">Pagamento / comprovante</option>
                <option value="renewal">Pedir renovação da locação</option><option value="withdrawal">Pedir retirada do equipamento</option>
              </select></label>
              {['renewal','withdrawal'].includes(subject)?<><label>Contrato de locação<select required value={requestForm.contractId} onChange={e=>setRequestForm({...requestForm,contractId:e.target.value})}><option value="">Selecione sua locação</option>{portal.contracts.filter(c=>c.status==='assinado'&&c.type==='locacao').map(c=><option key={c.id} value={c.id}>{c.number} · {c.equipmentNames}</option>)}</select></label><label>Data desejada<input required type="date" min={today()} value={requestForm.requestedDate} onChange={e=>setRequestForm({...requestForm,requestedDate:e.target.value})}/></label>{subject==='renewal'?<label>Período desejado (meses)<input required type="number" min={1} max={36} value={requestForm.requestedMonths} onChange={e=>setRequestForm({...requestForm,requestedMonths:e.target.value})}/></label>:null}<small>Sujeito à aprovação e formalização pela equipe. Seu contrato não será alterado automaticamente.</small></>:null}
              <label>Mensagem<textarea required minLength={5} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Descreva sua solicitação, sem dados clínicos." /></label>
              <button className="yr-care-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitação'}</button>
            </form>
            {portal.requests.map(request => <div key={request.id} className="yr-care-item">
              <ServiceRequestTimeline request={request}/>
            </div>)}
          </section>
        </div>
      </> : null}
      <footer className="yr-public-footer"><small>Grupo YR Hospitalar · Ambiente privado do cliente</small></footer>
    </main>
  </div>
}
