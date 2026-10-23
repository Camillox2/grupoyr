import type { Equipment } from '../types'

export interface CatalogProduct { name: string; code: string; rent: boolean; monthlyPrice: number; salePrice: number; available: number }
export function productCatalog(equipments: Equipment[]): CatalogProduct[] {
  const groups = new Map<string, CatalogProduct>()
  for (const equipment of equipments) {
    const code = equipment.productCode || equipment.name
    const current = groups.get(code)
    const available = equipment.status === 'disponivel' && !equipment.reservationContractId ? 1 : 0
    if (current) { current.available += available; continue }
    groups.set(code, { name: equipment.name, code: equipment.productCode || '', rent: true, monthlyPrice: Number(equipment.monthlyPrice) || 0, salePrice: Number(equipment.salePrice) || 0, available })
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
