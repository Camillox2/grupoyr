// Deterministic assisted ordering. No signatures, invoices, payments or reservations.
// The language model still qualifies only; all quoted amounts come from the catalog.
import { clean, normalizeConfig, qualificationSummary, runYriaTurn } from './yriaCore.js'
import { findFreightRate } from './commercial.js'

const fold = v => clean(v, 1000).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const finalStatuses = new Set(['qualified','order_prepared','sales_cancelled','human_requested','needs_review','technical_handoff'])
export const human = text => text.split(/[,;.!?]|\bmas\b/iu).some(t => !/\bnao\b/.test(fold(t)) && /(?:quero|prefiro|falar|chame|transfira|passe).{0,45}(?:vendedor|atendente|consultor|humano|uma pessoa)/iu.test(t))

export function monthsFor(state) {
  if (state.fields.modality?.value === 'compra') return 1
  const period = fold(state.fields.estimatedPeriod?.value)
  const m = period.match(/^(\d{1,3})\s*(mes|meses|dia|dias)$/)
  if (!m) return 0
  const n = Number(m[1]), months = m[2].startsWith('dia') ? n / 30 : n
  return Number.isInteger(months) && months >= 1 && months <= 24 ? months : 0
}
export function catalogOptions(state, catalog) {
  const interest = fold(state.fields.equipmentInterest?.value)
  const tokens = interest.split(/\s+/).filter(t => t.length > 2 && !['hospitalar','movimentos','tres','articulada'].includes(t))
  if (!tokens.length) return []
  const modality = state.fields.modality?.value, groups = new Map()
  for (const item of catalog) {
    const name = clean(item.name,120), haystack = fold(name + ' ' + clean(item.category)), id = clean(item.id)
    const cents = Math.round(Number(modality === 'locacao' ? item.monthlyPrice : item.salePrice) * 100)
    if (!id || !name || !tokens.every(t => haystack.includes(t)) || item.status !== 'disponivel' || !Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) continue
    const code = clean(item.productCode,60)
    const key = JSON.stringify([fold(name),code,cents])
    const option = groups.get(key) || { product:name, productCode:code, unitCents:cents, equipmentIds:[] }
    option.equipmentIds.push(id)
    groups.set(key,option)
  }
  return [...groups.values()].sort((a,b)=>a.product.localeCompare(b.product))
}
export function quoteFor(state, catalog, qty, freightRates, freightOverride = null) {
  const options = catalogOptions(state,catalog)
  if (options.length !== 1) return { error: options.length ? 'Há mais de um modelo/preço possível para este equipamento.' : 'Não há um equipamento disponível com preço cadastrado para esta necessidade.' }
  const months = monthsFor(state), item = options[0], modality = state.fields.modality.value
  if (!months) return { error:'O período precisa de cálculo ou condição especial pela equipe.' }
  if (qty > item.equipmentIds.length) return { error:'A quantidade solicitada precisa de conferência de estoque pela equipe.' }
  const subtotalCents = item.unitCents * qty * months
  const freight = freightOverride || findFreightRate(freightRates,{city:state.fields.city?.value,district:state.fields.district?.value,productCode:item.productCode,modality})
  if (!freight) return { error:'Frete da região/produto ainda precisa de consulta com um consultor.' }
  return { quote:{ ...item, modality:state.fields.modality.value, quantity:qty, months, subtotalCents, freight, totalCents:subtotalCents+freight.deliveryCents+freight.pickupCents, freightBillingVersion:3, stockReserved:false }, fingerprint:JSON.stringify([item.product,item.productCode,item.unitCents,item.equipmentIds.sort(),state.fields.modality.value,qty,months,freight,3]) }
}
export const quantity = (text, bare = false) => {
  const t = fold(text)
  const word = t.match(/^(?:(?:quero|preciso de|seria|serao|apenas|somente) )?(um|uma|dois|duas|tres|quatro|cinco)(?: unidades?| camas?| cadeiras?| equipamentos?)?[.! ]*$/)
  if (word) return ({um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5})[word[1]]
  const match = t.match(/\b(?:quero|preciso de|quantidade|serao|seria|apenas|somente|mude para)\s+(\d{1,3})\b|\b(\d{1,3})\s*(?:unidades?|camas?|cadeiras?|equipamentos?)\b/) || (bare ? t.match(/^(\d{1,3})[.! ]*$/) : null)
  return match ? Number(match[1] || match[2]) : null
}
export async function runAssistedYria({ previous = {}, catalog = [], freightRates = [], ...args }) {
  const config = normalizeConfig(args.config)
  const active = previous.sales && typeof previous.sales === 'object'
  let result
  if (!active) {
    result = await runYriaTurn({ ...args, previous, config })
    if (!config.assistedSalesEnabled || result.reason !== 'qualified') {
      if (!result.handoff && /pre[cç]o|valor|quanto|frete/i.test(args.message?.content || '')) {
        const prices = ['compra','locacao'].map(modality => {
          const options = catalogOptions({ ...result.state, fields:{...result.state.fields,modality:{value:modality}} },catalog)
          if (options.length !== 1) return ''
          const item = options[0]
          return (modality === 'compra' ? 'Venda' : 'Locação') + ' de ' + item.product + ': ' + money(item.unitCents) + (modality === 'locacao' ? ' por unidade/mês' : ' por unidade') + '.'
        }).filter(Boolean)
        const freight = findFreightRate(freightRates,{ city:result.state.fields.city?.value,district:result.state.fields.district?.value,modality:result.state.fields.modality?.value,productCode:catalogOptions(result.state,catalog)[0]?.productCode })
        const freightText = freight ? 'Frete cadastrado por pedido: entrega ' + money(freight.deliveryCents) + (result.state.fields.modality?.value === 'locacao' ? ', retirada ' + money(freight.pickupCents) : '') + '.' : 'Vou consultar um consultor para confirmar o frete desta região.'
        result.reply = [prices.length ? prices.join(' ') + ' Sujeito à confirmação de estoque e condições pela equipe.' : 'Vou consultar um consultor para confirmar modelo, preço e disponibilidade.',freightText,result.reply].join(' ')
      }
      return result
    }
  } else {
    const state = structuredClone(previous)
    result = { state, reply:'', handoff:false, reason:'', summary:qualificationSummary(state), provider:{ok:null,skipped:true,code:'assisted_order',latencyMs:0} }
    if (finalStatuses.has(state.status)) return { ...result, handoff:true, reason:state.status }
    state.turn = (Number(state.turn)||0) + 1
  }
  const state = result.state, text = clean(args.message?.content,2000)
  const end = (status, reply, issue = '') => {
    state.status = status
    state.lastAskedField = ''
    state.sales = { ...(state.sales || {}), issue, ...(status !== 'order_prepared' ? { draft:null } : {}) }
    state.updatedAt = new Date().toISOString()
    return { ...result, state, reply, reason:status, handoff:true, summary:qualificationSummary(state) + '\nPedido assistido: ' + (issue || status) }
  }
  if (!config.assistedSalesEnabled) return end('qualified','O pedido assistido foi desativado. Um vendedor continuará seu atendimento.')
  if (human(text)) return end('human_requested','Claro. Um atendente do Grupo YR continuará seu atendimento por aqui.')
  if (/\b(cancelar|cancele|desisti|nao quero mais)\b/.test(fold(text))) return end('sales_cancelled','Tudo bem. Não gerei contrato nem cobrança. Vou sinalizar sua decisão à equipe.')
  // Commercial or clinical exceptions are never interpreted as an approval.
  if (/\b(desconto|negociar|parcelar|gratis|urgencia medica|prescricao|diagnostico)\b/.test(fold(text)) || (active && /\b(trocar|mudei|na verdade|nao quero|nao moro|moro em|entrega em|quero comprar|quero alugar)\b/.test(fold(text)))) return end('needs_review','Essa alteração precisa de conferência. Vou passar o atendimento para um vendedor antes de confirmar qualquer pedido.','Condição ou dados precisam de revisão humana.')
  const base = quoteFor(state,catalog,1,freightRates)
  if (base.error) return end('needs_review','Organizei sua necessidade. Um vendedor precisa confirmar modelo, período, valor e disponibilidade antes do pedido.',base.error)
  if (!active) {
    state.sales = { stage:'quantity', draft:null }
    state.status = 'awaiting_quantity'
    state.lastAskedField = ''
    return { ...result, reason:'', handoff:false, reply:'Já organizei sua necessidade. Posso preparar um pedido para revisão, sem cobrança ou assinatura automática. Quantas unidades você deseja?' }
  }
  const proposedQty = quantity(text,state.sales.stage === 'quantity')
  if (state.sales.stage === 'quantity' && /\b(nao sei|nao tenho certeza|consultor)\b/.test(fold(text))) return end('needs_review','Sem problema. Vou passar para um consultor ajudar a definir a quantidade.','Quantidade não confirmada pelo cliente.')
  if (proposedQty !== null && (!Number.isInteger(proposedQty) || proposedQty < 1 || proposedQty > 10)) return end('needs_review','Essa quantidade precisa de conferência da equipe. Um vendedor continuará por aqui.','Quantidade fora do limite de 1 a 10 unidades.')
  if (state.sales.stage === 'quantity' && proposedQty === null) return { ...result, reply:'Quantas unidades você deseja? Informe um número. Se preferir, posso chamar um vendedor.' }
  const qty = proposedQty ?? state.sales.quote?.quantity
  const current = quoteFor(state,catalog,qty,freightRates)
  if (current.error) return end('needs_review','Vou pedir que um vendedor confira os dados do pedido antes de continuar.',current.error)
  const updatedQuote = state.sales.stage !== 'confirmation' || current.fingerprint !== state.sales.fingerprint
  if (updatedQuote) {
    state.sales = { stage:'confirmation', quote:current.quote, fingerprint:current.fingerprint, draft:null }
    state.status = 'awaiting_order_confirmation'
    const q = current.quote
    return { ...result, handoff:false, reason:'', reply:(active && proposedQty === null ? 'O catálogo foi atualizado; confira os valores novamente. ' : '') +
      'Pedido para revisão: ' + q.quantity + ' unidade(s) de ' + q.product + (q.productCode ? ' (' + q.productCode + ')' : '') +
      '. Valor cadastrado: ' + money(q.unitCents) + (q.modality === 'locacao' ? ' por unidade/mês, por ' + q.months + ' mês(es)' : ' por unidade') +
      '. Subtotal dos equipamentos: ' + money(q.subtotalCents) + '. Frete cadastrado por pedido: entrega ' + money(q.freight.deliveryCents) + (q.modality === 'locacao' ? ', retirada ' + money(q.freight.pickupCents) : '') + '. Total previsto: ' + money(q.totalCents) + '. Estoque, data de entrega, acesso e condições finais dependem da equipe. Sem reserva, contrato ou cobrança. Para encaminhar, responda: confirmo o pedido.' }
  }
  if (!/^(?:sim[,!.\s]*)?(?:eu )?confirmo (?:o )?pedido[.! ]*$/iu.test(text)) return { ...result, reply:'Para encaminhar esse pedido para revisão da equipe, escreva “confirmo o pedido”. Isso não confirma pagamento, assinatura, reserva ou entrega. Se quiser alterar algo, me diga.' }
  const q = current.quote
  state.sales.draft = { product:q.product, productCode:q.productCode, modality:q.modality, quantity:q.quantity, unitPrice:q.unitCents/100, rentalMonths:q.modality === 'locacao' ? q.months : null, subtotal:q.subtotalCents/100, deliveryFreight:q.freight.deliveryCents/100, pickupFreight:q.freight.pickupCents/100, total:q.totalCents/100, confirmedAt:new Date().toISOString(), paymentStatus:'not_verified', signatureStatus:'not_signed', pendingChecks:['estoque','acesso e frete final','endereço completo','condições finais','assinatura','pagamento'] }
  state.sales.stage = 'prepared'
  return end('order_prepared','Pedido registrado para revisão do responsável. Ele continuará por aqui para conferir frete, estoque, endereço e condições, enviar o contrato para sua assinatura e orientar o pagamento. Nenhum pagamento ou assinatura foi confirmado.')
}
