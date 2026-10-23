// Customer-data collection is deterministic: the model never invents contract facts.
import { randomUUID } from 'node:crypto'
import { clean,normalizeConfig,qualificationSummary } from './yriaCore.js'
import { runAssistedYria,catalogOptions,monthsFor,quantity,human,quoteFor } from './yriaSales.js'
import { resolveOrderFreight } from './freightQuote.js'
import { pickupFreightDate } from './contractFreight.js'
const fold=v=>clean(v,2000).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
const brl=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
export function validTaxId(input) {
  const value=String(input||'').toUpperCase().replace(/[.\/-]/g,'')
  if(/^(.)\1+$/.test(value))return false
  if(/^\d{11}$/.test(value)){
    const digit=n=>{const sum=[...value.slice(0,n)].reduce((s,c,i)=>s+Number(c)*(n+1-i),0),d=(sum*10)%11;return d===10?0:d}
    return Number(value[9])===digit(9)&&Number(value[10])===digit(10)
  }
  if(!/^[A-Z0-9]{12}\d{2}$/.test(value))return false
  const digit=(text,weights)=>{const rem=[...text].reduce((s,c,i)=>s+(c.charCodeAt(0)-48)*weights[i],0)%11;return rem<2?0:11-rem}
  const first=digit(value.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])
  return Number(value[12])===first&&Number(value[13])===digit(value.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2])
}
const validName=v=>v.length>=5&&v.length<=120&&/^[\p{L}][\p{L} '-]+\s+[\p{L} '-]+$/u.test(v)&&!/(ignore|contrato|sistema|instrucoes)/.test(fold(v))
function dateValue(value,now){
  let v=value
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if(match)v=match[3]+'-'+match[2]+'-'+match[1]
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return ''
  const parsed=new Date(v+'T12:00:00Z')
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===v&&v>=now.toISOString().slice(0,10)&&parsed-now<=366*86400000?v:''
}
const questions={quantity:'Quantas unidades você deseja?',fullName:'Para preencher o contrato, qual é o nome completo do contratante (ou razão social)?',taxId:'Qual é o CPF ou CNPJ do contratante? Informe somente esse documento.',email:'Qual e-mail deve constar no contrato?',cep:'Qual é o CEP de entrega? Informe os 8 dígitos.',street:'Qual é a rua ou avenida de entrega?',number:'Qual é o número do imóvel? Se não tiver, escreva “sem número”.',complement:'Há complemento, apartamento ou bloco? Se não houver, escreva “sem complemento”.',state:'Qual é a UF de entrega? Exemplo: PR.',access:'O acesso é térreo, escada ou elevador? Para dificuldades de acesso, um consultor confirma a logística.',deliveryDate:'Qual é a data desejada para início/entrega? Use DD/MM/AAAA. É uma solicitação: a logística ainda confirmará a disponibilidade.'}
const steps=Object.keys(questions)
export function quoteIdentity(q){const freight={...q.freight};delete freight.quotedAt;delete freight.fallback;return JSON.stringify([q.product,q.productCode,q.unitCents,q.equipmentIds,q.quantity,q.months,q.modality,q.totalCents,freight,q.freightBillingVersion||1])}
export async function runAutomaticYria({previous={},catalog=[],freightRates=[],settings={},allowSandbox=false,quoteFreight=resolveOrderFreight,now=new Date(),...args}){
  const config=normalizeConfig(args.config)
  if(!config.automaticContractsEnabled&&!previous.checkout)return runAssistedYria({...args,previous,catalog,freightRates,config})
  let result
  if(!previous.checkout){
    result=await runAssistedYria({...args,previous,catalog,freightRates,config:{...config,assistedSalesEnabled:false,automaticContractsEnabled:false}})
    if(result.reason!=='qualified')return result
    result.state.checkout={attemptId:randomUUID(),step:'quantity',customer:{city:result.state.fields.city?.value||'',district:result.state.fields.district?.value||''},quote:null,attempts:0}
    result.handoff=false;result.reason='';result.state.status='collecting_contract_data'
    result.reply='Posso organizar o pedido e gerar um contrato para você ler e assinar, sem marcar pagamento ou entrega como concluídos. '+questions.quantity
    return result
  }
  const state=structuredClone(previous),checkout=state.checkout,text=clean(args.message?.content,2000),t=fold(text)
  result={state,reply:'',handoff:false,reason:'',summary:qualificationSummary(state),provider:{ok:null,skipped:true,code:'automatic_checkout',latencyMs:0}}
  const stop=(reason,reply)=>{state.status=reason;checkout.issue=reply;return{...result,handoff:true,reason,reply}}
  if(['contract_requested','contract_sent','awaiting_signature','needs_review','sales_cancelled','human_requested','qualified'].includes(state.status))return{...result,handoff:true,reason:state.status}
  if(!config.automaticContractsEnabled)return stop('qualified','A geração automática foi desativada. Vou passar o atendimento para um vendedor.')
  if(human(text)||/\bconsultor\b/.test(t))return stop('human_requested','Claro. Vou passar para um consultor continuar seu atendimento.')
  if(/\b(cancelar|cancele|desisti|nao quero mais)\b/.test(t))return stop('sales_cancelled','Tudo bem. Nenhum contrato ou pagamento foi concluído. Vou sinalizar sua decisão à equipe.')
  if(/\b(desconto|negociar|parcelar|gratis|na verdade|mudei|trocar|corrigir|errado|nao moro|quero comprar|quero alugar|ja paguei|ja assinei|ignore|sistema|diagnostico|prescricao)\b/.test(t))return stop('needs_review','Essa alteração ou condição precisa de conferência. Vou chamar um consultor antes de gerar o contrato.')
  if(checkout.step!=='confirmation'){
    const key=checkout.step,v=text.replace(/^(?:CPF|CNPJ|E-?mail|CEP|Rua|Número|UF|Nome completo)\s*:\s*/iu,'').trim()
    let valid=false,value=v
    if(key==='quantity'){value=quantity(v,true);valid=Number.isInteger(value)&&value>=1&&value<=10}
    if(key==='fullName')valid=validName(v)
    if(key==='taxId'){value=v.toUpperCase().replace(/[.\/-]/g,'');valid=validTaxId(value)}
    if(key==='email')valid=v.length<=120&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    if(key==='cep'){value=v.replace(/\D/g,'');valid=/^\d{8}$/.test(value)&&!/^0+$/.test(value)}
    if(key==='street')valid=v.length>=3&&v.length<=120&&!/[<>]/.test(v)
    if(key==='number'){value=t==='sem numero'?'s/n':v;valid=/^(?:\d{1,8}[A-Za-z]?|s\/n)$/.test(value)}
    if(key==='complement'){value=/^(?:sem complemento|nenhum|nao tem|nao)$/.test(t)?'':v;valid=value.length<=60&&!/[<>]/.test(value)}
    if(key==='state'){value=v.toUpperCase();valid=/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(value)}
    if(key==='access'){value=t;valid=/^terreo[.! ]*$/.test(t);if(/escada|elevador/.test(t))return stop('needs_review','Vou consultar a logística sobre o acesso, medidas e frete antes de gerar qualquer contrato.')}
    if(key==='deliveryDate'){value=dateValue(v,now);valid=Boolean(value)}
    if(!valid){checkout.attempts=(checkout.attempts||0)+1;if(checkout.attempts>=3||/nao sei|prefiro nao/.test(t))return stop('needs_review','Ainda falta confirmar um dado obrigatório. Vou passar para um consultor ajudar, sem preencher informações inventadas.');result.reply='Preciso desse dado válido, sem completar por conta própria. '+questions[key];return result}
    checkout.attempts=0;checkout.customer[key]=value
    checkout.step=steps[steps.indexOf(key)+1]||'confirmation'
    if(checkout.step!=='confirmation'){result.reply=questions[checkout.step];return result}
  }
  const options=catalogOptions(state,catalog),months=monthsFor(state),qty=checkout.customer.quantity
  if(options.length!==1||!months||qty>options[0].equipmentIds.length)return stop('needs_review','O modelo, preço, período ou estoque precisa de conferência. Vou chamar um consultor.')
  const equipment=catalog.find(e=>e.id===options[0].equipmentIds[0])
  const freight=await quoteFreight({equipment,units:options[0].equipmentIds.slice(0,qty).map(id=>catalog.find(e=>e.id===id)),quantity:qty,customer:checkout.customer,modality:state.fields.modality.value,settings:{...settings,freightRates},allowSandbox})
  if(!freight)return stop('needs_review','Não consegui uma cotação válida de frete na API nem na tabela manual. Vou consultar um vendedor, sem inventar o valor.')
  const computed=quoteFor(state,catalog,qty,freightRates,freight)
  if(computed.error)return stop('needs_review','Os valores ou estoque precisam de conferência. Vou chamar um consultor.')
  const quote=computed.quote,identity=quoteIdentity(quote),changed=!checkout.quote||checkout.fingerprint!==identity||now-new Date(checkout.quotedAt)>15*60000
  if(changed){
    checkout.quote=quote;checkout.fingerprint=identity;checkout.quotedAt=now.toISOString();state.status='awaiting_contract_confirmation'
    const c=checkout.customer
    const firstCharge=quote.unitCents*qty+freight.deliveryCents
    const billingText=' Primeira cobrança '+brl(firstCharge)+' (com frete de ida).'+(quote.modality==='locacao'&&quote.months>1?' Próximas mensalidades '+brl(quote.unitCents*qty)+' cada, sem frete de volta.':'')+(quote.modality==='locacao'&&freight.pickupCents>0?' Frete de retirada: cobrança única separada de '+brl(freight.pickupCents)+', vencimento '+pickupFreightDate({type:'locacao',startDate:c.deliveryDate,rentalMonths:quote.months}).split('-').reverse().join('/')+', sem mensalidade adicional. O vencimento não confirma o agendamento da coleta.':'')
    result.reply='Confira os dados antes de autorizar a geração: '+c.fullName+', CPF/CNPJ '+c.taxId+', e-mail '+c.email+'. Entrega: '+c.street+', '+c.number+(c.complement?' - '+c.complement:'')+', '+c.district+', '+c.city+'/'+c.state+', CEP '+c.cep+'. Acesso térreo. Data desejada '+c.deliveryDate+' (não garantida). '+qty+' unidade(s) de '+quote.product+' ('+quote.productCode+'), '+brl(quote.unitCents)+(quote.modality==='locacao'?' por unidade/mês, por '+quote.months+' mês(es)':' por unidade')+'. Entrega '+brl(freight.deliveryCents)+(quote.modality==='locacao'?', retirada '+brl(freight.pickupCents):'')+'. Frete: '+freight.basis+'. Total '+brl(quote.totalCents)+'. O contrato ficará aguardando sua leitura e assinatura; pagamento e entrega não estão concluídos. Para gerar, responda exatamente: confirmo os dados e autorizo gerar o contrato. Se algo estiver errado, peça a correção.'
    result.reply+=billingText
    return result
  }
  if(!/^confirmo os dados e autorizo gerar o contrato[.! ]*$/iu.test(text)){result.reply='Só gero o documento após você confirmar os dados e valores. Escreva “confirmo os dados e autorizo gerar o contrato” ou peça um consultor para corrigir qualquer informação.';return result}
  state.status='contract_requested';state.qualified=true
  return{...result,handoff:true,reason:'contract_requested',reply:'Pedido confirmado. Vou preparar o documento para sua leitura e assinatura.',automation:{attemptId:checkout.attemptId,customer:checkout.customer,quote:checkout.quote,fingerprint:checkout.fingerprint,confirmedAt:now.toISOString()}}
}
