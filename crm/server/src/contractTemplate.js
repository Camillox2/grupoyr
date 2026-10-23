import { contractFreight } from './contractFreight.js'

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

const contractualCycles = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const days = Math.max(1, Math.ceil((end - start) / 86400000))
  return Math.max(1, Math.ceil(days / 30))
}

export function renderContractHtml(contract, settings) {
  const company = contract.companySnapshot || settings.company
  const isRental = contract.type === 'locacao'
  const cycles = isRental ? (contract.rentalMonths || contractualCycles(contract.startDate, contract.endDate)) : 1
  const freight = contractFreight(contract)
  const freightTotal = (freight.deliveryCents + freight.pickupCents) / 100
  const splitBilling = contract.freightBillingVersion >= 2
  const separateReturn = contract.freightBillingVersion === 3
  const pickupCharge = separateReturn ? contract.billingSchedule?.find(charge => charge.kind === 'frete_retirada') : null
  // Keep the rendering of already-signed legacy documents unchanged.
  const showFreight = contract.freightDetailsVersion === 1 || (contract.status !== 'assinado' && contract.freightQuote)
  const totalContractValue = contract.monthlyValue * cycles + freightTotal + (contract.oneTimePurchaseTotal || 0)
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
        ${showFreight ? `<div class="summary-cell"><strong>Frete de entrega (ida)</strong>${formatCurrency(freight.deliveryCents / 100)}</div>${isRental ? `<div class="summary-cell"><strong>Frete de retirada (volta)</strong>${formatCurrency(freight.pickupCents / 100)}</div>` : ''}` : ''}
        <div class="summary-cell"><strong>Valor total previsto</strong>${formatCurrency(totalContractValue)} (${cycles} período(s))</div>
        ${splitBilling ? `<div class="summary-cell"><strong>Primeira cobrança</strong>${formatCurrency(contract.billingSchedule?.[0]?.amount ?? contract.monthlyValue + (contract.oneTimePurchaseTotal || 0) + freight.deliveryCents / 100)} - entrega (ida) incluída</div>${separateReturn ? `${(contract.billingSchedule || []).filter(charge => charge.installment > 1 && charge.kind === 'mensalidade').map(charge => `<div class="summary-cell"><strong>Mensalidade ${charge.installment} — sem frete de volta</strong>${formatCurrency(charge.amount)} - vencimento ${displayDate(charge.dueDate)}</div>`).join('')}${pickupCharge ? `<div class="summary-cell"><strong>Frete de retirada — cobrança única, não mensal</strong>${formatCurrency(pickupCharge.amount)} - vencimento ${displayDate(pickupCharge.dueDate)}</div>` : ''}` : contract.billingSchedule?.[1] ? `<div class="summary-cell"><strong>Segunda cobrança</strong>${formatCurrency(contract.billingSchedule[1].amount)} - vencimento ${displayDate(contract.billingSchedule[1].dueDate)}${freight.pickupCents ? '; retirada (volta) incluída' : ''}</div>` : ''}` : ''}
      </div>
    </div>

    ${contract.itemDetailsVersion === 1 ? `<div class="section-title">Produtos e acessórios contratados</div>${(contract.itemsSnapshot || []).map(item => `<div class="clause"><strong>${escapeHtml(item.product)}</strong> (${escapeHtml(item.productCode)}) · ${item.qty} unidade(s) · ${item.modality === 'locacao' ? 'Locação mensal' : 'Compra, cobrança única'} · ${formatCurrency(item.unitPrice)} por unidade · Total: ${formatCurrency(item.qty * item.unitPrice)}${item.modality === 'locacao' ? ' / mês' : ''}<br>Patrimônio(s): ${escapeHtml(item.patrimonies.join(', '))}</div>`).join('')}${contract.oneTimePurchaseTotal ? `<div class="clause">Os acessórios em compra somam <strong>${formatCurrency(contract.oneTimePurchaseTotal)}</strong> e são cobrados uma única vez na primeira cobrança, sem compor a mensalidade.</div>` : ''}` : ''}
    ${contract.closingNotes ? `<div class="section-title">Observações do fechamento</div><div class="clause">${textWithBreaks(contract.closingNotes)}</div>` : ''}
    <h2>II – Cláusulas contratuais</h2>
    <p>As partes acima qualificadas resolvem celebrar o presente contrato de ${isRental ? 'locação de bens móveis' : 'venda de equipamento hospitalar'}, mediante as condições abaixo e a legislação aplicável.</p>

    <div class="section-title">Cláusula 1ª – Do objeto</div>
    <div class="clause">O objeto deste contrato é a ${isRental ? 'locação' : 'venda'} do(s) equipamento(s) descrito(s) no quadro-resumo, de propriedade ou disponibilidade da LOCADORA, para uso no endereço informado pelo LOCATÁRIO.</div>

    <div class="section-title">Cláusula 2ª – Do prazo e da vigência</div>
    <div class="clause">A vigência inicia-se em <strong>${displayDate(contract.startDate)}</strong> e termina em <strong>${displayDate(contract.endDate)}</strong>. Qualquer renovação ou alteração deverá ser confirmada por escrito pelas partes. Na locação, a permanência do equipamento após o término dependerá de renovação ou autorização expressa da LOCADORA.</div>

    <div class="section-title">Cláusula 3ª – Dos valores e do pagamento</div>
    <div class="clause">O valor ${isRental ? 'mensal da locação' : 'da contratação'} é de <strong>${formatCurrency(contract.monthlyValue)}</strong>. Na locação, o valor total previsto para a vigência é de <strong>${formatCurrency(totalContractValue)}</strong>, considerando ${cycles} período(s) mensal(is). O pagamento será realizado até o vencimento informado pela LOCADORA, por Pix, boleto, transferência ou outro meio previamente combinado.</div>
    ${showFreight ? `<div class="clause">O frete de entrega (ida) é de <strong>${formatCurrency(freight.deliveryCents / 100)}</strong>${isRental ? ` e o frete de retirada (volta) é de <strong>${formatCurrency(freight.pickupCents / 100)}</strong>` : ''}. ${separateReturn ? `O frete de entrega é cobrado uma única vez na primeira cobrança.${pickupCharge ? ` O frete de retirada é uma cobrança única e independente, no valor de <strong>${formatCurrency(pickupCharge.amount)}</strong>, com vencimento em <strong>${displayDate(pickupCharge.dueDate)}</strong>, sem compor a primeira cobrança nem as mensalidades. Essa data é o vencimento do frete e não confirma o agendamento logístico da coleta.` : ''}` : splitBilling ? `O frete de entrega é cobrado uma única vez na primeira cobrança${isRental ? ' e o frete de retirada uma única vez na segunda cobrança' : ''}, sem integrar o valor mensal da locação.${isRental && cycles === 1 && freight.pickupCents ? ' Como a locação é de um único mês, a segunda cobrança contém apenas o frete de retirada, sem mensalidade adicional.' : ''}` : 'Os fretes são cobrados uma única vez, na primeira cobrança, e não integram o valor mensal da locação.'}</div>` : ''}

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
