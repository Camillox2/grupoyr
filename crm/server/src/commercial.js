import { randomUUID } from 'node:crypto'
const text = (v,max=100) => typeof v === 'string' ? v.trim().replace(/\s+/g,' ').slice(0,max) : ''
const fold = v => text(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
const price = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000000 && Math.abs(v*100-Math.round(v*100)) < 0.000001
export function normalizeFreightRows(rows) {
  if (!Array.isArray(rows) || rows.length > 200) throw Error('Informe até 200 regiões de frete.')
  const keys = new Set()
  return rows.map(row => {
    const value = { id:text(row.id,80)||randomUUID(), city:text(row.city), district:text(row.district), productCode:text(row.productCode,60), deliveryPrice:row.deliveryPrice, pickupPrice:row.pickupPrice }
    if (!value.city || !price(value.deliveryPrice) || !price(value.pickupPrice)) throw Error('Informe cidade e valores de entrega e retirada válidos. Use 0 somente para frete gratuito.')
    const key = [value.city,value.district,value.productCode].map(fold).join('|')
    if (keys.has(key)) throw Error('Existe uma região/produto duplicada na tabela.')
    keys.add(key)
    return value
  })
}
export function findFreightRate(rows, { city, district, productCode, modality }) {
  const matches = (rows||[]).filter(r => fold(r.city) === fold(city) && (!r.district || fold(r.district) === fold(district)) && (!r.productCode || fold(r.productCode) === fold(productCode)) && price(r.deliveryPrice) && price(r.pickupPrice))
    .map(r=>({ row:r,score:(r.district?2:0)+(r.productCode?1:0) })).sort((a,b)=>b.score-a.score)
  if (!matches.length || (matches[1] && matches[1].score === matches[0].score)) return null
  const r=matches[0].row
  return { rateId:r.id, deliveryCents:Math.round(r.deliveryPrice*100), pickupCents:modality==='locacao'?Math.round(r.pickupPrice*100):0, basis:'por pedido; não por unidade' }
}
export function registerCommercialRoutes(app,{ database,requireAuth,emit=()=>{} }) {
  const auth=requireAuth(['admin','vendedor'])
  const wrap=fn=>async(req,res)=>{try{await database.ready;res.setHeader('Cache-Control','no-store');await fn(req,res)}catch{res.status(503).json({error:'Não foi possível salvar/consultar os dados comerciais. Tente novamente.'})}}
  const view=()=>({revision:Number(database.getSettings().freightRevision)||0,rows:database.getSettings().freightRates||[]})
  const flush=async()=>{if(database.flush)await database.flush();else if(database.writeQueue)await database.writeQueue}
  app.get('/api/commercial/freight',auth,wrap(async(_req,res)=>res.json(view())))
  app.put('/api/commercial/freight',auth,wrap(async(req,res)=>{
    const current=view()
    if(req.body.revision!==current.revision)return res.status(409).json({error:'Tabela alterada por outro vendedor. Recarregue antes de salvar.'})
    let rows
    try{rows=normalizeFreightRows(req.body.rows)}catch(error){return res.status(400).json({error:error.message})}
    database.updateSettings({freightRates:rows,freightRevision:current.revision+1,freightUpdatedAt:new Date().toISOString(),freightUpdatedBy:req.user.id})
    await flush()
    res.json(view())
  }))
  app.put('/api/equipments/:id/prices',auth,wrap(async(req,res)=>{
    const eq=database.find('equipments',e=>e.id===req.params.id)
    if(!eq)return res.status(404).json({error:'Equipamento não encontrado.'})
    const {monthlyPrice,salePrice}=req.body
    if(!price(monthlyPrice)||!price(salePrice))return res.status(400).json({error:'Informe preços válidos com até duas casas decimais. Zero significa preço não cadastrado.'})
    if(req.body.previousMonthlyPrice!==eq.monthlyPrice||req.body.previousSalePrice!==eq.salePrice)return res.status(409).json({error:'Preços alterados por outra pessoa. Atualize a tela e confira.'})
    const updated=database.update('equipments',eq.id,{monthlyPrice,salePrice,priceUpdatedAt:new Date().toISOString(),priceUpdatedBy:req.user.id})
    await flush()
    emit('equipment:updated',updated)
    res.json(updated)
  }))
}

