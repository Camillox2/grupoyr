// Pure qualification policy. No database, WhatsApp, credentials or network here.
export const FIELD_LABELS = {
  name: 'Nome', equipmentInterest: 'Equipamento', modality: 'Compra ou locação',
  city: 'Cidade', district: 'Bairro', neededAt: 'Quando precisa',
  estimatedPeriod: 'Período da locação', access: 'Acesso para entrega',
}
export const CAPTURE_LABELS = { ...FIELD_LABELS, street: 'Rua ou avenida', number: 'Número', cep: 'CEP', state: 'UF',
  usageLocation: 'Local de uso', quantity: 'Quantidade desejada', conditionPreference: 'Condição aceita' }
export const PERSONAS = [
  { id: 'acolhedora', name: 'Acolhedora', description: 'Atenciosa e tranquila, sem exagerar na intimidade.' },
  { id: 'consultiva', name: 'Consultiva', description: 'Explica o motivo das perguntas e organiza a necessidade.' },
  { id: 'objetiva', name: 'Objetiva', description: 'Mensagens curtas e diretas para quem tem pressa.' },
]
const REQUIRED = ['name', 'equipmentInterest', 'modality', 'city', 'district', 'neededAt', 'estimatedPeriod']
const ESSENTIAL = ['equipmentInterest', 'modality', 'city']
const TERMINAL = new Set(['qualified', 'human_requested', 'needs_review', 'technical_handoff'])
export const clean = (v, max = 200) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const fold = (v) => clean(v, 12000).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const longText = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0,max) : ''
export function normalizeConfig(input = {}, legacyPrompt = '') {
  return {
    personaId: PERSONAS.some(p => p.id === input.personaId) ? input.personaId : 'acolhedora',
    customPrompt: longText(input.customPrompt ?? legacyPrompt, 5000),
    knowledge: longText(input.knowledge, 8000), examples: longText(input.examples, 3000),
    requiredFields: [...new Set([...(Array.isArray(input.requiredFields) ? input.requiredFields : REQUIRED), ...ESSENTIAL])].filter(k => k in FIELD_LABELS),
    model: /^[a-z0-9.-]{1,80}$/.test(input.model || '') ? input.model : 'auto',
    assistedSalesEnabled: input.assistedSalesEnabled === true,
    automaticContractsEnabled: input.automaticContractsEnabled === true && input.assistedSalesEnabled === true,
  }
}
export function chronological(messages = []) {
  return [...messages].sort((a, b) => String(a.timestamp || a.createdAt || '').localeCompare(String(b.timestamp || b.createdAt || '')))
}
export function getYriaConfiguration(settings = {}) {
  const legacy = normalizeConfig({}, settings.aiServicePrompt || '')
  const saved = settings.yria || {}
  return { revision: Number(saved.revision) || 0,
    published: saved.published || { id: 'legacy', config: legacy, createdAt: null, label: 'Configuração atual preservada' },
    draft: normalizeConfig(saved.draft || saved.published?.config || legacy), versions: (saved.versions || []).slice(0,10) }
}
export function initialState(previous = {}) {
  const fields = {}
  for (const key of Object.keys(CAPTURE_LABELS)) {
    const saved = previous.fields?.[key]
    if (saved && (saved.status === 'unknown' || (saved.status === 'confirmed' && validValue(key, clean(saved.value))))) fields[key] = { value: clean(saved.value), status: saved.status, source: clean(saved.source), messageId: clean(saved.messageId) }
    // Migrate only the structured qualification, never defaults of the lead.
    else if (clean(previous[key]) && validValue(key, clean(previous[key])) && !/^(indefinido|nao_sei|não informado|a definir)$/i.test(previous[key])) fields[key] = { value: clean(previous[key]), status: 'confirmed', source: 'qualificacao_anterior' }
  }
  return { fields, status: previous.status || 'qualifying', lastAskedField: previous.lastAskedField || '', introduced: previous.introduced === true, providerFailureCount: Number(previous.providerFailureCount) || 0, turn: Number(previous.turn) || 0 }
}
function validValue(key, value) {
  if (!value || /^(nao informado|não informado|null|undefined|a definir)$/i.test(value)) return false
  if (key === 'modality') return ['compra', 'locacao'].includes(value)
  if (key === 'quantity') return /^\d{1,2}$/.test(value) && Number(value) >= 1
  if (key === 'conditionPreference') return /^(usad[ao]|seminov[ao]|nov[ao])$/iu.test(value)
  if (['name','city','district'].includes(key) && /^(?:pode ser|aceito|prefiro|para (?:o )?m[eê]s)|\b(?:usad[ao]|seminov[ao]|m[eê]s que vem)\b/iu.test(value)) return false
  if (key === 'number') return /^(?:\d{1,8}[A-Za-z]?|s\/n)$/.test(value)
  if (key === 'cep') return /^\d{5}-?\d{3}$/.test(value)
  if (key === 'state') return /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(value)
  if (key === 'name') return value.length >= 2 && value.length <= 80 && !/\d|\?|equipamento|hospitalar|alugar|comprar|ignora|sistema/i.test(value) && !/\b(filho|filha|mae|pai|irmao|irma|esposo|esposa|neto|neta|cuidador|cuidadora|responsavel|acompanhante)\b/.test(fold(value))
  if (key === 'city' || key === 'district') return value.length >= 2 && value.length <= 80 && !/\b(sou|meu|minha|moro|quero|preciso|nome|cama|equipamento|entrega|amanha|hoje|filho|filha|obrigado|obrigada)\b/.test(fold(value))
  return value.length <= 200
}
// Conservative extraction: a denied statement is not a confirmed customer fact.
// Keep positive corrections after commas/contrast, rather than the first match.
const assertions = text => text.split(/[,;.!?\n]+|\s+(?:mas|por[eé]m|e sim)\s+|\s+e\s+(?=(?:quero|preciso|moro|sou|bairro|o bairro|meu nome)\b)/iu).map(v=>v.trim()).filter(Boolean)
const denied = text => /\b(?:nao|nem|nunca)\b/.test(fold(text))
const deniesValue = (text, value) => Boolean(value) && assertions(text).some(part=>denied(part) && fold(part).includes(fold(value)))
function localFacts(text, state) {
  const original = longText(text, 4000)
  const facts = {}, raw = assertions(original).filter(part=>!denied(part)).join('. '), t = fold(raw)
  const put = (key, value) => { if (validValue(key, value)) facts[key] = { value, evidence: raw, source: 'mensagem' } }
  const name = [...raw.matchAll(/(?:meu nome [ée]|me chamo|pode me chamar de|sou (?:o|a))\s+([\p{L}][\p{L} '-]{1,70})(?=[,.!\n]|$)/giu)].at(-1)
  if (name) put('name', clean(name[1]))
  const equipment = raw.match(/\b(cama(?:\s+hospitalar)?(?:\s+(?:el[ée]trica(?:\s+luxo)?|manual(?:\s+(?:3|tr[êe]s)\s+movimentos)?|articulada|de\s+tr[êe]s\s+movimentos))?|cadeira\s+de\s+(?:rodas|banho)|andador|guincho|colch[ãa]o(?:\s+pneum[áa]tico)?|concentrador(?:\s+de\s+oxig[êe]nio)?)\b/iu)
  if (equipment && !/n[aã]o (?:quero|preciso|[ée])/.test(raw)) put('equipmentInterest', equipment[1])
  const rent = /\b(alugar|aluguel|locacao|locar)\b/.test(t), buy = /\b(comprar|compra|adquirir)\b/.test(t)
  if (rent !== buy && !/nao (quero|preciso) (alugar|comprar)/.test(t)) put('modality', rent ? 'locacao' : 'compra')
  const period = raw.match(/\b(?:por|durante|aproximadamente)\s+(\d{1,3}\s*(?:dias?|semanas?|meses?|m[êe]s))\b/iu)
  if (period) put('estimatedPeriod', period[1])
  const when = raw.match(/\b(hoje|amanh[ãa]|esta semana|semana que vem|pr[óo]xima semana|\d{1,2}\/\d{1,2}(?:\/\d{4})?)(?=$|[^\p{L}\d])/iu)
  if (when) put('neededAt', when[1])
  const relativeMonth = raw.match(/\b(este m[eê]s|m[eê]s que vem|pr[óo]ximo m[eê]s)\b/iu)
  if (relativeMonth) put('neededAt', relativeMonth[1])
  const months = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro'
  const plannedMonth = raw.match(new RegExp('\\b(?:para(?: o)?|em|no m[eê]s de|a partir de)\\s+((?:' + months + ')(?:\\s+de\\s+\\d{4})?)\\b', 'iu'))
    || (state.lastAskedField === 'neededAt' ? assertions(original).filter(part=>!denied(part)).map(part=>part.match(new RegExp('^((?:' + months + ')(?:\\s+de\\s+\\d{4})?)$', 'iu'))).filter(Boolean).at(-1) : null)
  if (plannedMonth) put('neededAt', plannedMonth[1])
  const condition = raw.match(/\b(?:pode ser|aceit[oa]|prefiro|quero|serve|gostaria de)\s+(?:(?:uma?|cama|equipamento)\s+)?(usad[ao]|seminov[ao]|nov[ao])\b/iu)
  if (condition) put('conditionPreference', condition[1].toLowerCase())
  const city = [...raw.matchAll(/(?:cidade (?:de|[ée])|entrega em|moro em|sou de)\s+([\p{L}][\p{L} '-]{1,70}?)(?=\s+(?:bairro|n[ao]\s+(?:rua|avenida|av\b|travessa))\b|[,.!\n]|$)/giu)].at(-1)
  if (city) put('city', clean(city[1]))
  const district = raw.match(/bairro\s+(?:[ée]\s+|do\s+|de\s+)?([\p{L}][\p{L} '-]{1,70})(?=[,.!\n]|$)/iu)
  if (district) put('district', clean(district[1]))
  // A single answer can contain location AND street/number. Never discard it
  // just because the customer answered more than the question requested.
  const street = raw.match(/\b(rua|avenida|av\.?|travessa|alameda|estrada|rodovia|pra[çc]a)\s+([\p{L}][\p{L}\d '-]{1,100}?)\s*(?:,?\s*(?:n[uú]mero|n[º°o.]|n[.]|nro)\s*)?(\d{1,8}[A-Za-z]?)(?=\s*(?:[,.!]|$|apto|apartamento|bloco|cep))/iu)
  if (street) {
    put('street', clean(street[1] + ' ' + street[2]))
    put('number', street[3])
    const prefix = raw.slice(0, street.index).replace(/(?:\s+|^)(?:n[ao]|em|entrega|endere[çc]o|[ée])\s*$/iu, '').replace(/[,. ]+$/, '').replace(/^(?:entrega em|moro em|sou de|cidade (?:de|[ée]))\s+/iu, '').trim()
    const centre = prefix.match(/^([\p{L}][\p{L} '-]{1,70}?)\s+(?:bairro\s+)?(centro)$/iu)
    if (centre) { put('city', centre[1]); put('district', centre[2]) }
    else if (state.lastAskedField === 'city' && !facts.city && /^[\p{L}][\p{L} '-]{1,65}$/u.test(prefix)) put('city', prefix)
  }
  const cep = raw.match(/\b(?:CEP\s*[: -]?\s*)?(\d{5}-?\d{3})\b/iu)
  if (cep) put('cep', cep[1])
  const uf = raw.match(/(?:\bUF\s*[: -]?\s*|\/\s*)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/iu)
  if (uf) put('state', uf[1].toUpperCase())
  if (/\bterreo\b/.test(t)) put('access', 'Térreo')
  else if (/\bescada/.test(t)) put('access', 'Escada')
  else if (/\belevador\b/.test(t)) put('access', 'Elevador')
  const asked = state.lastAskedField
  const shortAnswer = raw.split(/[,.!?\n]/, 1)[0].trim().replace(/^(?:em|na cidade de)\s+/i, '')
  if (asked && /^(?:n[aã]o sei(?: ainda)?|ainda n[aã]o sei|n[aã]o tenho certeza|prefiro n[aã]o informar|n[aã]o decidi)[.! ]*$/iu.test(clean(text,4000))) facts[asked] = { value: '', unknown: true, source: 'mensagem' }
  else if (asked && !facts[asked] && ['name','city','district'].includes(asked) && /^[\p{L}][\p{L} '-]{1,65}$/u.test(shortAnswer) && !/\b(sou|meu|minha|moro|quero|preciso|cama|oi|ola|alugar|aluguel|comprar|compra|sim|nao|sei|ignora|humano|vendedor|atendente|quanto|custa|posso|pode|usada|usado|mes|obrigado|obrigada|bom dia|boa tarde|boa noite|tudo bem)\b/.test(fold(shortAnswer))) put(asked, shortAnswer)
  if (asked === 'estimatedPeriod' && /^\d{1,3}\s*(dias?|semanas?|meses?|m[êe]s)$/iu.test(raw)) put(asked, raw)
  const labels = { nome:'name', equipamento:'equipmentInterest', modalidade:'modality', 'cidade de entrega':'city', cidade:'city', bairro:'district', 'local de uso':'usageLocation', 'quantidade desejada':'quantity', quantidade:'quantity', 'quando precisa':'neededAt' }
  for (const line of assertions(original)) {
    const labelled = line.match(/^([^:]{1,50}):\s*(.+)$/u)
    if (!labelled) continue
    const key = labels[fold(labelled[1])]
    let value = clean(labelled[2]).replace(/[.! ]+$/u, '')
    if (!key || denied(value) || unsafe.test(value)) continue
    if (key === 'modality') value = /^(comprar|compra)$/i.test(value) ? 'compra' : /^(alugar|aluguel|locação|locacao)$/i.test(value) ? 'locacao' : ''
    put(key, value)
  }
  return facts
}
const INTRODUCTION = 'Olá! Sou a YRIA, do atendimento do Grupo YR Hospitalar.'
const HUMAN = /(?:quero|preciso|prefiro|posso|gostaria|falar|cham[ae])[^.!?]{0,45}(?:humano|atendente|vendedor|uma pessoa|algu[eé]m da equipe)|(?:passe|transfira|encaminhe)[^.!?]{0,40}(?:vendedor|atendente|humano)/i
const unsafe = /\[\[|R\$|\breais\b|\bCPF\b|\bCNPJ\b|pronta entrega|temos dispon|garant|diagn[oó]st|prescri|[oó]bito|patologia|\b(?:sem|com) custo\b|vou encaminhar|vou transferir|vendedor continuar/i
function safePhrase(value, question = false) {
  const t = clean(value, question ? 240 : 150).replace(/[*_`#~]/g, '').replace(/\p{Extended_Pictographic}/gu, '').trim()
  if (!t || unsafe.test(t) || (t.match(/\?/g) || []).length !== (question ? 1 : 0)) return ''
  return t
}
const QUESTIONS = {
  name: ['Como posso te chamar?', 'Para identificar seu atendimento, como posso te chamar?', 'Qual é o seu nome?'],
  equipmentInterest: ['Qual equipamento você está procurando?', 'Qual equipamento você precisa comprar ou alugar?', 'Qual equipamento você precisa?'],
  modality: ['Você procura o equipamento para comprar ou alugar?', 'Você prefere compra ou locação?', 'É compra ou locação?'],
  city: ['Em qual cidade será a entrega?', 'Para organizar a entrega, em qual cidade você está?', 'Qual é a cidade da entrega?'],
  district: ['Em qual bairro será a entrega?', 'Qual é o bairro do endereço de entrega?', 'Qual é o bairro da entrega?'],
  neededAt: ['Para quando você precisa do equipamento?', 'Qual é a data ou a urgência para receber o equipamento?', 'Quando você precisa receber?'],
  estimatedPeriod: ['Por quanto tempo você pretende alugar?', 'Você tem uma estimativa do período da locação?', 'Qual é o período estimado da locação?'],
  access: ['No local da entrega há escada, elevador ou é térreo?', 'Como é o acesso ao local: térreo, escada ou elevador?', 'O acesso é térreo, escada ou elevador?'],
}
const QUESTION_CONCEPT = { name: /nome|chamar/i, equipmentInterest: /equipamento|cama|cadeira/i, modality: /compr|alug|loca/i, city: /cidade|munic[ií]pio/i, district: /bairro/i, neededAt: /quando|data|urg[eê]ncia/i, estimatedPeriod: /tempo|per[ií]odo|dias|meses/i, access: /acesso|escada|elevador|t[eé]rreo/i }
export function qualificationSummary(state) {
  return Object.entries(CAPTURE_LABELS).filter(([k]) => k in FIELD_LABELS || state.fields[k]).map(([k, label]) => {
    const field = state.fields[k]
    const value = field?.status === 'confirmed' ? (k === 'modality' ? ({ compra: 'Compra', locacao: 'Locação' }[field.value] || field.value) : field.value) : field?.status === 'unknown' ? 'cliente não sabe/não informou' : 'pendente'
    return `${label}: ${value}`
  }).join('\n')
}
export function recoverQualification(previous = {}, messages = [], rawConfig = {}) {
  const state = initialState(previous), replay = initialState(), config = normalizeConfig(rawConfig)
  const history = chronological(messages).slice(-240), positions = new Map(history.map((message, index) => [message.id, index]))
  for (const message of history) {
    const text = longText(message.content, 4000)
    if (message.from === 'ai') {
      if (/\bYRIA\b/i.test(text) && /Grupo YR/i.test(text)) state.introduced = true
      const question = text.match(/[^?]*\?/g)?.at(-1) || ''
      const asked = ['access','estimatedPeriod','neededAt','district','city','name','modality','equipmentInterest'].find(key => QUESTION_CONCEPT[key].test(question))
      if (asked) replay.lastAskedField = asked
      continue
    }
    if (message.from !== 'client') continue
    const facts = localFacts(text, replay)
    for (const [key, field] of Object.entries(replay.fields)) if (!facts[key] && deniesValue(text, field.value)) delete replay.fields[key]
    for (const [key, fact] of Object.entries(facts)) replay.fields[key] = { value: fact.value, status: fact.unknown ? 'unknown' : 'confirmed', source: 'historico_cliente', messageId: clean(message.id) }
  }
  for (const [key, field] of Object.entries(replay.fields)) {
    const saved = state.fields[key]
    if (!saved || (saved.messageId && field.messageId && positions.has(saved.messageId) && positions.has(field.messageId) && positions.get(field.messageId) >= positions.get(saved.messageId))) state.fields[key] = field
  }
  if (!state.lastAskedField && state.status === 'qualifying') state.lastAskedField = replay.lastAskedField
  const required = config.requiredFields.filter(key => key !== 'estimatedPeriod' || state.fields.modality?.value === 'locacao')
  state.missingFields = required.filter(key => state.fields[key]?.status !== 'confirmed')
  state.qualified = state.missingFields.length === 0
  return { ...previous, ...state }
}
export async function runYriaTurn({ previous = {}, messages = [], message, config: rawConfig = {}, generate }) {
  const config = normalizeConfig(rawConfig), state = recoverQualification(previous, messages.filter(item => !message?.id || item.id !== message.id), config)
  if (TERMINAL.has(state.status)) return { state, reply: '', handoff: true, reason: state.status, summary: qualificationSummary(state), provider: { ok: null, skipped: true, code: 'terminal', latencyMs: 0 } }
  const text = longText(message?.content, 4000)
  const customerHistory = chronological(messages).filter(m => m.from === 'client').slice(-20).map(m => clean(m.content, 1000))
  const evidenceText = fold([...customerHistory, text].join('\n'))
  const facts = localFacts(text, state)
  const disputed = new Set()
  for (const [key,field] of Object.entries(state.fields)) {
    if (field.status === 'confirmed' && !facts[key] && deniesValue(text,field.value)) {
      delete state.fields[key]
      disputed.add(key)
    }
  }
  let modelResult = {}, provider = { ok: false, code: 'unconfigured', model: 'roteiro-seguro', latencyMs: 0 }
  const requestedHuman = assertions(text).some(part=>!denied(part) && HUMAN.test(part))
  if (requestedHuman) provider = { ok: null, skipped: true, code: 'human_requested', latencyMs: 0 }
  if (!requestedHuman && generate) {
    try {
      const result = await generate({ state, text, messages: customerHistory, config, media: message?.media })
      provider = result.provider || provider
      if (provider.ok && result.data && typeof result.data === 'object') modelResult = result.data
    } catch { provider = { ...provider, code: 'provider_error' } }
  }
  for (const key of Object.keys(CAPTURE_LABELS)) {
    if (facts[key]) continue // Explicit current corrections beat older model evidence.
    const candidate = modelResult.fields?.[key]
    const evidence = clean(candidate?.evidence, 500)
    let value = clean(candidate?.value)
    if (key === 'modality') value = fold(value).replace('locação', 'locacao')
    const groundedValue = key === 'modality' ? (value === 'locacao' ? /alug|loca/.test(fold(evidence)) : /compr|adquir/.test(fold(evidence))) : fold(evidence).includes(fold(value))
    const relevantEvidence = state.fields[key]?.status === 'confirmed' || disputed.has(key) ? fold(text).includes(fold(evidence)) : evidenceText.includes(fold(evidence))
    const hasEvidence = evidence.length >= 2 && (relevantEvidence || Boolean(message?.media)) && (candidate?.unknown || groundedValue)
    if (hasEvidence && candidate?.unknown === true && (key === state.lastAskedField || fold(text).includes(fold(CAPTURE_LABELS[key])))) facts[key] = { value: '', unknown: true, source: 'cliente' }
    else if (hasEvidence && validValue(key, value) && !unsafe.test(value) && !deniesValue(evidence,value) && !deniesValue(text,value)) facts[key] = { value, source: message?.media ? 'midia' : 'cliente' }
  }
  for (const [key, fact] of Object.entries(facts)) state.fields[key] = { value: fact.value, status: fact.unknown ? 'unknown' : 'confirmed', source: fact.source, messageId: clean(message?.id) }
  state.turn += 1
  state.providerFailureCount = provider.skipped ? state.providerFailureCount : provider.ok ? 0 : state.providerFailureCount + 1
  const required = config.requiredFields.filter(k => k !== 'estimatedPeriod' || state.fields.modality?.value === 'locacao')
  state.missingFields = required.filter(k => state.fields[k]?.status !== 'confirmed')
  const unanswered = required.filter(k => !state.fields[k])
  state.qualified = state.missingFields.length === 0
  let reason = '', reply = ''
  if (requestedHuman) reason = 'human_requested'
  else if (state.qualified) reason = 'qualified'
  else if (!unanswered.length) reason = 'needs_review'
  else if (state.providerFailureCount >= 3 && !Object.keys(facts).length) reason = 'technical_handoff'
  if (reason) {
    state.status = reason
    state.lastAskedField = ''
    reply = reason === 'qualified'
      ? (config.personaId === 'objetiva' ? 'Dados registrados. Um vendedor do Grupo YR continuará o atendimento por aqui.' : 'Obrigado pelas informações. Já organizei sua necessidade para um vendedor do Grupo YR continuar o atendimento por aqui.')
      : reason === 'human_requested' ? 'Claro. Vou passar a conversa para um atendente do Grupo YR continuar por aqui.'
        : reason === 'needs_review' ? 'Registrei o que você informou e deixei as dúvidas sinalizadas para um vendedor continuar o atendimento por aqui.'
          : 'Não consegui continuar a triagem agora. Vou sinalizar sua conversa para um atendente do Grupo YR continuar por aqui.'
  } else {
    state.status = 'qualifying'
    const next = unanswered[0]
    state.lastAskedField = next
    const index = config.personaId === 'consultiva' ? 1 : config.personaId === 'objetiva' ? 2 : 0
    const suggested = modelResult.nextQuestion
    const generatedQuestion = suggested?.field === next ? safePhrase(suggested.text, true) : ''
    const question = generatedQuestion && QUESTION_CONCEPT[next].test(generatedQuestion) ? generatedQuestion : QUESTIONS[next][index]
    const rawOpening = safePhrase(modelResult.acknowledgement)
    const opening = /entreg|estoque|dispon|pre[cç]o|valor|amanh[ãa]|\bhoje\b|doen[cç]a|paciente|cl[ií]nic|tratamento|rem[eé]dio|patologia/i.test(rawOpening) ? '' : rawOpening
    const greeting = !state.introduced ? INTRODUCTION : ''
    const priceNote = /pre[cç]o|valor|quanto custa|dispon[ií]vel|estoque/i.test(text) ? 'O vendedor confirma os valores e a disponibilidade.' : ''
    const showroomNote = !state.introduced && /(^|\n)Equipamento:/iu.test(text)
      ? ['Já registrei', state.fields.quantity?.value ? state.fields.quantity.value + (state.fields.quantity.value === '1' ? ' unidade de' : ' unidades de') : '', state.fields.equipmentInterest?.value || 'seu interesse', state.fields.modality?.value ? 'para ' + ({ compra:'compra', locacao:'locação' }[state.fields.modality.value]) : '', state.fields.city?.value ? ', com entrega em ' + state.fields.city.value : ''].filter(Boolean).join(' ').replace(' ,', ',') + '.'
      : ''
    const conditionNote = facts.conditionPreference
      ? (fold(facts.conditionPreference.value).startsWith('nov') ? 'Registrei sua preferência por equipamento novo. A equipe confirma as opções.' : 'Registrei que você aceita equipamento ' + (fold(facts.conditionPreference.value).startsWith('seminov') ? 'seminovo' : 'usado') + '. A equipe confirma o estado e a disponibilidade.')
      : ''
    const contextualOpening = conditionNote || showroomNote || (facts.name ? 'Prazer, ' + facts.name.value + '.' : '')
    reply = [greeting, contextualOpening || (/\bYRIA\b/i.test(opening) || (!state.introduced && /(?:assistente|atendente) virtual/i.test(opening)) ? '' : opening), priceNote, question].filter(Boolean).join(' ')
  }
  if (reply && !state.introduced && !/\bYRIA\b/i.test(reply)) reply = INTRODUCTION + ' ' + reply
  if (reply && /\bYRIA\b/i.test(reply)) state.introduced = true
  state.updatedAt = new Date().toISOString()
  return { state, reply, handoff: Boolean(reason), reason, summary: qualificationSummary(state), provider }
}
