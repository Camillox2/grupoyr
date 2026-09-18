// Telefone e entrada externa: chega do formulario, do WhatsApp e da Meta em
// formatos diferentes. Tudo passa por aqui antes de virar chave de busca.

/** So digitos, com DDI. Devolve null quando nao da para confiar no numero. */
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return null
  // Brasil sem DDI: DDD + 8 (fixo) ou 9 (celular) digitos.
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  if (full.length < 10 || full.length > 15) return null
  return full
}

/**
 * Chave de comparacao. No Brasil o mesmo celular aparece com e sem o nono
 * digito (o WhatsApp ainda entrega numeros antigos sem ele), entao compara-se
 * DDI + DDD + os 8 ultimos digitos. Fora do Brasil, o numero inteiro.
 */
export function phoneKey(input) {
  const full = normalizePhone(input)
  if (!full) return ''
  if (full.startsWith('55') && (full.length === 12 || full.length === 13)) {
    return `55${full.slice(2, 4)}${full.slice(-8)}`
  }
  return full
}
