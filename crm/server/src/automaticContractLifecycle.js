import {createHash} from 'node:crypto'
import {commitCommercialRecords} from './commercialCommit.js'
const copy=v=>structuredClone(v)
export async function signAutomaticContract(database,id,{signatureDataUrl,signerName,signerIp,accepted},now=new Date()){
 const c=database.find('contracts',c=>c.id===id)
 if(!c?.automatic||c.status!=='pendente_assinatura'||!c.reservationExpiresAt||c.reservationExpiresAt<=now.toISOString())throw Error('Contrato ou reserva indisponível. Peça uma nova cotação.')
 if(accepted!==true)throw Error('É necessário ler e aceitar o contrato.')
 if(typeof signatureDataUrl!=='string'||!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(signatureDataUrl)||signatureDataUrl.length>1000000||signatureDataUrl.length<100)throw Error('Assinatura inválida.')
 const name=String(signerName||'').trim()
 if(name.length<5||name.length>120||!name.includes(' '))throw Error('Informe o nome completo do signatário.')
 const equipments=c.equipmentIds.map(id=>database.find('equipments',e=>e.id===id))
 if(equipments.some(e=>!e||e.status!=='reservado'||e.reservationContractId!==id))throw Error('A reserva mudou. Consulte a equipe antes de assinar.')
 const signedAt=now.toISOString(),evidence={...c,signerName:name,signatureDataUrl,signedAt,signerIp:String(signerIp||'').slice(0,200),accepted:true}
 const contract={...evidence,status:'assinado',documentHash:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}
 const changes=[{collection:'contracts',expected:copy(c),data:contract}]
 for(const e of equipments)changes.push({collection:'equipments',expected:copy(e),data:{...e,status:c.type==='venda'?'vendido':'alugado',currentContractId:id,reservationContractId:null,reservationExpiresAt:null}})
 const lead=database.find('leads',l=>l.id===c.leadId)
 if(lead)changes.push({collection:'leads',expected:copy(lead),data:{...lead,stage:'assinado_entrega',aiEnabled:false,notes:'Contrato '+c.number+' assinado. Pagamento e agendamento da entrega ainda precisam de confirmação.'}})
 await commitCommercialRecords(database,changes)
 return contract
}
export async function changeAutomaticContractStatus(database,id,status,{reason='',user=null}={},now=new Date()){
 const c=database.find('contracts',c=>c.id===id)
 if(!c?.automatic||!((c.status==='pendente_assinatura'&&status==='cancelado')||(c.status==='assinado'&&['cancelado','encerrado'].includes(status))))throw Error('Transição não permitida. Contrato automático cancelado exige nova cotação e confirmação.')
 reason=String(reason).trim().slice(0,300)
 if(status==='cancelado'&&reason.length<3)throw Error('Informe o motivo do cancelamento.')
 const contract={...c,status,statusReason:reason,statusChangedAt:now.toISOString(),statusHistory:[...(c.statusHistory||[]),{from:c.status,to:status,at:now.toISOString(),by:user?.id||null,reason}].slice(-20)}
 const changes=[{collection:'contracts',expected:copy(c),data:contract}],released=[],cancelledInvoices=[]
 for(const e of database.filter('equipments',e=>e.reservationContractId===id&&e.status==='reservado'||e.currentContractId===id&&e.status==='alugado')){
  const next={...e,status:e.status==='reservado'?'disponivel':'higienizacao',reservationContractId:null,reservationExpiresAt:null,currentLeadId:null,currentClientName:null,currentContractId:null}
  released.push(next);changes.push({collection:'equipments',expected:copy(e),data:next})
 }
 // A sold unit is never automatically returned to available inventory.
 if(status==='cancelado')for(const i of database.filter('invoices',i=>i.contractNumber===c.number&&['pendente','atrasada'].includes(i.status))){
  const next={...i,status:'cancelada',cancelledAt:now.toISOString()};cancelledInvoices.push(next);changes.push({collection:'invoices',expected:copy(i),data:next})
 }
 const lead=database.find('leads',l=>l.id===c.leadId)
 let updatedLead=null
 if(lead&&['contrato_gerado','assinado_entrega','locacao_ativa'].includes(lead.stage)){
  updatedLead={...lead,stage:status==='encerrado'?'finalizado':'proposta_enviada',aiEnabled:false}
  changes.push({collection:'leads',expected:copy(lead),data:updatedLead})
 }
 await commitCommercialRecords(database,changes)
 return{contract,lead:updatedLead,released,cancelledInvoices}
}

