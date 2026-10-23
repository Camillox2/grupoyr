import { useState } from 'react'
import { Send } from 'lucide-react'
import { customerApi } from '../lib/customerApi'
export function ShareCustomerLink({url,leadId,kind}:{url:string;leadId:string;kind:'portal'|'vistoria'}) {
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('')
  return <div className="yr-share-action"><button type="button" disabled={busy} onClick={async()=>{
    if(!window.confirm('Enviar o link pessoal '+(kind==='portal'?'do portal':'da vistoria')+' pelo WhatsApp desta ficha? Confira o cliente antes de confirmar.'))return
    setBusy(true);setNotice('');setError('')
    try {
      const result=await customerApi<{delivered?:boolean;message?:{deliveryStatus?:string}}>('/api/whatsapp/send','POST',{leadId,text:kind==='portal'?'Olá! Você pode acompanhar seus contratos, pagamentos e solicitações pelo portal do Grupo YR Hospitalar: '+url+'\nEste link é pessoal e válido por 7 dias.':'Olá! Registre as fotos do seu equipamento na vistoria do Grupo YR Hospitalar: '+url+'\nConfira o patrimônio antes de enviar. Este link é pessoal e válido por 7 dias.'})
      setNotice(result.delivered===true?'Link enviado pelo WhatsApp.':'Mensagem registrada, mas o envio ainda não foi confirmado. Confira a conexão e a conversa no CRM.')
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }}><Send size={16}/>{busy?'Enviando…':'Enviar pelo WhatsApp'}</button>
    {notice?<small role="status">{notice}</small>:null}{error?<small role="alert" className="yr-care-error">{error}</small>:null}
  </div>
}

