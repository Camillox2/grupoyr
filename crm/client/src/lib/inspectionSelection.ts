import type { Contract, Equipment, Lead } from '../types'
import type { Inspection } from './customerApi'

export interface InspectionEquipmentChoice {
  key: string
  leadId: string
  clientName: string
  equipmentId: string
  equipmentName: string
  serialNumber: string
  contractId: string
  inspectionId: string
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
export const matchesInspectionSearch = (value: { clientName: string; equipmentName: string; serialNumber: string }, search: string) =>
  normalize(value.clientName + ' ' + value.equipmentName + ' ' + value.serialNumber).includes(normalize(search))

export function inspectionEquipmentChoices(
  leads: Lead[], contracts: Contract[], equipments: Equipment[], inspections: Inspection[], leadId = '',
): InspectionEquipmentChoice[] {
  const clients = new Map(leads.map(client => [client.id, client]))
  const inventory = new Map(equipments.map(equipment => [equipment.id, equipment]))
  const activeContracts = contracts.filter(contract => !['cancelado', 'encerrado'].includes(contract.status))
  const choices = new Map<string, InspectionEquipmentChoice>()
  const addLinked = (clientId: string, equipment: Equipment, contractId = '') => {
    if (leadId && clientId !== leadId) return
    const client = clients.get(clientId)
    if (!client) return
    const key = JSON.stringify([clientId, equipment.id])
    if (!choices.has(key)) choices.set(key, {
      key, leadId: clientId, clientName: client.name, equipmentId: equipment.id,
      equipmentName: equipment.name, serialNumber: equipment.serialNumber, contractId, inspectionId: '',
    })
  }
  for (const contract of activeContracts) {
    for (const id of contract.equipmentIds) {
      const equipment = inventory.get(id)
      if (equipment) addLinked(contract.leadId, equipment, contract.id)
    }
  }
  for (const equipment of equipments) {
    if (equipment.currentLeadId) addLinked(equipment.currentLeadId, equipment)
  }
  // Old inspections stay navigable. The latest record is selected without changing its client or equipment.
  for (const inspection of [...inspections].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (leadId && inspection.leadId !== leadId) continue
    const key = JSON.stringify([inspection.leadId, inspection.equipmentId])
    const linked = choices.get(key)
    choices.set(key, {
      key, leadId: inspection.leadId, clientName: inspection.clientName,
      equipmentId: inspection.equipmentId, equipmentName: inspection.equipmentName, serialNumber: inspection.serialNumber,
      contractId: activeContracts.some(contract => contract.id === inspection.contractId && contract.leadId === inspection.leadId) ? inspection.contractId! : linked?.contractId || '',
      inspectionId: inspection.id,
    })
  }
  return [...choices.values()].sort((a, b) => (a.clientName + ' ' + a.serialNumber).localeCompare(b.clientName + ' ' + b.serialNumber, 'pt-BR'))
}
