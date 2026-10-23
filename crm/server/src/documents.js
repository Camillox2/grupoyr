import PDFDocument from 'pdfkit'
import { renderContractHtml } from './contracts.js'
import { leadFreight, pickupFreightDate } from './contractFreight.js'

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0)

const displayDate = (value) => {
  if (!value) return 'Não informado'
  const source = String(value)
  const date = new Date(source.length === 10 ? `${source}T00:00:00` : source)
  return Number.isNaN(date.getTime()) ? source : date.toLocaleDateString('pt-BR')
}

const decodeEntities = (value) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))

const contractHtmlToText = (html) => decodeEntities(String(html || '')
  .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<img\b[^>]*alt="Assinatura eletrônica do contratante"[^>]*>/gi, '\n[Assinatura eletrônica registrada]\n')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:h1|h2|p|div|section|article|li|tr|td|th|header|footer)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => line.replace(/[\t ]+/g, ' ').trim())
  .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim())

function createPdf({ title, text, fontSize = 9.5, signature = null }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 52, right: 52 },
      bufferPages: true,
      info: { Title: title, Author: 'Grupo YR Hospitalar', Subject: 'Documento do CRM Grupo YR' },
    })
    const chunks = []
    document.on('data', (chunk) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))

    document.font('Helvetica').fontSize(fontSize).fillColor('#18283c')
    document.text(text, { align: 'justify', lineGap: 3, paragraphGap: 4 })

    if (signature?.image) {
      if (document.y > document.page.height - 210) document.addPage()
      document.moveDown().font('Helvetica-Bold').fontSize(10).text('Registro da assinatura eletrônica')
      const signatureTop = document.y + 8
      document.image(signature.image, 52, signatureTop, { fit: [220, 75] })
      document.y = signatureTop + 85
      document.font('Helvetica').fontSize(8).text(`Signatário: ${signature.name}\nData: ${signature.date}\nIdentificador do registro: ${signature.hash || 'Disponível no CRM'}`, { width: 491, lineGap: 2 })
    }

    const pages = document.bufferedPageRange()
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      document.switchToPage(index)
      // The footer is deliberately below the body margin. PDFKit otherwise
      // adds a new page just to print it, doubling the document page count.
      const bottomMargin = document.page.margins.bottom
      document.page.margins.bottom = 0
      document.save()
      document.moveTo(52, 800).lineTo(543, 800).lineWidth(0.5).strokeColor('#d5deea').stroke()
      document.font('Helvetica').fontSize(8).fillColor('#65758b')
        .text(`Grupo YR Hospitalar · ${title} · Página ${index + 1} de ${pages.count}`, 52, 807, {
          width: 491,
          align: 'right',
          lineBreak: false,
        })
      document.restore()
      document.page.margins.bottom = bottomMargin
    }
    document.end()
  })
}

export async function createContractPdf(contract) {
  const html = renderContractHtml(contract)
  return createPdf({
    title: `Contrato ${contract.number}`,
    text: contractHtmlToText(html),
    fontSize: 9.25,
    signature: contract.signedAt && contract.signatureDataUrl ? {
      image: Buffer.from(contract.signatureDataUrl.split(',')[1], 'base64'),
      name: contract.signerName || contract.clientName,
      date: displayDate(contract.signedAt),
      hash: contract.documentHash,
    } : null,
  })
}

const fullAddress = (lead) => {
  const address = lead.addressData || {}
  const line = [address.street, address.number, address.complement].filter(Boolean).join(', ')
  const city = [address.district, address.city, address.state].filter(Boolean).join(' - ')
  return [line, city, address.cep].filter(Boolean).join(' · ') || lead.address || 'Não informado'
}

export async function createDeliveryChecklistPdf(lead) {
  const address = fullAddress(lead)
  const items = Array.isArray(lead.quoteItems) ? lead.quoteItems : []
  const hasRental = items.length > 0 ? items.some(item => item.modality === 'locacao') : lead.modality === 'locacao'
  const checks = [
    ['CPF/CNPJ do cliente', String(lead.cpf || '').replace(/\D/g, '').length >= 11],
    ['Endereço de entrega completo', Boolean(lead.addressData?.street && lead.addressData?.number && lead.addressData?.city)],
    ['Acesso até o local definido', Boolean(lead.access && lead.access !== 'nao_sei')],
    ['Produto e valores definidos', items.length > 0 && items.every((item) => Number(item.unitPrice) > 0)],
    ['Data de entrega combinada', Boolean(lead.deliveryDate)],
    ...(hasRental ? [['Período de locação definido', Number(lead.rentalMonths) >= 1]] : []),
    ['Proposta aceita pelo cliente', lead.checklist?.proposta_aceita === true],
    ['Documento conferido', lead.checklist?.documento_conferido === true],
    ['Forma de pagamento combinada', lead.checklist?.pagamento_combinado === true],
    ['Medidas de porta/escada confirmadas', lead.checklist?.acesso_confirmado === true],
  ]

  const rentalMonthly = items.filter((item) => item.modality === 'locacao')
    .reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0)
  const oneTimeItems = items.filter((item) => item.modality === 'compra')
    .reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0)
  const freightAmounts = leadFreight(lead)
  const freight = (freightAmounts.deliveryCents + (hasRental ? freightAmounts.pickupCents : 0)) / 100
  let pickupDueDate = ''
  if (hasRental && freightAmounts.pickupCents > 0) {
    try { pickupDueDate = pickupFreightDate({ type: 'locacao', startDate: lead.deliveryDate, rentalMonths: Number(lead.rentalMonths), pickupFreightDueDate: lead.pickupFreightDueDate }) } catch { /* An incomplete checklist must still be downloadable. */ }
  }
  const lines = [
    'GRUPO YR HOSPITALAR',
    'FICHA DE ENTREGA E CHECKLIST OPERACIONAL',
    '',
    `Cliente: ${lead.name || 'Não informado'}`,
    `Telefone: ${lead.phone || 'Não informado'}    CPF/CNPJ: ${lead.cpf || 'Não informado'}`,
    `E-mail: ${lead.email || 'Não informado'}`,
    `Endereço: ${address}`,
    `Acesso: ${lead.access || 'Não informado'}${lead.floor ? ` · ${lead.floor}` : ''}`,
    `Modalidade: ${lead.modality === 'locacao' ? 'Locação' : 'Compra'}    Prazo: ${lead.rentalMonths ? `${lead.rentalMonths} mês(es)` : lead.estimatedPeriod || 'Não informado'}`,
    `Data prevista: ${displayDate(lead.deliveryDate)}    Frete registrado: ${formatCurrency(freight)}`,
    `Frete de entrega (ida): ${formatCurrency(freightAmounts.deliveryCents / 100)} - na primeira cobrança`,
    ...(hasRental ? [`Frete de retirada (volta): ${formatCurrency(freightAmounts.pickupCents / 100)} - cobrança única separada, não mensal${freightAmounts.pickupCents > 0 ? ` - vencimento: ${pickupDueDate ? displayDate(pickupDueDate) : 'A combinar'}` : ''}`] : []),
    '',
    'ITENS DO PEDIDO',
    ...(items.length
      ? items.map((item) => `${item.qty || 1} × ${item.product || 'Produto'}${item.productCode ? ` (${item.productCode})` : ''} · ${item.modality === 'locacao' ? 'locação mensal' : 'compra'} · ${formatCurrency((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}`)
      : [`Interesse registrado: ${lead.equipmentInterest || 'A definir'}`]),
    `Locação mensal: ${formatCurrency(rentalMonthly)}    Compra (uma vez): ${formatCurrency(oneTimeItems)}    Frete: ${formatCurrency(freight)}`,
    `Primeira cobrança: ${formatCurrency(rentalMonthly + oneTimeItems + freightAmounts.deliveryCents / 100)} (sem frete de volta)`,
    ...(hasRental && Number(lead.rentalMonths) > 1 ? [`Próximas mensalidades: ${formatCurrency(rentalMonthly)} cada (sem frete de volta)`] : []),
    ...(lead.deliveryNotes ? ['', `Observações de entrega: ${lead.deliveryNotes}`] : []),
    ...(lead.closingNotes ? ['', 'OBSERVAÇÕES DO FECHAMENTO', lead.closingNotes] : []),
    '',
    'CONFERÊNCIA DE FECHAMENTO',
    ...checks.map(([label, done]) => `[${done ? 'X' : ' '}] ${label}`),
    '',
    'CONFERÊNCIA NO LOCAL DA ENTREGA',
    '[ ] Equipamento e acessórios conferidos com o pedido',
    '[ ] Embalagem e conservação registradas',
    '[ ] Acesso e local de instalação conferidos',
    '[ ] Montagem concluída e equipamento testado',
    '[ ] Orientação de uso entregue ao responsável',
    '[ ] Fotos/comprovantes anexados à ficha do cliente no CRM',
    '',
    'Responsável pela entrega: ______________________________________________',
    'Recebido por: _________________________________  Documento: ______________',
    'Data e hora: ____/____/________  ______:______',
    'Assinatura do responsável pelo recebimento: ______________________________',
    '',
    'Documento operacional. Preencha os itens da conferência no momento da entrega e registre fotos/comprovantes na ficha do cliente.',
  ]

  return createPdf({
    title: `Checklist de entrega - ${lead.name || lead.id}`,
    text: lines.join('\n'),
    fontSize: 10,
  })
}
