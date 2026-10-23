// Quote only: never purchases a shipping label or charges a customer.
import { findFreightRate } from './commercial.js'
const positive=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max
const cep=v=>String(v||'').replace(/\D/g,'')
export function normalizeShipping(raw={}) {
  if(![raw.widthCm,raw.heightCm,raw.lengthCm].every(v=>positive(v,500))||!positive(raw.weightKg,1000)||!positive(raw.insuranceValue,1000000))throw Error('Informe medidas embaladas em cm, peso em kg e valor segurado maiores que zero.')
  return {widthCm:raw.widthCm,heightCm:raw.heightCm,lengthCm:raw.lengthCm,weightKg:raw.weightKg,insuranceValue:raw.insuranceValue,carrierEligible:raw.carrierEligible===true}
}
export function normalizeFreightProvider(raw={},current={}) {
  const originPostalCode=cep(raw.originPostalCode),serviceId=String(raw.serviceId||'').trim()
  if(originPostalCode&&originPostalCode.length!==8)throw Error('CEP de origem inválido.')
  if(serviceId&&!/^\d{1,8}$/.test(serviceId))throw Error('Informe o ID numérico do serviço autorizado no Melhor Envio.')
  const token=typeof raw.token==='string'&&raw.token.trim()&&raw.token!=='__configured__'?raw.token.trim():current.token||''
  if(token.length>5000||/[\r\n]/.test(token))throw Error('Token inválido.')
  return {enabled:raw.enabled===true,sandbox:raw.sandbox!==false,originPostalCode,serviceId,token,approvedService:raw.approvedService===true}
}
export function freightProviderView(raw={}) {
  return {...raw,token:undefined,configured:Boolean(raw.token||process.env.MELHOR_ENVIO_TOKEN),sandbox:raw.sandbox!==false}
}
export async function resolveOrderFreight({equipment,units,quantity,customer,modality,settings={},allowSandbox=false,fetchImpl=fetch}) {
  const manual=findFreightRate(settings.freightRates||[],{city:customer.city,district:customer.district,productCode:equipment.productCode,modality})
  const provider=settings.freightProvider||{},token=provider.token||process.env.MELHOR_ENVIO_TOKEN||''
  let failure='API não configurada; tabela manual'
  if(provider.enabled&&token&&provider.approvedService&&provider.serviceId&&cep(provider.originPostalCode).length===8&&(provider.sandbox===false||allowSandbox)){
    try {
      if(cep(customer.cep).length!==8)throw Error('CEP inválido.')
      if(modality==='locacao'&&!manual)throw Error('Retirada da locação precisa de tarifa manual.')
      const s=normalizeShipping(equipment.shipping)
      if(units&&(units.length!==quantity||units.some(e=>JSON.stringify(normalizeShipping(e.shipping))!==JSON.stringify(s))))throw Error('Embalagens diferentes precisam de conferência manual.')
      if(!s.carrierEligible)throw Error('Equipamento não autorizado para transportadora.')
      const body={from:{postal_code:cep(provider.originPostalCode)},to:{postal_code:cep(customer.cep)},products:[{id:equipment.productCode||equipment.id,width:s.widthCm,height:s.heightCm,length:s.lengthCm,weight:s.weightKg,insurance_value:s.insuranceValue,quantity}],options:{receipt:false,own_hand:false},services:provider.serviceId}
      const response=await fetchImpl((provider.sandbox!==false?'https://sandbox.melhorenvio.com.br':'https://melhorenvio.com.br')+'/api/v2/me/shipment/calculate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','User-Agent':'Grupo YR CRM (rodrigo@grupoyrhospitalar.com.br)'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)})
      if(!response.ok)throw Error('API indisponível.')
      const rows=await response.json(),service=Array.isArray(rows)?rows.find(r=>String(r.id)===provider.serviceId&&!r.error):null,rawPrice=service?.custom_price??service?.price
      const amount=typeof rawPrice==='number'?rawPrice:typeof rawPrice==='string'&&/^\d+(?:\.\d{1,2})?$/.test(rawPrice)?Number(rawPrice):NaN
      if(!Number.isFinite(amount)||amount<0||amount>1000000)throw Error('Nenhuma cotação válida.')
      return {rateId:'melhor-envio-'+provider.serviceId,deliveryCents:Math.round(amount*100),pickupCents:modality==='locacao'?manual.pickupCents:0,basis:'Melhor Envio · '+String(service.company?.name||'Transportadora').slice(0,80)+' / '+String(service.name||'').slice(0,80)+'; postagem, sem montagem; CEPs e medidas embaladas',provider:'melhor_envio',sandbox:provider.sandbox!==false,quotedAt:new Date().toISOString(),originPostalCode:cep(provider.originPostalCode),destinationPostalCode:cep(customer.cep),pickupRateId:manual?.rateId||null}
    }catch{failure='API sem cotação utilizável; tabela manual'}
  }
  return manual?{...manual,provider:'manual',fallback:failure,sandbox:false}:null
}
