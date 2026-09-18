import axios from 'axios'
import { db } from './db.js'

// Templates de mensagem da API oficial da Meta (WhatsApp Cloud API).
//
// Regra da Meta: fora da janela de 24h contada da ULTIMA mensagem do cliente,
// a empresa so pode falar usando um template aprovado. Este modulo lista os
// aprovados da conta, monta o envio e diz se a janela de um lead esta aberta.

const GRAPH = 'https://graph.facebook.com/v21.0'
const WINDOW_MS = 24 * 60 * 60 * 1000
const CACHE_MS = 5 * 60 * 1000
const MAX_PAGES = 5
const MAX_PARAM_LENGTH = 1024

let cache = { at: 0, wabaId: '', items: [] }

/** Erro com status HTTP e codigo estavel para a tela decidir o que mostrar. */
export class MetaError extends Error {
  constructor(message, status = 502, code = 'meta_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

// IDs da Meta entram na URL da Graph API. So digitos, senao um valor como
// "123/../outra-coisa" mudaria o endereco chamado com o nosso token.
const isGraphId = (value) => /^\d{5,25}$/.test(String(value || ''))

function credentials({ needWaba = false, needPhone = false } = {}) {
  const { accessToken, phoneNumberId, wabaId } = db.getSettings().metaConfig || {}
  if (!accessToken) {
    throw new MetaError('Configure o token de acesso da Meta em Ajustes.', 400, 'meta_not_configured')
  }
  if (needWaba && !isGraphId(wabaId)) {
    throw new MetaError('Informe o ID da conta do WhatsApp Business (WABA ID) em Ajustes para listar os templates.', 400, 'meta_not_configured')
  }
  if (needPhone && !isGraphId(phoneNumberId)) {
    throw new MetaError('Informe o Phone Number ID da Meta em Ajustes.', 400, 'meta_not_configured')
  }
  return { accessToken, phoneNumberId, wabaId }
}

// NUNCA logar o erro do axios inteiro: error.config.headers carrega o token.
function toMetaError(error, fallback) {
  const meta = error?.response?.data?.error
  if (!meta) {
    console.error('[WhatsApp/Meta]', fallback, '-', error?.code || error?.message || 'sem detalhe')
    return new MetaError(`${fallback} Sem resposta da Meta, tente de novo.`, 502, 'meta_unreachable')
  }
  console.error('[WhatsApp/Meta]', fallback, '-', JSON.stringify({
    code: meta.code, subcode: meta.error_subcode, type: meta.type, message: meta.message, trace: meta.fbtrace_id,
  }))
  if (meta.code === 190) {
    return new MetaError('O token da Meta expirou ou foi revogado. Gere um novo e salve em Ajustes.', 401, 'meta_token_invalid')
  }
  const friendly = {
    131047: 'A janela de 24h fechou. Envie um template aprovado para retomar.',
    131026: 'A Meta não conseguiu entregar: o número pode não ter WhatsApp ou não aceitar mensagens de empresas.',
    131049: 'A Meta segurou este envio para não cansar o cliente com marketing. Tente mais tarde.',
    132000: 'A quantidade de variáveis não bate com o template aprovado.',
    132001: 'Este template não existe nesse idioma ou ainda não foi aprovado.',
    132018: 'Uma variável tem quebra de linha, tabulação ou espaços demais. Deixe o texto em uma linha só.',
  }[meta.code]
  const detail = friendly || meta.error_data?.details || meta.error_user_msg || meta.message || fallback
  return new MetaError(String(detail).slice(0, 300), 502, `meta_${meta.code || 'error'}`)
}

/* ------------------------------------------------------------ variaveis */

// {{1}} (posicional) ou {{nome_cliente}} (nomeada), na ordem em que aparecem.
const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

function variablesOf(text) {
  const names = []
  for (const match of String(text || '').matchAll(VARIABLE)) {
    if (!names.includes(match[1])) names.push(match[1])
  }
  return names
}

const fill = (text, names, values) => String(text || '').replace(VARIABLE, (whole, name) => {
  const index = names.indexOf(name)
  return index >= 0 && values[index] ? values[index] : whole
})

// A Meta recusa parametro com quebra de linha, tab ou 4+ espacos seguidos.
function cleanParam(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_PARAM_LENGTH)
}

/* ------------------------------------------------------------- descricao */

const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT']
// Botoes que exigem parametro no envio e que esta tela nao preenche.
const BUTTONS_NEEDING_INPUT = ['COPY_CODE', 'OTP', 'FLOW', 'CATALOG', 'MPM']

function describeTemplate(raw) {
  const components = Array.isArray(raw.components) ? raw.components : []
  const byType = (type) => components.find((component) => component.type === type)
  const header = byType('HEADER')
  const body = byType('BODY')
  const footer = byType('FOOTER')
  const buttons = (byType('BUTTONS')?.buttons || []).map((button) => ({
    type: String(button.type || ''),
    text: String(button.text || ''),
    dynamic: /\{\{/.test(String(button.url || '')),
  }))

  const headerFormat = String(header?.format || 'NONE')
  let unsupportedReason = ''
  if (headerFormat === 'LOCATION') unsupportedReason = 'Cabeçalho de localização ainda não é enviado por aqui.'
  const blocking = buttons.find((button) => button.dynamic || BUTTONS_NEEDING_INPUT.includes(button.type))
  if (blocking) unsupportedReason = 'Tem botão com valor dinâmico (link variável, código ou catálogo), que ainda não é enviado por aqui.'

  return {
    id: `${raw.name}:${raw.language}`,
    name: String(raw.name || ''),
    language: String(raw.language || ''),
    category: String(raw.category || ''),
    named: raw.parameter_format === 'NAMED',
    header: {
      format: headerFormat,
      text: headerFormat === 'TEXT' ? String(header?.text || '') : '',
      variables: headerFormat === 'TEXT' ? variablesOf(header?.text) : [],
      needsMedia: MEDIA_HEADERS.includes(headerFormat),
    },
    body: { text: String(body?.text || ''), variables: variablesOf(body?.text) },
    footer: String(footer?.text || ''),
    buttons: buttons.map(({ type, text }) => ({ type, text })),
    supported: !unsupportedReason,
    unsupportedReason,
  }
}

/** Templates APROVADOS da conta, com cache de 5 min. */
export async function listTemplates({ refresh = false } = {}) {
  const { accessToken, wabaId } = credentials({ needWaba: true })
  const fresh = cache.wabaId === wabaId && Date.now() - cache.at < CACHE_MS
  if (fresh && !refresh) return cache.items

  const items = []
  let after
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // Pagina pelo cursor. O campo paging.next da Meta traz o token na URL,
      // entao ele nunca e seguido nem registrado.
      const { data } = await axios.get(`${GRAPH}/${wabaId}/message_templates`, {
        params: { fields: 'name,language,status,category,parameter_format,components', limit: 100, after },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      })
      for (const raw of data?.data || []) {
        if (raw.status === 'APPROVED') items.push(describeTemplate(raw))
      }
      after = data?.paging?.next ? data?.paging?.cursors?.after : undefined
      if (!after) break
    }
  } catch (error) {
    throw toMetaError(error, 'Não foi possível listar os templates.')
  }

  items.sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language))
  cache = { at: Date.now(), wabaId, items }
  return items
}

/* ------------------------------------------------------------------ envio */

function valuesFor(names, given, label) {
  const list = Array.isArray(given) ? given : []
  return names.map((name, index) => {
    const value = cleanParam(list[index])
    if (!value) throw new MetaError(`Preencha a variável {{${name}}} do ${label}.`, 400, 'template_variable_missing')
    return value
  })
}

const asParams = (template, names, values) => values.map((text, index) => (
  template.named ? { type: 'text', parameter_name: names[index], text } : { type: 'text', text }
))

function mediaHeaderParam(format, url) {
  let parsed
  try {
    parsed = new URL(String(url || ''))
  } catch {
    parsed = null
  }
  // A Meta baixa o arquivo pelo link: so https, e nada de credencial embutida.
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new MetaError('Este template pede um arquivo no cabeçalho. Informe um link https público.', 400, 'template_media_missing')
  }
  const kind = format.toLowerCase()
  const link = parsed.toString().slice(0, 2000)
  return { type: kind, [kind]: kind === 'document' ? { link, filename: 'documento' } : { link } }
}

/**
 * Envia um template aprovado. Devolve o id da mensagem na Meta (para casar com
 * os status do webhook) e o texto ja preenchido, que e o que fica no historico.
 */
export async function sendTemplate({ phone, templateId, bodyValues, headerValues, headerMediaUrl }) {
  const { accessToken, phoneNumberId } = credentials({ needWaba: true, needPhone: true })

  // O template vem da lista aprovada, nunca do corpo da requisicao: o cliente
  // so escolhe QUAL, o conteudo e o que a Meta aprovou.
  let template = (await listTemplates()).find((item) => item.id === templateId)
  if (!template) template = (await listTemplates({ refresh: true })).find((item) => item.id === templateId)
  if (!template) throw new MetaError('Template não encontrado entre os aprovados.', 404, 'template_not_found')
  if (!template.supported) throw new MetaError(template.unsupportedReason, 400, 'template_unsupported')

  const to = String(phone || '').replace(/\D/g, '')
  if (to.length < 10 || to.length > 15) throw new MetaError('Telefone inválido para envio.', 400, 'invalid_phone')

  const body = valuesFor(template.body.variables, bodyValues, 'texto')
  const header = valuesFor(template.header.variables, headerValues, 'cabeçalho')

  const components = []
  if (template.header.needsMedia) {
    components.push({ type: 'header', parameters: [mediaHeaderParam(template.header.format, headerMediaUrl)] })
  } else if (header.length > 0) {
    components.push({ type: 'header', parameters: asParams(template, template.header.variables, header) })
  }
  if (body.length > 0) {
    components.push({ type: 'body', parameters: asParams(template, template.body.variables, body) })
  }

  let data
  try {
    const response = await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: { name: template.name, language: { code: template.language }, components },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
    )
    data = response.data
  } catch (error) {
    throw toMetaError(error, 'A Meta recusou o envio do template.')
  }

  const rendered = [
    template.header.text ? fill(template.header.text, template.header.variables, header) : '',
    fill(template.body.text, template.body.variables, body),
    template.footer,
  ].filter(Boolean).join('\n\n')

  return { metaMessageId: data?.messages?.[0]?.id || null, rendered, template }
}

/* ----------------------------------------------------------------- janela */

/** Janela de atendimento de 24h, contada da ultima mensagem DO CLIENTE. */
export function windowState(lead, now = Date.now()) {
  const last = lead?.lastInboundAt ? Date.parse(lead.lastInboundAt) : NaN
  if (!Number.isFinite(last)) return { open: false, closesAt: null }
  return { open: now - last < WINDOW_MS, closesAt: new Date(last + WINDOW_MS).toISOString() }
}

/**
 * Leads antigos nao tem lastInboundAt. Preenche uma vez, a partir do
 * historico, para a janela nao nascer "fechada" em conversa que esta viva.
 */
export function backfillLastInbound() {
  const lastByLead = new Map()
  for (const message of db.get('messages') || []) {
    if (message.from !== 'client') continue
    const previous = lastByLead.get(message.leadId)
    if (!previous || message.timestamp > previous) lastByLead.set(message.leadId, message.timestamp)
  }
  let filled = 0
  for (const lead of db.get('leads') || []) {
    const last = lastByLead.get(lead.id)
    if (!lead.lastInboundAt && last) {
      db.update('leads', lead.id, { lastInboundAt: last })
      filled += 1
    }
  }
  if (filled > 0) console.log(`[WhatsApp] Janela de 24h: ${filled} conversas antigas receberam a data da última mensagem do cliente.`)
}
