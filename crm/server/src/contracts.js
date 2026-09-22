import crypto from 'node:crypto'
import { db } from './db.js'

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0)

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const displayDate = (value) => {
  if (!value) return 'Não informado'
  const source = String(value)
  const date = new Date(source.length === 10 ? `${source}T00:00:00` : source)
  return Number.isNaN(date.getTime()) ? escapeHtml(source) : date.toLocaleDateString('pt-BR')
}

const textWithBreaks = (value = '') => escapeHtml(value).replace(/\r?\n/g, '<br>')

const createSigningToken = () => crypto.randomBytes(32).toString('base64url')

const contractualCycles = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const days = Math.max(1, Math.ceil((end - start) / 86400000))
  return Math.max(1, Math.ceil(days / 30))
}

export function createContract({
  leadId,
  type = 'locacao', // locacao | venda
  equipmentIds = [],
  startDate,
  endDate,
  monthlyValue,
  customClauses = '',
}) {
  const lead = db.find('leads', (l) => l.id === leadId)
  if (!lead) throw new Error('Lead não encontrado')

  const equipments = equipmentIds.map((id) => db.find('equipments', (e) => e.id === id)).filter(Boolean)
  const equipmentNames = equipments.map((e) => `${e.name} (Patr. ${e.serialNumber})`).join(', ') || lead.equipmentInterest

  const contractCount = db.get('contracts').reduce((highest, item) => {
    const sequence = Number(String(item.number || '').match(/-(\d+)$/)?.[1] || 0)
    return Math.max(highest, sequence)
  }, 0) + 1
  const normalizedMonthlyValue = Number(monthlyValue)
  if (!Number.isFinite(normalizedMonthlyValue) || normalizedMonthlyValue <= 0) {
    throw new Error('Informe um valor de contrato maior que zero')
  }
  const contractNumber = `CTR-2026-${String(contractCount).padStart(3, '0')}`

  const contract = {
    id: `ctr_${Date.now()}`,
    number: contractNumber,
    leadId: lead.id,
    clientName: lead.name,
    clientCpf: lead.cpf || 'Não informado na cotação',
    clientPhone: lead.phone,
    address: lead.address || 'Curitiba - PR',
    type,
    equipmentIds,
    equipmentNames,
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    monthlyValue: normalizedMonthlyValue,
    customClauses,
    status: 'pendente_assinatura',
    signedAt: null,
    signerIp: null,
    signatureDataUrl: null,
    documentHash: null,
    signingToken: createSigningToken(),
    createdAt: new Date().toISOString(),
  }

  db.insert('contracts', contract)

  // Atualiza lead com o estágio de contrato gerado
  db.update('leads', lead.id, {
    stage: 'contrato_gerado',
    notes: `Contrato ${contractNumber} gerado e aguardando assinatura.`,
  })

  // Cria fatura inicial no financeiro
  db.insert('invoices', {
    id: `inv_${Date.now()}`,
    contractNumber: contract.number,
    clientName: contract.clientName,
    leadId: contract.leadId,
    amount: contract.monthlyValue,
    dueDate: contract.startDate,
    status: 'pendente',
    paidAt: null,
  })

  return contract
}

export function ensureSigningToken(contract) {
  if (contract.signingToken) return contract
  return db.update('contracts', contract.id, { signingToken: createSigningToken() }) || contract
}

export function findContractBySigningToken(token) {
  if (!token) return null
  return db.find('contracts', (contract) => contract.signingToken === token)
}

export function signContract(contractId, signatureDataUrl, signerIp = '127.0.0.1', signerName = '') {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if (!contract) throw new Error('Contrato não encontrado')
  if (contract.status === 'assinado') throw new Error('Este contrato já foi assinado')
  // O link de assinatura e publico e nao expira: sem esta trava, um contrato
  // cancelado continuava podendo ser assinado por quem tivesse o link antigo.
  if (['cancelado', 'encerrado'].includes(contract.status)) {
    throw new Error('Este contrato não está mais disponível para assinatura.')
  }
  if (typeof signatureDataUrl !== 'string' || !/^data:image\/(png|jpeg);base64,/i.test(signatureDataUrl)) {
    throw new Error('Assinatura digital inválida')
  }
  if (signatureDataUrl.length > 1000000) throw new Error('A assinatura digital excede o limite permitido')

  const normalizedSignerName = String(signerName || contract.clientName || '').trim()
  if (normalizedSignerName.length < 2) throw new Error('Informe o nome completo do signatário')

  const signedAt = new Date().toISOString()
  const rawContent = JSON.stringify({
    contractId: contract.id,
    number: contract.number,
    clientName: contract.clientName,
    equipmentNames: contract.equipmentNames,
    startDate: contract.startDate,
    endDate: contract.endDate,
    monthlyValue: contract.monthlyValue,
    signerName: normalizedSignerName,
    signatureDataUrl,
    signedAt,
    signerIp,
  })
  const documentHash = crypto.createHash('sha256').update(rawContent).digest('hex')

  const updated = db.update('contracts', contractId, {
    status: 'assinado',
    signedAt,
    signerIp,
    signerName: normalizedSignerName,
    signatureDataUrl,
    documentHash,
  })

  // Atualiza equipamentos vinculados para status 'alugado'
  if (contract.equipmentIds && contract.equipmentIds.length > 0) {
    for (const eqId of contract.equipmentIds) {
      db.update('equipments', eqId, {
        status: 'alugado',
        currentLeadId: contract.leadId,
        currentClientName: contract.clientName,
      })
    }
  }

  // Atualiza lead para 'assinado_entrega'
  db.update('leads', contract.leadId, {
    stage: 'assinado_entrega',
    notes: `Contrato ${contract.number} assinado digitalmente em ${new Date().toLocaleString('pt-BR')}. Pronto para entrega e montagem.`,
  })

  return updated
}

// De -> para. Tudo o que nao esta aqui e recusado.
const STATUS_TRANSITIONS = {
  rascunho: ['pendente_assinatura', 'cancelado'],
  pendente_assinatura: ['cancelado'],
  assinado: ['encerrado', 'cancelado'],
  // So volta a valer o que nunca chegou a ser assinado.
  cancelado: ['pendente_assinatura'],
  encerrado: [],
}

export function allowedContractStatuses(contract) {
  const next = STATUS_TRANSITIONS[contract.status] || []
  return contract.status === 'cancelado' && contract.signedAt ? [] : next
}

/**
 * Cancela, encerra ou reativa um contrato e arruma o que depende dele:
 * equipamento volta para higienizacao, cobranca em aberto de contrato
 * cancelado deixa de ser cobrada e o lead anda no funil.
 */
export function changeContractStatus(contractId, nextStatus, { reason = '', user = null } = {}) {
  const contract = db.find('contracts', (c) => c.id === contractId)
  if (!contract) throw new Error('Contrato não encontrado')
  if (!allowedContractStatuses(contract).includes(nextStatus)) {
    throw new Error('Essa mudança de status não é permitida para este contrato.')
  }

  const now = new Date().toISOString()
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  // Cancelar mexe em estoque e cobranca: o motivo e obrigatorio tambem aqui,
  // nao so na tela.
  if (nextStatus === 'cancelado' && cleanReason.length < 3) throw new Error('Informe o motivo do cancelamento.')
  const history = Array.isArray(contract.statusHistory) ? contract.statusHistory : []
  const updated = db.update('contracts', contractId, {
    status: nextStatus,
    statusReason: cleanReason,
    statusChangedAt: now,
    statusHistory: [...history, { from: contract.status, to: nextStatus, at: now, by: user?.id || null, byName: user?.name || '', reason: cleanReason }].slice(-20),
  })

  const leaving = nextStatus === 'cancelado' || nextStatus === 'encerrado'
  const released = []
  if (leaving) {
    for (const equipmentId of contract.equipmentIds || []) {
      const equipment = db.find('equipments', (item) => item.id === equipmentId)
      // So mexe no que ESTE contrato alugou: o mesmo equipamento pode ja
      // estar com outro cliente.
      if (equipment && equipment.status === 'alugado' && equipment.currentLeadId === contract.leadId) {
        released.push(db.update('equipments', equipmentId, { status: 'higienizacao', currentLeadId: null, currentClientName: null }))
      }
    }
  }

  const cancelledInvoices = []
  if (nextStatus === 'cancelado') {
    for (const invoice of db.filter('invoices', (item) => item.contractNumber === contract.number && ['pendente', 'atrasada'].includes(item.status))) {
      cancelledInvoices.push(db.update('invoices', invoice.id, { status: 'cancelada', cancelledAt: now }))
    }
  }

  const lead = db.find('leads', (item) => item.id === contract.leadId)
  let updatedLead = null
  if (lead) {
    if (nextStatus === 'encerrado') {
      updatedLead = db.update('leads', lead.id, { stage: 'finalizado' })
    } else if (nextStatus === 'cancelado' && ['contrato_gerado', 'assinado_entrega', 'locacao_ativa'].includes(lead.stage)) {
      updatedLead = db.update('leads', lead.id, { stage: 'proposta_enviada' })
    } else if (nextStatus === 'pendente_assinatura' && lead.stage === 'proposta_enviada') {
      updatedLead = db.update('leads', lead.id, { stage: 'contrato_gerado' })
    }
  }

  return { contract: updated, lead: updatedLead, released, cancelledInvoices }
}

export function renderContractHtml(contract) {
  const settings = db.getSettings()
  const company = settings.company
  const isRental = contract.type === 'locacao'
  const cycles = contractualCycles(contract.startDate, contract.endDate)
  const totalContractValue = contract.monthlyValue * cycles
  const earlyTerminationPenalty = totalContractValue * 0.3
  const companyName = escapeHtml(company.name || 'Grupo YR Hospitalar')
  const companyCnpj = escapeHtml(company.cnpj || 'Não informado')
  const companyAddress = escapeHtml(company.address || 'Não informado')
  const companyPhone = escapeHtml(company.phone || 'Não informado')
  const companyEmail = escapeHtml(company.email || 'Não informado')
  const clientName = escapeHtml(contract.clientName || 'Não informado')
  const clientCpf = escapeHtml(contract.clientCpf || 'Não informado')
  const clientPhone = escapeHtml(contract.clientPhone || 'Não informado')
  const clientAddress = escapeHtml(contract.address || 'Não informado')
  const equipmentNames = escapeHtml(contract.equipmentNames || 'Equipamento não informado')
  const customClauses = contract.customClauses
    ? `<div class="section-title">CLÁUSULA ADICIONAL – CONDIÇÕES ESPECÍFICAS</div><div class="clause">${textWithBreaks(contract.customClauses)}</div>`
    : ''
  const signatureImage = contract.signatureDataUrl && /^data:image\/(png|jpeg);base64,/i.test(contract.signatureDataUrl)
    ? `<img class="sig-img" src="${escapeHtml(contract.signatureDataUrl)}" alt="Assinatura eletrônica do contratante">`
    : ''

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Contrato ${escapeHtml(contract.number)} - ${companyName}</title>
    <style>
      @page { size: A4; margin: 20mm 15mm; }
      * { box-sizing: border-box; }
      body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.4; color: #111; margin: 0 auto; padding: 20px; max-width: 800px; background: #fff; text-align: justify; }
      .header-meta { display: flex; justify-content: space-between; gap: 20px; font-weight: bold; margin-bottom: 15px; font-size: 10.5pt; }
      h1 { font-size: 14pt; text-align: center; margin: 15px 0; text-transform: uppercase; font-weight: bold; }
      h2 { font-size: 12pt; margin-top: 18px; margin-bottom: 8px; text-transform: uppercase; font-weight: bold; }
      .section-title { font-weight: bold; margin-top: 15px; margin-bottom: 5px; text-transform: uppercase; }
      .clause { margin: 6px 0 11px; text-align: justify; }
      .summary { border: 1px solid #9ca3af; margin: 10px 0 18px; }
      .summary-title { background: #e8eef5; border-bottom: 1px solid #9ca3af; padding: 7px 9px; font-weight: bold; text-transform: uppercase; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr; }
      .summary-cell { padding: 7px 9px; border-bottom: 1px solid #d1d5db; }
      .summary-cell:nth-child(odd) { border-right: 1px solid #d1d5db; }
      .summary-cell strong { display: block; font-size: 9pt; text-transform: uppercase; margin-bottom: 2px; }
      .sub-item { padding-left: 20px; margin: 4px 0; }
      .signatures { margin-top: 40px; page-break-inside: avoid; }
      .signature-box { display: flex; justify-content: space-between; gap: 40px; }
      .sig-col { flex: 1; text-align: center; min-height: 105px; }
      .sig-img { max-width: 190px; max-height: 70px; margin: 0 auto 3px; display: block; object-fit: contain; }
      .sig-line { border-top: 1px solid #000; margin-top: 35px; padding-top: 6px; font-size: 10pt; }
      .witness-grid { display: flex; justify-content: space-between; gap: 40px; margin-top: 42px; }
      .witness-box { width: 50%; text-align: center; min-height: 75px; }
      .certificate { margin-top: 28px; border: 1px solid #9ca3af; padding: 9px; font-family: Consolas, monospace; font-size: 8.5pt; word-break: break-all; }
      .footer-note { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 8.5pt; color: #4b5563; text-align: center; }
      @media (max-width: 620px) { body { padding: 12px; font-size: 10.5pt; } .summary-grid { grid-template-columns: 1fr; } .summary-cell:nth-child(odd) { border-right: none; } .signature-box, .witness-grid { gap: 15px; } }
      @media print { body { padding: 0; max-width: 100%; } .footer-note { color: #111; } }
    </style>
  </head>
  <body>
    <div class="header-meta">
      <div>Contrato número: ${escapeHtml(contract.number)}</div>
      <div>Data: ${displayDate(contract.createdAt)}</div>
    </div>

    <h1>Contrato de ${isRental ? 'Locação' : 'Venda'} de Equipamentos Hospitalares</h1>

    <h2>I – Quadro-resumo e dados da contratação</h2>
    <div class="summary">
      <div class="summary-title">Partes e condições principais</div>
      <div class="summary-grid">
        <div class="summary-cell"><strong>Locadora / Contratada</strong>${companyName}</div>
        <div class="summary-cell"><strong>CNPJ</strong>${companyCnpj}</div>
        <div class="summary-cell"><strong>Sede e contato</strong>${companyAddress}<br>${companyPhone} · ${companyEmail}</div>
        <div class="summary-cell"><strong>Locatário / Contratante</strong>${clientName}</div>
        <div class="summary-cell"><strong>CPF/CNPJ</strong>${clientCpf}</div>
        <div class="summary-cell"><strong>Telefone</strong>${clientPhone}</div>
        <div class="summary-cell"><strong>Endereço de entrega/instalação</strong>${clientAddress}</div>
        <div class="summary-cell"><strong>Modalidade</strong>${isRental ? 'Locação' : 'Venda'}</div>
        <div class="summary-cell"><strong>Equipamento(s)</strong>${equipmentNames}</div>
        <div class="summary-cell"><strong>Vigência</strong>${displayDate(contract.startDate)} a ${displayDate(contract.endDate)}</div>
        <div class="summary-cell"><strong>Valor mensal / contratado</strong>${formatCurrency(contract.monthlyValue)}</div>
        <div class="summary-cell"><strong>Valor total previsto</strong>${formatCurrency(totalContractValue)} (${cycles} período(s))</div>
      </div>
    </div>

    <h2>II – Cláusulas contratuais</h2>
    <p>As partes acima qualificadas resolvem celebrar o presente contrato de ${isRental ? 'locação de bens móveis' : 'venda de equipamento hospitalar'}, mediante as condições abaixo e a legislação aplicável.</p>

    <div class="section-title">Cláusula 1ª – Do objeto</div>
    <div class="clause">O objeto deste contrato é a ${isRental ? 'locação' : 'venda'} do(s) equipamento(s) descrito(s) no quadro-resumo, de propriedade ou disponibilidade da LOCADORA, para uso no endereço informado pelo LOCATÁRIO.</div>

    <div class="section-title">Cláusula 2ª – Do prazo e da vigência</div>
    <div class="clause">A vigência inicia-se em <strong>${displayDate(contract.startDate)}</strong> e termina em <strong>${displayDate(contract.endDate)}</strong>. Qualquer renovação ou alteração deverá ser confirmada por escrito pelas partes. Na locação, a permanência do equipamento após o término dependerá de renovação ou autorização expressa da LOCADORA.</div>

    <div class="section-title">Cláusula 3ª – Dos valores e do pagamento</div>
    <div class="clause">O valor ${isRental ? 'mensal da locação' : 'da contratação'} é de <strong>${formatCurrency(contract.monthlyValue)}</strong>. Na locação, o valor total previsto para a vigência é de <strong>${formatCurrency(totalContractValue)}</strong>, considerando ${cycles} período(s) mensal(is). O pagamento será realizado até o vencimento informado pela LOCADORA, por Pix, boleto, transferência ou outro meio previamente combinado.</div>

    <div class="section-title">Cláusula 4ª – Da entrega, conferência e higienização</div>
    <div class="clause">A LOCADORA entregará o equipamento em condições adequadas de funcionamento, limpeza e higienização compatíveis com sua finalidade. O LOCATÁRIO deverá conferir o bem no recebimento e comunicar eventual divergência ou dano aparente em até 24 (vinte e quatro) horas, preferencialmente com registros fotográficos.</div>

    <div class="section-title">Cláusula 5ª – Da conservação, uso e manutenção</div>
    <div class="clause">O LOCATÁRIO deverá utilizar o equipamento de acordo com o manual, a orientação de entrega e sua finalidade, protegendo-o contra quedas, líquidos, rede elétrica inadequada, modificações, consertos por terceiros, remoção não autorizada e cessão a terceiros. A manutenção decorrente de desgaste natural será da LOCADORA. Danos, perda, extravio ou custos causados por mau uso, negligência, alteração ou intervenção não autorizada serão ressarcidos pelo LOCATÁRIO após apuração e apresentação de orçamento ou documento equivalente.</div>

    ${isRental ? `
      <div class="section-title">Cláusula 6ª – Da rescisão antecipada e da multa</div>
      <div class="clause">Se o LOCATÁRIO solicitar a rescisão antes do término da vigência, sem justa causa legal ou sem descumprimento comprovado da LOCADORA, será devida multa compensatória de <strong>30% (trinta por cento) sobre o valor total contratado das parcelas vincendas</strong>. Nesta contratação, a base estimada é de <strong>${formatCurrency(totalContractValue)}</strong> e a multa correspondente é de <strong>${formatCurrency(earlyTerminationPenalty)}</strong>, sem prejuízo de valores já vencidos, custos de retirada e danos comprovados. A multa não será aplicada quando a rescisão decorrer de inadimplemento comprovado da LOCADORA, vício ou defeito não solucionado, ou outra hipótese em que a lei determine tratamento diverso.</div>

      <div class="section-title">Cláusula 7ª – Dos limites operacionais e da responsabilidade</div>
      <div class="clause">O equipamento é bem de apoio e não substitui avaliação, prescrição, supervisão ou orientação de profissional de saúde. A LOCADORA não responde por resultados clínicos, uso fora das instruções, ambiente ou instalação inadequados, oscilações elétricas, transporte por terceiros ou informações incorretas fornecidas pelo LOCATÁRIO, preservadas as responsabilidades que não possam ser afastadas por lei, inclusive por defeito comprovado do equipamento ou conduta dolosa ou culposa da LOCADORA.</div>

      <div class="section-title">Cláusula 8ª – Do inadimplemento e da devolução</div>
      <div class="clause">O atraso permite a cobrança dos encargos previamente informados e, após notificação, a suspensão da locação e a solicitação de devolução do equipamento pelos meios legalmente cabíveis. O LOCATÁRIO permanecerá responsável pela guarda do bem até a efetiva entrega, coleta e conferência pela LOCADORA.</div>
    ` : `
      <div class="section-title">Cláusula 6ª – Das responsabilidades</div>
      <div class="clause">O equipamento deverá ser utilizado conforme manual e orientação de entrega. A LOCADORA não responde por uso inadequado, intervenção de terceiros, ambiente incompatível ou resultados clínicos, preservadas as responsabilidades que não possam ser afastadas por lei.</div>
    `}

    <div class="section-title">Cláusula ${isRental ? '9' : '7'}ª – Da proteção de dados e das disposições gerais</div>
    <div class="clause">As partes tratarão os dados pessoais somente para execução, comprovação, atendimento e cumprimento das obrigações deste contrato, observada a legislação aplicável. Alterações, tolerâncias ou serviços adicionais deverão ser formalizados por escrito. Eventuais controvérsias serão submetidas ao foro legalmente competente, sem afastar direitos de competência obrigatória.</div>

    ${customClauses}

    <p style="margin-top: 22px;">E, por estarem de acordo, as partes aceitam este instrumento por assinatura eletrônica, com registro do documento, data e evidências técnicas da assinatura.</p>
    <p style="margin-top: 15px;">${escapeHtml(companyAddress.split(' - ')[0] || 'Curitiba')}, ${displayDate(contract.createdAt)}.</p>

    <div class="signatures">
      <div class="signature-box">
        <div class="sig-col">
          <div class="sig-line"><strong>${companyName}</strong><br>LOCADORA / CONTRATADA</div>
        </div>
        <div class="sig-col">
          ${signatureImage}
          <div class="sig-line"><strong>${escapeHtml(contract.signerName || contract.clientName)}</strong><br>${contract.status === 'assinado' ? `Assinado eletronicamente em ${displayDate(contract.signedAt)} às ${escapeHtml(new Date(contract.signedAt).toLocaleTimeString('pt-BR'))}` : 'Aguardando assinatura do LOCATÁRIO'}</div>
        </div>
      </div>

      <div class="witness-grid">
        <div class="witness-box"><div class="sig-line">TESTEMUNHA 1<br>Nome e CPF, se aplicável</div></div>
        <div class="witness-box"><div class="sig-line">TESTEMUNHA 2<br>Nome e CPF, se aplicável</div></div>
      </div>

      ${contract.documentHash ? `
        <div class="certificate">
          <strong>CERTIFICADO DE ASSINATURA ELETRÔNICA</strong><br>
          Hash SHA-256: ${escapeHtml(contract.documentHash)}<br>
          Registro técnico: ${escapeHtml(contract.signerIp || 'não informado')} · Carimbo de tempo: ${escapeHtml(contract.signedAt || 'não informado')}
        </div>
      ` : ''}
    </div>

    <div class="footer-note">Documento emitido pelo sistema de contratos do ${companyName}. A assinatura eletrônica deve ser conferida pelas partes antes da utilização.</div>
  </body>
  </html>
  `
}
