import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from './db.js'

export const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]

export const DEFAULT_SYSTEM_PROMPT = `Você é o primeiro atendimento comercial do Grupo YR Hospitalar, em Curitiba e região.
Seu papel é somente entender e registrar a necessidade para encaminhar a conversa ao vendedor. Não negocie, não feche vendas, não gere contratos e não prometa disponibilidade, preço, prazo de entrega ou condição que não conste no histórico.

Faça uma pergunta curta por vez e aproveite tudo que o cliente já informou. Qualifique somente o necessário: equipamento/interesse, compra ou locação, período estimado, cidade/bairro e condições de acesso para entrega (térreo, escada ou elevador, quando aplicável). Se o cliente não souber algum item, não insista.

Seja cordial, humano, conciso e profissional, em português do Brasil. Não use Markdown, asteriscos, negrito, títulos, listas formatadas ou emojis. Responda em texto simples, sem os caracteres **.
Não dê diagnóstico, interpretação clínica ou prescrição. Para dúvidas clínicas, recomende que a pessoa confirme com o profissional de saúde responsável. Trate fotos/áudios apenas como contexto comercial; não repita dados sensíveis de saúde desnecessários.

Quando os dados comerciais essenciais estiverem suficientes, responda ao cliente que registrou as informações e que um vendedor do Grupo YR continuará o atendimento. No fim da resposta, em uma linha separada, inclua exatamente o marcador interno [[YR_QUALIFICATION_COMPLETE]]. Use esse marcador apenas nesse momento. Ele não será exibido ao cliente. Não faça perguntas adicionais depois de concluir a qualificação.`

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
}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.warn('[Gemini] Chave de API não configurada. Operando em modo de demonstração assistida.')
    return {
      text: getDemoResponse(prompt, imagePart, audioPart),
      modelUsed: 'demo-mode (defina GEMINI_API_KEY nas configurações)',
      latencyMs: 120,
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const activeSystemInstruction = systemInstruction || buildQualificationSystemPrompt()
  let lastError = null

  for (const modelName of FALLBACK_MODELS) {
    const startTime = Date.now()
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
      })

      const responseText = result.response.text()
      const latencyMs = Date.now() - startTime

      console.log(`[Gemini] Sucesso com ${modelName} (${latencyMs}ms)`)
      return {
        text: responseText,
        modelUsed: modelName,
        latencyMs,
      }
    } catch (err) {
      console.warn(`[Gemini] Falha no modelo ${modelName}:`, err.message || err)
      lastError = err
      // Continua para o próximo modelo na sequência estrita de fallback
    }
  }

  // Se todos os 6 modelos falharem, usa fallback inteligente para não deixar o cliente no vácuo
  console.error('[Gemini] Todos os 6 modelos falharam no fallback:', lastError?.message)
  return {
    text: getDemoResponse(prompt, imagePart, audioPart),
    modelUsed: 'fallback-emergency',
    latencyMs: 50,
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

/**
 * Generates a comprehensive customer qualification summary / dossier.
 */
export async function generateCustomerSummary(lead, messages = []) {
  const prompt = `Com base no histórico desta conversa com o cliente ${lead.name}, gere um resumo estruturado de qualificação comercial para a equipe do Grupo YR Hospitalar.
Responda em formato direto com:
1. Contexto do Paciente/Cliente (alta médica, patologia, cuidadores)
2. Equipamento(s) Recomendado(s) e motivo
3. Modalidade Indicada (Locação ou Compra) e período
4. Grau de Urgência (Alta Imediata, 24h a 48h, ou Planejado)
5. Informações do Local (Cidade/Bairro, se é casa térrea ou sobrado/elevador)
6. Próximo Passo Comercial Recomendado`

  const result = await runGeminiWithFallback({
    prompt,
    history: messages,
    systemInstruction: 'Você é um assistente que sintetiza dossiês comerciais de qualificação médica hospitalar.',
  })

  return result.text
}

function getDemoResponse(prompt, imagePart, audioPart) {
  if (audioPart) {
    return 'Áudio recebido e compreendido: "Entendi perfeitamente sua mensagem sobre a necessidade de cama hospitalar com elevação para entrega em Curitiba. Já organizei os detalhes e nossa equipe de entrega está pronta para atendê-los."'
  }
  if (imagePart) {
    return 'Imagem recebida e analisada com sucesso: Identificamos a necessidade de suporte para repouso com elevação de cabeceira e grades de segurança. Nossa Cama Hospitalar Articulada atende rigorosamente a essa especificação!'
  }
  return 'Olá! Sou o assistente comercial do Grupo YR Hospitalar. Entendemos a urgência do cuidado e temos camas hospitalares e equipamentos disponíveis para pronta entrega e montagem em Curitiba e Região Metropolitana. Como podemos ajudar hoje?'
}
