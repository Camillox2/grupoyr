import { normalizeShipping,normalizeFreightProvider,freightProviderView,resolveOrderFreight } from './freightQuote.js'
import { isDeepStrictEqual } from 'node:util'
import { commitCommercialRecords } from './commercialCommit.js'
export function registerFreightApiRoutes(app,{database,requireAuth,emit=()=>{},fetchImpl=fetch}){
 const auth=requireAuth(['admin','vendedor']),admin=requireAuth(['admin']),quotas=new Map()
 const wrap=fn=>async(req,res)=>{try{await database.ready;res.setHeader('Cache-Control','no-store');await fn(req,res)}catch{res.status(503).json({error:'Não foi possível concluir. Confira conexão e tente novamente.'})}}
 const view=()=>({revision:Number(database.getSettings().freightProviderRevision)||0,...freightProviderView(database.getSettings().freightProvider||{})})
 app.get('/api/commercial/freight/provider',admin,wrap(async(_req,res)=>res.json(view())))
 app.put('/api/commercial/freight/provider',admin,wrap(async(req,res)=>{
  const settings=database.getSettings()
  if(req.body.revision!==view().revision)return res.status(409).json({error:'Configuração alterada. Recarregue antes de salvar.'})
  let provider
  try{provider=normalizeFreightProvider(req.body,settings.freightProvider)}catch(e){return res.status(400).json({error:e.message})}
  if(provider.enabled&&(!provider.originPostalCode||!provider.serviceId||!provider.approvedService||!(provider.token||process.env.MELHOR_ENVIO_TOKEN)))return res.status(400).json({error:'Para ativar, informe token, CEP de origem, ID do serviço e confirme sua adequação aos equipamentos.'})
  const revision=view().revision+1
  database.updateSettings({freightProvider:provider,freightProviderRevision:revision})
  await database.flush?.()
  if(database.pool){
   const saved=await database.pool.query("SELECT data->>'freightProviderRevision' AS revision FROM crm_settings WHERE id=1")
   if(Number(saved.rows[0]?.revision)!==revision)throw Error('not_persisted')
  }
  res.json(view())
 }))
 app.put('/api/equipments/:id/shipping',auth,wrap(async(req,res)=>{
  const eq=database.find('equipments',e=>e.id===req.params.id)
  if(!eq)return res.status(404).json({error:'Equipamento não encontrado.'})
  if(!isDeepStrictEqual(eq.shipping||null,req.body.previousShipping||null))return res.status(409).json({error:'Medidas alteradas por outra pessoa. Atualize a tela.'})
  let shipping
  try{shipping=normalizeShipping(req.body.shipping)}catch(e){return res.status(400).json({error:e.message})}
  const updated={...eq,shipping,shippingUpdatedAt:new Date().toISOString(),shippingUpdatedBy:req.user.id}
  await commitCommercialRecords(database,[{collection:'equipments',expected:structuredClone(eq),data:updated}]);emit('equipment:updated',updated);res.json(updated)
 }))
 app.post('/api/commercial/freight/quote',auth,wrap(async(req,res)=>{
  const time=Date.now(),q=quotas.get(req.user.id)||{at:time,count:0}
  if(time-q.at>60000){q.at=time;q.count=0}
  if(++q.count>10)return res.status(429).json({error:'Aguarde um minuto antes de novas cotações.'})
  quotas.set(req.user.id,q)
  const equipment=database.find('equipments',e=>e.id===req.body.equipmentId),quantity=Number(req.body.quantity)
  if(!equipment||!Number.isInteger(quantity)||quantity<1||quantity>10||!['compra','locacao'].includes(req.body.modality))return res.status(400).json({error:'Selecione produto, modalidade e quantidade entre 1 e 10.'})
  const customer=Object.fromEntries(['cep','city','district'].map(k=>[k,String(req.body[k]||'').trim().slice(0,100)]))
  const quote=await resolveOrderFreight({equipment,quantity,customer,modality:req.body.modality,settings:database.getSettings(),allowSandbox:true,fetchImpl})
  if(!quote)return res.status(422).json({error:'Sem cotação da API e sem região correspondente na tabela. Cadastre o frete manualmente.'})
  res.json({quote,quoteOnly:true})
 }))
}
