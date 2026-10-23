import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCalendarEvent, normalizeContractExpense } from '../src/operations.js'

test('normaliza um compromisso com associações opcionais', () => {
  const event = normalizeCalendarEvent({
    title: '  Entrega   equipamento ',
    type: 'entrega',
    date: '2026-09-24',
    startTime: '09:00',
    endTime: '10:30',
    leadId: 'lead_1',
    notes: '  Confirmar acesso   antes de sair. ',
  })

  assert.equal(event.title, 'Entrega equipamento')
  assert.equal(event.date, '2026-09-24')
  assert.equal(event.leadId, 'lead_1')
  assert.equal(event.contractId, null)
  assert.equal(event.notes, 'Confirmar acesso antes de sair.')
  assert.equal(event.status, 'scheduled')
})

test('rejeita data impossível e horário final anterior', () => {
  assert.throws(() => normalizeCalendarEvent({ title: 'Visita', date: '2026-02-30' }), /data válida/i)
  assert.throws(() => normalizeCalendarEvent({
    title: 'Visita', date: '2026-09-24', startTime: '11:00', endTime: '10:00',
  }), /posterior/i)
})

test('normaliza custo direto por contrato em centavos', () => {
  const cost = normalizeContractExpense({
    contractId: 'ctr_1',
    category: 'entrega',
    description: 'Frete de entrega',
    amount: '125.567',
    date: '2026-09-24',
  })

  assert.equal(cost.amount, 125.57)
  assert.equal(cost.contractId, 'ctr_1')
})

test('rejeita custo inválido e categoria desconhecida', () => {
  assert.throws(() => normalizeContractExpense({
    contractId: 'ctr_1', category: 'outra', description: 'Custo', amount: 10, date: '2026-09-24',
  }), /categoria/i)
  assert.throws(() => normalizeContractExpense({
    contractId: 'ctr_1', category: 'outro', description: 'Custo', amount: 0, date: '2026-09-24',
  }), /maior que zero/i)
})
