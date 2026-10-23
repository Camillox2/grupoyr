import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import PDFDocument from 'pdfkit'

// Test the exact PDF formatter without importing contracts.js/db.js or Neon.
const source = fs.readFileSync(new URL('../src/documents.js', import.meta.url), 'utf8')
const formatter = source.slice(source.indexOf('function createPdf('), source.indexOf('export async function createContractPdf('))
const createPdf = new Function('PDFDocument', formatter + ';return createPdf')(PDFDocument)

test('PDF footer stays on the body page instead of creating extra footer-only pages', async () => {
  const buffer = await createPdf({ title: 'Contrato QA', text: 'Frete de entrega (ida): R$ 100,00\nFrete de retirada (volta): R$ 80,00' })
  assert.equal((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
})

test('signed copy contains a signature image and keeps the footer on the same page', async () => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS7cAAAAASUVORK5CYII=', 'base64')
  const buffer = await createPdf({ title: 'Contrato QA assinado', text: 'Contrato de teste isolado.', signature: { image, name: 'Cliente fictício', date: '10/10/2026', hash: 'fixture-hash' } })
  assert.equal((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
  assert.ok(buffer.toString('latin1').includes('/Subtype /Image'))
})
