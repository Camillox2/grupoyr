export const qualificationLabels: Record<string, string> = {
  name:'Nome', equipmentInterest:'Equipamento', modality:'Compra ou locação',
  city:'Cidade', district:'Bairro', neededAt:'Quando precisa', estimatedPeriod:'Período da locação',
  access:'Acesso para entrega', street:'Rua ou avenida', number:'Número', cep:'CEP', state:'UF',
  usageLocation:'Local de uso', quantity:'Quantidade desejada', conditionPreference:'Condição aceita',
}
type Qualification = { fields?: Record<string, { value?: string; status?: string }>; [key: string]: unknown }
export function qualificationValue(data: Qualification | undefined, key: string): string {
  const field = data?.fields?.[key]
  if (field) return field.status === 'confirmed' && typeof field.value === 'string' ? field.value : ''
  return typeof data?.[key] === 'string' ? data[key] as string : ''
}
export function qualificationLabel(key: string): string { return qualificationLabels[key] || 'Informação adicional' }

// Untouched fields follow incoming socket updates; a seller's in-progress edit wins.
export function mergeSheetDraft<T extends { addressData: object }>(current: T, incoming: T, edited: Set<string>): T {
  const result = { ...incoming, addressData: { ...incoming.addressData } }
  for (const key of edited) {
    if (key.startsWith('addressData.')) { const field = key.slice(12); (result.addressData as Record<string, string>)[field] = (current.addressData as Record<string, string>)[field] }
    else (result as Record<string, unknown>)[key] = (current as Record<string, unknown>)[key]
  }
  return result
}
