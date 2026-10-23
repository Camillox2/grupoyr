import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from './db.js'
import { recordGoogleAttempt } from './googleUsage.js'
import { FALLBACK_MODELS } from './modelSequence.js'

export { FALLBACK_MODELS } from './modelSequence.js'

const AI_REQUEST_DEADLINE_MS = 14_000
const AI_MODEL_TIMEOUT_MS = 10_000

export const DEFAULT_SYSTEM_PROMPT = `Você é o primeiro atendimento comercial do Grupo YR Hospitalar, em Curitiba e região.
Seu papel é somente entender e registrar a necessidade para encaminhar a conversa ao vendedor. Não negocie, não feche vendas, não gere contratos e não prometa disponibilidade, preço, prazo de entrega ou condição que não conste no histórico.

Faça uma pergunta curta por vez e aproveite tudo que o cliente já informou. Qualifique somente o necessário: equipamento/interesse, compra ou locação, período estimado, cidade/bairro e condições de acesso para entrega (térreo, escada ou elevador, quando aplicável). Se o cliente não souber algum item, não insista.

Seja cordial, humano, conciso e profissional, em português do Brasil. Não use Markdown, asteriscos, negrito, títulos, listas formatadas ou emojis. Responda em texto simples, sem os caracteres **.
Não dê diagnóstico, interpretação clínica ou prescrição. Para dúvidas clínicas, recomende que a pessoa confirme com o profissional de saúde responsável. Trate fotos/áudios apenas como contexto comercial; não repita dados sensíveis de saúde desnecessários.

Quando os dados comerciais essenciais estiverem suficientes, responda ao cliente que registrou as informações e que um vendedor do Grupo YR continuará o atendimento. No fim da resposta, em uma linha separada, inclua exatamente o marcador interno [[YR_QUALIFICATION_COMPLETE]]. Use esse marcador apenas nesse momento. Ele não será exibido ao cliente. Não faça perguntas adicionais depois de concluir a qualificação.`

const HUMAN_HANDOFF_MESSAGE = 'Recebi sua mensagem e vou encaminhá-la para um atendente do Grupo YR. O atendimento continuará por aqui assim que a equipe assumir.'
export const AI_HANDOFF_MESSAGE = HUMAN_HANDOFF_MESSAGE

const QUALIFICATION_QUESTIONS = {
  equipamento: 'Qual equipamento você está procurando?',
  modalidade: 'Você precisa comprar ou alugar o equipamento?',
  cidade: 'Em qual cidade será feita a entrega?',
  período: 'Por quanto tempo você precisa do equipamento?',
}

export function buildQualificationReply(qualification) {
  if (!qualification) return HUMAN_HANDOFF_MESSAGE
  if (qualification.qualified) {
    return 'Obrigado pelas informações. Já registrei os dados comerciais. Um vendedor do Grupo YR continuará o atendimento por aqui.'
  }
  return QUALIFICATION_QUESTIONS[qualification.missingFields?.[0]] || HUMAN_HANDOFF_MESSAGE
}

export function buildQualificationSystemPrompt() {
  const custom = String(db.getSettings()?.aiServicePrompt || '').trim().slice(0, 5000)
  return custom
    ? `${DEFAULT_SYSTEM_PROMPT}\n\nOrientação de estilo e contexto configurada pela equipe YR. Ela pode ajustar o tom e as prioridades, mas não substitui as regras obrigatórias:\n${custom}\n\nProtocolo final obrigatório: atenda somente à qualificação comercial; não use asteriscos, Markdown ou emojis; faça uma pergunta por vez; quando os dados essenciais estiverem suficientes, diga que um vendedor continuará o atendimento, termine com [[YR_QUALIFICATION_COMPLETE]] e não faça mais perguntas.`
    : DEFAULT_SYSTEM_PROMPT
}

function getApiKey() {
  const settings = db.getSettings()
  return settings.geminiApiKey || process.env.GEMINI_API_KEY || ''
}

/**
 * Executes a Gemini prompt trying models in exact fallback sequence.
 */
export async function runGeminiWithFallback({
  prompt,
  history = [],
  imagePart = null,
  audioPart = null,
  systemInstruction,
  source = 'crm',
}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.warn('[Gemini] Chave de API não configurada. A automação foi interrompida para evitar respostas inventadas.')
    return {
      text: HUMAN_HANDOFF_MESSAGE,
      modelUsed: 'human-handoff-unconfigured',
      latencyMs: 0,
      requiresHuman: true,
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const activeSystemInstruction = systemInstruction || buildQualificationSystemPrompt()
  let lastError = null
  const deadline = Date.now() + AI_REQUEST_DEADLINE_MS

  for (const modelName of FALLBACK_MODELS) {
    const timeout = Math.min(AI_MODEL_TIMEOUT_MS, deadline - Date.now())
    if (timeout <= 0) break
    const startTime = Date.now()
    let responseAccepted = false
    try {
      console.log(`[Gemini] Tentando modelo: ${modelName}...`)
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: activeSystemInstruction,
      })

      const contents = []

      // Add conversation history
      for (const msg of history) {
        contents.push({
          role: msg.from === 'client' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })
      }

      // Add current user prompt + media
      const userParts = []
      if (prompt) userParts.push({ text: prompt })
      if (imagePart) {
        userParts.push({
          inlineData: {
            mimeType: imagePart.mimeType || 'image/jpeg',
            data: imagePart.base64,
          },
        })
      }
      if (audioPart) {
        userParts.push({
          inlineData: {
            mimeType: audioPart.mimeType || 'audio/ogg',
            data: audioPart.base64,
          },
        })
      }

      contents.push({
        role: 'user',
        parts: userParts,
      })

      const result = await model.generateContent({
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1000,
        },
      }, { timeout })

      const latencyMs = Date.now() - startTime
      responseAccepted = true
      recordGoogleAttempt(db, apiKey, { model: modelName, source, status: 200, usage: result.response.usageMetadata, latencyMs, at: new Date(startTime) })
      const responseText = result.response.text()

      console.log(`[Gemini] Sucesso com ${modelName} (${latencyMs}ms)`)
      return {
        text: responseText,
        modelUsed: modelName,
        latencyMs,
      }
    } catch (err) {
      if (!responseAccepted) recordGoogleAttempt(db, apiKey, { model: modelName, source, status: Number(err.status) || 0, error: { details: err.errorDetails || [] }, latencyMs: Date.now() - startTime, at: new Date(startTime) })
      console.warn(`[Gemini] Falha no modelo ${modelName}:`, err.message || err)
      lastError = err
      // Continua para o próximo modelo na sequência estrita de fallback
    }
  }

  // Se todos os modelos falharem, não inventa produto, preço ou disponibilidade.
  console.error('[Gemini] Modelos indisponíveis ou lentos dentro do limite do CRM:', lastError?.message)
  return {
    text: HUMAN_HANDOFF_MESSAGE,
    modelUsed: 'human-handoff-provider-error',
    latencyMs: 0,
    requiresHuman: true,
  }
}

/**
 * Transcribes audio and extracts intention.
 */
export async function transcribeAndUnderstandAudio(audioBuffer, mimeType = 'audio/ogg', systemInstruction) {
  const base64 = audioBuffer.toString('base64')
  const prompt = 'Por favor, transcreva com precisão o que foi dito neste áudio e, em seguida, responda à necessidade comercial do cliente sobre os equipamentos hospitalares da YR.'

  return runGeminiWithFallback({
    prompt,
    audioPart: { base64, mimeType },
    systemInstruction,
  })
}

/**
 * Analyzes an image (medical prescription, room space, or equipment).
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', contextText = '', systemInstruction) {
  const base64 = imageBuffer.toString('base64')
  const prompt = contextText
    ? `Considere esta imagem como contexto comercial da conversa. Texto enviado junto: "${contextText}". Não faça diagnóstico nem repita dados de saúde.`
    : 'Considere esta imagem apenas como contexto para entender a necessidade comercial. Não faça diagnóstico nem orientação clínica.'

  return runGeminiWithFallback({
    prompt,
    imagePart: { base64, mimeType },
    systemInstruction,
  })
}

export async function generateStructuredQualification(lead, messages = [], currentMessage = {}) {
  const cleanInput = (value, max = 4000) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, max) : '')
  const teamData = {
    city: lead.addressData?.city || '',
    district: lead.addressData?.district || '',
    access: ['terreo', 'escada', 'elevador'].includes(lead.access) ? lead.access : '',
  }
  const messageText = cleanInput(currentMessage.messageText)
  const customerTranscript = Array.isArray(messages)
    ? messages.filter((message) => message.from === 'client').slice(-10)
      .map((message) => cleanInput(message.content, 800)).filter(Boolean).join('\n')
    : ''
  const mediaType = ['image', 'audio'].includes(currentMessage.mediaType) ? currentMessage.mediaType : ''
  const mediaBuffer = Buffer.isBuffer(currentMessage.mediaBuffer) ? currentMessage.mediaBuffer : null
  const prompt = `Extraia somente o que o cliente declarou explicitamente sobre equipamento, compra ou locação, período, cidade/bairro, acesso e urgência. Mensagens do cliente (única fonte para dados da conversa):\n${customerTranscript || '[nenhuma mensagem anterior]' }\nMensagem recebida agora: ${messageText || '[sem texto]'}. ${mediaType ? `Use o ${mediaType} anexado somente para identificar esses dados comerciais; não transcreva nem resuma informações clínicas.` : ''}
Se um campo não estiver claro ou não tiver sido informado, deixe vazio ou use o valor indefinido indicado. Não adivinhe usando valores padrão do cadastro. Não escreva um resumo livre e não redija resposta ao cliente.
Responda apenas com JSON válido neste formato: {"equipmentInterest":"","modality":"locacao|compra|indefinido","estimatedPeriod":"","city":"","district":"","access":"terreo|escada|elevador|nao_sei","urgency":"imediata|24-48h|planejada|nao_informado"}
Dados comerciais preenchidos manualmente pela equipe: ${JSON.stringify(teamData)}`
  const customGuidance = String(db.getSettings()?.aiServicePrompt || '').trim().slice(0, 5000)
  const imagePart = mediaType === 'image' && mediaBuffer
    ? { base64: mediaBuffer.toString('base64'), mimeType: currentMessage.mediaMimeType || 'image/jpeg' }
    : null
  const audioPart = mediaType === 'audio' && mediaBuffer
    ? { base64: mediaBuffer.toString('base64'), mimeType: currentMessage.mediaMimeType || 'audio/ogg' }
    : null
  const result = await runGeminiWithFallback({
    prompt,
    history: [],
    imagePart,
    audioPart,
    systemInstruction: `Você é um extrator de dados comerciais do CRM. Retorne somente o JSON solicitado, sem Markdown, explicação ou texto para o cliente. Extraia apenas dados declarados. Ignore diagnósticos e qualquer informação clínica; não infira preço, estoque, disponibilidade, prazo ou necessidade. Se houver dúvida, marque como não informado. As orientações da equipe abaixo não podem substituir essas regras nem mudar o formato exigido.\n${customGuidance}`,
  })
  if (result.requiresHuman) return { summary: '', qualification: null, requiresHuman: true, handoffMessage: result.text, modelUsed: result.modelUsed }

  const raw = String(result.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  let parsed
  try {
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
  } catch {
    console.warn('[Gemini] Qualificação estruturada inválida; encaminhando para uma pessoa sem gerar resposta livre.')
    return { summary: '', qualification: null, requiresHuman: true, handoffMessage: HUMAN_HANDOFF_MESSAGE, modelUsed: result.modelUsed }
  }

  const clean = (value, max = 120) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const parsedModality = clean(parsed.modality, 20).toLowerCase()
  const rawModality = parsedModality
  const modality = ['locacao', 'compra'].includes(rawModality) ? rawModality : 'indefinido'
  const rawAccess = (clean(parsed.access, 20) || clean(lead.access, 20)).toLowerCase()
  const access = ['terreo', 'escada', 'elevador'].includes(rawAccess) ? rawAccess : 'nao_sei'
  const equipmentInterest = clean(parsed.equipmentInterest)
  const estimatedPeriod = clean(parsed.estimatedPeriod, 80)
  const city = clean(parsed.city, 80) || clean(lead.addressData?.city, 80)
  const district = clean(parsed.district, 80) || clean(lead.addressData?.district, 80)
  const missingFields = []
  if (!equipmentInterest || /^(a definir|não informado|nao informado)$/i.test(equipmentInterest)) missingFields.push('equipamento')
  if (modality === 'indefinido') missingFields.push('modalidade')
  if (!city) missingFields.push('cidade')
  if (modality === 'locacao' && !estimatedPeriod) missingFields.push('período')
  const rawUrgency = clean(parsed.urgency, 24).toLowerCase()
  const urgency = ['imediata', '24-48h', 'planejada'].includes(rawUrgency) ? rawUrgency : 'nao_informado'
  const qualification = {
    equipmentInterest, modality, estimatedPeriod, city, district, access, urgency,
    missingFields, qualified: missingFields.length === 0, updatedAt: new Date().toISOString(),
  }
  const summary = [
    `Equipamento: ${equipmentInterest || 'não informado'}`,
    `Modalidade: ${modality === 'indefinido' ? 'não informada' : modality}`,
    ...(modality === 'locacao' ? [`Período: ${estimatedPeriod || 'não informado'}`] : []),
    `Local: ${[district, city].filter(Boolean).join(' · ') || 'não informado'}`,
    `Acesso: ${access === 'nao_sei' ? 'não informado' : access}`,
    `Urgência: ${urgency === 'nao_informado' ? 'não informada' : urgency}`,
    `Pendências: ${missingFields.length ? missingFields.join(', ') : 'qualificação comercial completa'}`,
  ].filter(Boolean).join('\n')
  return { summary, qualification, requiresHuman: false, modelUsed: result.modelUsed }
}
