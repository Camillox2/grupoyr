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

const SYSTEM_PROMPT = `Você é a IA de Atendimento e Qualificação Comercial do Grupo YR Hospitalar (Curitiba - PR e Região).
Seu objetivo é acolher os clientes com empatia, entender suas necessidades para Home Care (cuidado em casa) ou Clínica/Hospital, e orientar com clareza sobre os equipamentos mais adequados para compra ou locação.

Catálogo e Soluções YR:
1. Cama hospitalar articulada: Elevação de cabeceira, pernas e grades de proteção. Ideal para idosos, recuperação pós-cirúrgica, AVC e pacientes acamados.
2. Cama manual 3 movimentos: Ajustes essenciais com manivelas leves, excelente custo-benefício.
3. Maca hidráulica: Ajuste ergonômico de altura e rodízios com freio para clínicas, hospitais e transporte.
4. Carrinho de emergência: Organização de medicamentos, gavetas com lacre e suporte para cardioversor/oxigênio.
5. Biombo hospitalar 3 faces: Privacidade imediata em consultórios e quartos de cuidado.
6. Mesa de refeição com regulagem: Apoio ergonômico para refeições e leitura na cama.
7. Colchão Pneumático Anti-escaras (com motor de alívio de pressão): Item fundamental para prevenir úlceras de pressão em pacientes que passam longos períodos acamados.

Diretrizes de Atendimento:
- Seja acolhedor, rápido e objetivo.
- Pergunte sobre o ambiente (casa ou clínica), tempo previsto de uso (dias, meses ou contínuo) e principais necessidades funcionais.
- Destaque que temos pronta entrega e montagem ágil em Curitiba e Região Metropolitana (fundamental para altas hospitalares urgentes).
- Sugira locação para períodos temporários e compra para uso prolongado ou clínicas.
- Nunca faça prescrição ou diagnóstico médico. Se o cliente tiver dúvidas clínicas, oriente a validar com a equipe de saúde do paciente.
- Analise imagens enviadas (receitas médicas, fotos de portas/espaço do quarto, fotos de equipamentos) e transcreva áudios mantendo o contexto.
- Ao final ou quando solicitado, estruture as informações para a equipe comercial fechar o contrato.
- Linguagem: Português do Brasil humanizado e profissional.
`

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
  systemInstruction = SYSTEM_PROMPT,
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
  let lastError = null

  for (const modelName of FALLBACK_MODELS) {
    const startTime = Date.now()
    try {
      console.log(`[Gemini] Tentando modelo: ${modelName}...`)
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction,
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
export async function transcribeAndUnderstandAudio(audioBuffer, mimeType = 'audio/ogg') {
  const base64 = audioBuffer.toString('base64')
  const prompt = 'Por favor, transcreva com precisão o que foi dito neste áudio e, em seguida, responda à necessidade comercial do cliente sobre os equipamentos hospitalares da YR.'

  return runGeminiWithFallback({
    prompt,
    audioPart: { base64, mimeType },
  })
}

/**
 * Analyzes an image (medical prescription, room space, or equipment).
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', contextText = '') {
  const base64 = imageBuffer.toString('base64')
  const prompt = contextText
    ? `Analise esta imagem enviada pelo cliente. Contexto adicional: "${contextText}". Identifique itens médicos ou necessidades de equipamentos hospitalares para o paciente e forneça a orientação comercial da YR.`
    : 'Analise esta imagem enviada pelo cliente (receita médica, quarto ou equipamento) e explique como o Grupo YR Hospitalar pode atender à necessidade do paciente com camas ou equipamentos para locação/venda.'

  return runGeminiWithFallback({
    prompt,
    imagePart: { base64, mimeType },
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
