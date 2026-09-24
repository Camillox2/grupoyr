import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import {
  buildRetentionSnapshot,
  buildRuleBasedRetentionInsights,
  generateGeminiRetentionInsights,
  parseRetentionModelResponse,
  registerRetentionInsightRoute,
} from '../src/retentionInsights.js'

const contract = (overrides = {}) => ({
  id: 'contract-1', number: 'CTR-001', type: 'locacao', status: 'assinado',
  startDate: '2026-08-01', endDate: '2026-10-05',
  ...overrides,
})

test('retention snapshot counts only signed rentals with trustworthy dates', () => {
  const snapshot = buildRetentionSnapshot([
    contract(),
    contract({ id: 'contract-2', number: 'CTR-002', endDate: '2026-11-22' }),
    contract({ id: 'contract-3', number: 'CTR-003', status: 'pendente_assinatura' }),
    contract({ id: 'contract-4', number: 'CTR-004', type: 'venda' }),
    contract({ id: 'contract-5', number: 'CTR-005', endDate: '' }),
  ], [
    { contractNumber: 'CTR-001', status: 'atrasada' },
    { contractNumber: 'CTR-003', status: 'atrasada' },
  ], '2026-09-23')

  assert.equal(snapshot.signedRentalCount, 2)
  assert.equal(snapshot.signedRentalUndated, 1)
  assert.equal(snapshot.endingWithin30Days, 1)
  assert.equal(snapshot.endingWithin60Days, 2)
  assert.equal(snapshot.overdueInvoicesOnUnexpiredContracts, 1)
  assert.equal(JSON.stringify(snapshot).includes('clientName'), false)
})

test('rule insights disclose missing dates and avoid fabricated renewal performance', () => {
  const [insight] = buildRuleBasedRetentionInsights(buildRetentionSnapshot([
    contract({ endDate: '' }),
  ], [], '2026-09-23'))
  assert.match(insight.observation, /não há locações assinadas com datas/i)
  assert.match(insight.recommendedAction, /preço total/i)
  assert.match(insight.principle, /sem escassez artificial/i)
})

test('Gemini response parser accepts strict JSON and rejects demo mode', async () => {
  const insight = { title: 'Revisão próxima', observation: '1 locação encerra em breve.', recommendedAction: 'Confirme a previsão e mostre opções transparentes.' }
  assert.equal(parseRetentionModelResponse(`\`\`\`json\n${JSON.stringify({ insights: [insight] })}\n\`\`\``).length, 1)
  assert.deepEqual(await generateGeminiRetentionInsights({ asOf: '2026-09-23' }, async () => ({ modelUsed: 'demo-mode', text: JSON.stringify({ insights: [insight] }) })), null)
  const generated = await generateGeminiRetentionInsights({ asOf: '2026-09-23' }, async () => ({ modelUsed: 'gemini-3.8-flash', text: JSON.stringify({ insights: [insight] }) }))
  assert.equal(generated.model, 'gemini-3.8-flash')
  assert.equal(generated.insights[0].title, insight.title)
})

test('retention endpoint requires auth, returns insights and caches successful generation', async () => {
  const app = express()
  app.use(express.json())
  const records = {
    contracts: [contract()],
    invoices: [],
  }
  const db = { get: (collection) => records[collection] || [] }
  const requireAuth = () => (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ error: 'unauthorized' })
    next()
  }
  let generatedCount = 0
  registerRetentionInsightRoute(app, {
    db,
    requireAuth,
    now: () => new Date('2026-09-23T14:00:00.000Z'),
    generateInsights: async () => {
      generatedCount += 1
      return { model: 'gemini-test', insights: [{ title: 'Check-in', recommendedAction: 'Confirme a previsão.' }] }
    },
  })

  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`
  try {
    assert.equal((await fetch(`${base}/api/ai/contract-retention-insights`)).status, 401)
    const first = await fetch(`${base}/api/ai/contract-retention-insights`, { headers: { Authorization: 'Bearer test-token' } })
    const firstBody = await first.json()
    assert.equal(first.status, 200)
    assert.equal(firstBody.source, 'gemini')
    assert.equal(firstBody.asOf, '2026-09-23')
    const cached = await fetch(`${base}/api/ai/contract-retention-insights`, { headers: { Authorization: 'Bearer test-token' } })
    assert.equal((await cached.json()).cached, true)
    assert.equal(generatedCount, 1)
    await fetch(`${base}/api/ai/contract-retention-insights`, {
      method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRefresh: true }),
    })
    assert.equal(generatedCount, 2)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
