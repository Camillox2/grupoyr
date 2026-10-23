import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { customerApi, downloadCustomerFile } from '../lib/customerApi'
import { receiptStatuses, type PaymentReceipt } from '../lib/serviceRequests'
export function PortalInvoiceReceipt({base,invoiceId,open,receipts,onChange}:{base:string;invoiceId:string;open:boolean;receipts:PaymentReceipt[];onChange:()=>Promise<void>}) {
  const [file,setFile]=useState<File|null>(null),[accepted,setAccepted]=useState(false),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  return <div className="yr-receipt-panel">
    {receipts.map(receipt=><div className="yr-care-row yr-receipt-row" key={receipt.id}><div><strong>{receiptStatuses[receipt.reviewStatus] || 'Aguardando conferência'}</strong><small>{receipt.fileName} · {Math.ceil(receipt.size/1024)} KB</small></div><button type="button" disabled={busy} onClick={async()=>{setError('');setBusy(true);try{await downloadCustomerFile(base+'/receipts/'+receipt.id,receipt.fileName)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><Download size={16}/>Baixar comprovante</button></div>)}
    {open ? <details><summary>Enviar comprovante desta cobrança</summary><form className="yr-care-stack" onSubmit={async event=>{
      event.preventDefault();const element=event.currentTarget;if(!file)return;setBusy(true);setError('');setNotice('')
      try {
        if(file.size>8*1024*1024 || (file.type==='application/pdf' && file.size>5*1024*1024)) throw new Error('Envie uma imagem de até 8 MB ou um PDF de até 5 MB.')
        const body=new FormData();body.append('receipt',file);body.append('accepted',String(accepted));body.append('notes',notes)
        await customerApi(base+'/invoices/'+encodeURIComponent(invoiceId)+'/receipts','POST',body)
        setFile(null);setAccepted(false);setNotes('');element.reset();await onChange()
        setNotice('Comprovante recebido. A cobrança continuará em aberto até a conferência do pagamento pela equipe.')
      }catch(e){setError((e as Error).message)}finally{setBusy(false)}
    }}>
      <label>Foto ou PDF<input required type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <label>Observação (opcional)<input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      <label className="yr-care-check"><input required type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Estou enviando somente um comprovante financeiro, sem informações clínicas.</span></label>
      <button className="yr-care-primary" disabled={busy || !file || !accepted}><Upload size={16}/>{busy?'Enviando…':'Enviar comprovante'}</button>
      <small>Fotos são convertidas para economizar espaço. PDF de até 5 MB; imagens de até 8 MB. Não dá baixa automática.</small>
    </form></details> : null}
    {error?<p role="alert" className="yr-care-notice yr-care-error">{error}</p>:null}{notice?<p role="status" className="yr-care-notice yr-care-success">{notice}</p>:null}
  </div>
}
