const DAY_MS = 86400000
const CACHE_MS = 30 * 60 * 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const isIsoDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS)

export function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function buildRetentionSnapshot(contracts = [], invoices = [], today = saoPauloDateKey()) {
  const signedRentals = contracts.filter((contract) => (
    contract.status === 'assinado'
    && contract.type === 'locacao'
    && isIsoDate(contract.startDate)
    && isIsoDate(contract.endDate)
    && contract.endDate >= contract.startDate
  ))
  const datedNumbers = new Set(signedRentals.map((contract) => String(contract.number || '')))
  const signedRentalUndated = contracts.filter((contract) => (
    contract.status === 'assinado'
    && contract.type === 'locacao'
    && (!isIsoDate(contract.startDate) || !isIsoDate(contract.endDate) || contract.endDate < contract.startDate)
  )).length
  const durations = signedRentals.map((contract) => daysBetween(contract.startDate, contract.endDate) + 1)
  const daysToEnd = signedRentals.map((contract) => daysBetween(today, contract.endDate))
  const endingWithin = (days) => daysToEnd.filter((remaining) => remaining >= 0 && remaining <= days).length
  const currentlyRunning = signedRentals.filter((contract) => contract.startDate <= today && contract.endDate >= today).length
  const endedButSigned = daysToEnd.filter((remaining) => remaining < 0).length
  const openInvoices = invoices.filter((invoice) => (
    datedNumbers.has(String(invoice.contractNumber || ''))
    && invoice.status === 'pendente'
    && daysToEnd[signedRentals.findIndex((contract) => String(contract.number || '') === String(invoice.contractNumber || ''))] >= 0
  ))
  const overdueInvoices = invoices.filter((invoice) => (
    datedNumbers.has(String(invoice.contractNumber || ''))
    && invoice.status === 'atrasada'
    && daysToEnd[signedRentals.findIndex((contract) => String(contract.number || '') === String(invoice.contractNumber || ''))] >= 0
  ))

  return {
    asOf: today,
    signedRentalCount: signedRentals.length,
    signedRentalUndated,
    currentlyRunning,
    endingWithin7Days: endingWithin(7),
    endingWithin30Days: endingWithin(30),
    endingWithin60Days: endingWithin(60),
    endedButStillMarkedSigned: endedButSigned,
    averageTermDays: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null,
    openInvoicesOnUnexpiredContracts: openInvoices.length,
    overdueInvoicesOnUnexpiredContracts: overdueInvoices.length,
  }
}

export function buildRuleBasedRetentionInsights(snapshot) {
  const insights = []
  if (snapshot.endedButStillMarkedSigned > 0) {
    insights.push({
      title: 'Revise contratos que passaram da data final',
      observation: `${snapshot.endedButStillMarkedSigned} locação(ões) assinada(s) já passaram da data final e continuam com status “assinado”.`,
      recommendedAction: 'Confirme com a equipe e com o cliente se houve renovação ou devolução; atualize o registro antes de iniciar uma nova oferta.',
      timing: 'Agora, com revisão humana.',
      principle: 'Precisão e confiança: só abordar renovação quando a situação real estiver confirmada.',
    })
  }
  if (snapshot.endingWithin30Days > 0) {
    insights.push({
      title: 'Abra a conversa de renovação com antecedência',
      observation: `${snapshot.endingWithin30Days} locação(ões) assinada(s) têm término registrado nos próximos 30 dias.`,
      recommendedAction: 'Faça um check-in breve para entender a previsão do cliente. Se fizer sentido, compare opções de prazo e valor total com todas as condições explícitas.',
      timing: 'Planeje contatos em 30, 14 e 7 dias antes do término, sem insistência após uma recusa.',
      principle: 'Antecipação e autonomia: reduza a surpresa logística e deixe a decisão com o cliente.',
    })
  } else if (snapshot.currentlyRunning > 0) {
    insights.push({
      title: 'Crie um ponto de revisão antes do encerramento',
      observation: `${snapshot.currentlyRunning} locação(ões) assinada(s) estão dentro do período registrado; nenhuma tem término nos próximos 30 dias.`,
      recommendedAction: 'Agende um check-in consultivo mais perto do fim para confirmar a previsão e oferecer opções claras de continuidade ou devolução.',
      timing: 'Inicie a conversa cerca de 30 dias antes do término registrado.',
      principle: 'Compromisso sem pressão: facilite o planejamento sem presumir que a locação será prorrogada.',
    })
  }
  if (snapshot.overdueInvoicesOnUnexpiredContracts > 0) {
    insights.push({
      title: 'Resolva dúvidas financeiras antes de propor prazo maior',
      observation: `${snapshot.overdueInvoicesOnUnexpiredContracts} fatura(s) atrasada(s) estão ligadas a locações ainda dentro do prazo registrado.`,
      recommendedAction: 'Priorize uma conversa respeitosa para conferir o registro e explicar opções de regularização. Não condicione suporte ou use urgência emocional para obter renovação.',
      timing: 'Antes de qualquer proposta de extensão.',
      principle: 'Reciprocidade responsável: primeiro remova atritos reais; depois apresente escolhas transparentes.',
    })
  }
  if (insights.length === 0) {
    const observation = snapshot.signedRentalCount === 0
      ? 'Ainda não há locações assinadas com datas de início e fim confiáveis para analisar renovação.'
      : 'Não há encerramentos próximos nem pendências de renovação identificáveis nos dados atuais.'
    insights.push({
      title: 'Use uma revisão consultiva de período',
      observation,
      recommendedAction: 'Na entrega e em um ponto intermediário, confirme se a previsão de uso mudou. Explique as opções mensal e por prazo maior com preço total, flexibilidade e regras de devolução visíveis.',
      timing: 'Na entrega e antes do último mês, conforme as datas reais do contrato.',
      principle: 'Clareza e autonomia: comparação transparente ajuda a escolher sem escassez artificial, medo ou padrão difícil de recusar.',
    })
  }
  return insights.slice(0, 3)
}

const normalizeInsights = (items) => {
  if (!Array.isArray(items)) return []
  return items.slice(0, 3).map((item) => ({
    title: String(item?.title || '').trim().slice(0, 90),
    observation: String(item?.observation || '').trim().slice(0, 240),
    recommendedAction: String(item?.recommendedAction || '').trim().slice(0, 360),
    timing: String(item?.timing || '').trim().slice(0, 180),
    principle: String(item?.principle || '').trim().slice(0, 220),
  })).filter((item) => item.title && item.recommendedAction)
}

export const RETENTION_SYSTEM_INSTRUCTION = `Você é uma pessoa estrategista de retenção e marketing do Grupo YR Hospitalar. Leia apenas os indicadores agregados e anônimos fornecidos. Gere de 1 a 3 insights curtos e acionáveis em português do Brasil, sem inventar dados, causas, percentuais ou previsões. Responda SOMENTE com JSON válido no formato {"insights":[{"title":"...","observation":"...","recommendedAction":"...","timing":"...","principle":"..."}]}. Sugira check-ins úteis, opções de prazo e preço total transparentes, flexibilidade e remoção de atritos reais. Use psicologia comportamental com responsabilidade: autonomia, clareza, previsibilidade e reciprocidade. Não use medo, culpa, urgência falsa, escassez artificial, ocultação de custo, padrões difíceis de recusar, pressão baseada em saúde ou promessas clínicas. Se faltarem datas ou volume suficiente, diga isso e recomende corrigir/acompanhar os dados, sem extrapolar.`

export function parseRetentionModelResponse(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    return normalizeInsights(JSON.parse(source.slice(start, end + 1)).insights)
  } catch {
    return []
  }
}

export async function generateGeminiRetentionInsights(snapshot, runGemini) {
  const result = await runGemini({
    prompt: `Dados anônimos da operação, na data ${snapshot.asOf}:\n${JSON.stringify(snapshot)}`,
    systemInstruction: RETENTION_SYSTEM_INSTRUCTION,
  })
  if (!/^gemini-/i.test(String(result?.modelUsed || ''))) return null
  const insights = parseRetentionModelResponse(result.text)
  return insights.length ? { insights, model: result.modelUsed } : null
}

export function registerRetentionInsightRoute(app, { db, requireAuth, generateInsights = async () => null, now = () => new Date() }) {
  let cached = null
  const handler = async (req, res) => {
    const snapshot = buildRetentionSnapshot(db.get('contracts'), db.get('invoices'), saoPauloDateKey(now()))
    const cacheKey = JSON.stringify(snapshot)
    const forceRefresh = req.body?.forceRefresh === true
    if (!forceRefresh && cached?.key === cacheKey && now().getTime() - cached.createdAt < CACHE_MS) {
      return res.json({ ...cached.result, cached: true })
    }

    let result
    try {
      const generated = await generateInsights(snapshot)
      const insights = normalizeInsights(generated?.insights)
      result = insights.length
        ? { asOf: snapshot.asOf, source: 'gemini', model: generated.model || 'Google Gemini', insights }
        : { asOf: snapshot.asOf, source: 'rules', model: null, insights: buildRuleBasedRetentionInsights(snapshot) }
    } catch {
      result = { asOf: snapshot.asOf, source: 'rules', model: null, insights: buildRuleBasedRetentionInsights(snapshot) }
    }
    cached = { key: cacheKey, createdAt: now().getTime(), result }
    return res.json({ ...result, cached: false })
  }
  app.get('/api/ai/contract-retention-insights', requireAuth(), handler)
  app.post('/api/ai/contract-retention-insights', requireAuth(), handler)
}
