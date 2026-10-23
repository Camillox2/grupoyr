import test from 'node:test'
import assert from 'node:assert/strict'
import { AI_HANDOFF_MESSAGE, buildQualificationReply } from '../src/gemini.js'

test('asks only the first required commercial question', () => {
  const reply = buildQualificationReply({ qualified: false, missingFields: ['cidade', 'período'] })
  assert.equal(reply, 'Em qual cidade será feita a entrega?')
  assert.doesNotMatch(reply, /\*\*|pronta entrega|preço|disponibilidade/i)
})

test('does not ask more questions after qualification is complete', () => {
  const reply = buildQualificationReply({ qualified: true, missingFields: [] })
  assert.equal(reply, 'Obrigado pelas informações. Já registrei os dados comerciais. Um vendedor do Grupo YR continuará o atendimento por aqui.')
  assert.doesNotMatch(reply, /\*\*|pronta entrega|preço|disponibilidade/i)
})

test('hands off safely when structured extraction is unavailable', () => {
  assert.equal(buildQualificationReply(null), AI_HANDOFF_MESSAGE)
})
