/**
 * Ficha de fechamento do lead: dados do cliente, endereco, acesso, itens da
 * cotacao, entrega, frete e checklist.
 *
 * Tudo que chega aqui e entrada de usuario e vai para o banco, entao nada e
 * copiado direto do corpo da requisicao: cada campo tem tipo, tamanho maximo e,
 * quando e o caso, lista fechada de valores. O que nao estiver nesta lista e
 * descartado em silencio.
 */

const ACCESS = ['terreo', 'escada', 'elevador', 'nao_sei']
const MODALITY = ['locacao', 'compra']

// Mesmo catalogo do site. `rent: false` = sai apenas em compra.
export const CATALOG = [
  { name: 'Cama elétrica luxo', rent: true },
  { name: 'Cama manual 3 movimentos', rent: true },
  { name: 'Colchão pneumático', rent: false },
  { name: 'Cadeira de banho', rent: true },
]

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const money = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.min(Math.round(number * 100) / 100, 10_000_000)
}
const integer = (value, min, max) => {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}
const isoDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')

function cleanAddress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    cep: text(source.cep, 9).replace(/[^\d-]/g, ''),
    street: text(source.street, 120),
    number: text(source.number, 12),
    complement: text(source.complement, 60),
    district: text(source.district, 80),
    city: text(source.city, 80),
    state: text(source.state, 2).toUpperCase(),
  }
}

function cleanItems(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const product = CATALOG.find((entry) => entry.name === item.product)
    if (!product) return [] // so entra o que existe no catalogo
    let modality = MODALITY.includes(item.modality) ? item.modality : 'locacao'
    // Regra de negocio: item sem locacao e sempre compra, diga o cliente o que disser.
    if (!product.rent) modality = 'compra'
    return [
      {
        product: product.name,
        modality,
        qty: integer(item.qty, 1, 99),
        unitPrice: money(item.unitPrice),
      },
    ]
  })
}

function cleanChecklist(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const result = {}
  for (const key of ['proposta_aceita', 'documento_conferido', 'acesso_confirmado', 'pagamento_combinado']) {
    result[key] = source[key] === true
  }
  return result
}

/** Endereco em uma linha, do jeito que o contrato imprime. */
export function addressLine(address) {
  if (!address || !address.street) return ''
  const first = [address.street, address.number].filter(Boolean).join(', ')
  const parts = [
    [first, address.complement].filter(Boolean).join(' - '),
    address.district,
    [address.city, address.state].filter(Boolean).join('/'),
    address.cep ? `CEP ${address.cep}` : '',
  ].filter(Boolean)
  return parts.join(' - ')
}

/** Devolve apenas os campos aceitos, ja saneados, prontos para db.update. */
export function sanitizeLeadDetails(body) {
  const source = body && typeof body === 'object' ? body : {}
  const addressData = cleanAddress(source.addressData)
  const quoteItems = cleanItems(source.quoteItems)
  const itemsTotal = quoteItems.reduce((total, item) => total + item.qty * item.unitPrice, 0)

  const details = {
    cpf: text(source.cpf, 20).replace(/[^\d./-]/g, ''),
    email: text(source.email, 120),
    addressData,
    address: addressLine(addressData),
    access: ACCESS.includes(source.access) ? source.access : 'nao_sei',
    floor: text(source.floor, 20),
    quoteItems,
    freight: money(source.freight),
    rentalMonths: integer(source.rentalMonths, 0, 120),
    deliveryDate: isoDate(source.deliveryDate),
    deliveryNotes: text(source.deliveryNotes, 400),
    checklist: cleanChecklist(source.checklist),
    detailsUpdatedAt: new Date().toISOString(),
  }

  // A cotacao passa a ser a fonte do valor e do interesse do lead: e o que o
  // funil mostra e o que o contrato usa quando nao ha patrimonio vinculado.
  if (quoteItems.length > 0) {
    details.value = Math.round(itemsTotal * 100) / 100
    details.equipmentInterest = quoteItems
      .map((item) => `${item.qty}x ${item.product} (${item.modality === 'locacao' ? 'locação' : 'compra'})`)
      .join(', ')
      .slice(0, 300)
    details.modality = quoteItems.some((item) => item.modality === 'locacao') ? 'locacao' : 'compra'
  }

  return details
}
