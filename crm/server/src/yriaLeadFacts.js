import { addressLine } from './leadDetails.js'
import { qualificationSummary, recoverQualification } from './yriaCore.js'

// Copy only evidenced customer facts. A generic "cama" never selects a model,
// price, physical unit, quantity, freight or payment on the customer's behalf.
export function qualificationLeadPatch(lead, state, { fillOnly = false } = {}) {
  const patch = {}, fields = state.fields || {}, value = key => fields[key]?.status === 'confirmed' ? fields[key].value : ''
  for (const key of ['name','equipmentInterest','modality','estimatedPeriod']) {
    if (value(key) && (!fillOnly || !lead[key] || (key === 'name' && /^Contato\b/i.test(lead[key])))) patch[key] = value(key)
  }
  const addressData = { ...(lead.addressData || {}) }
  for (const key of ['city','district','street','number','cep','state']) {
    if (value(key) && (!fillOnly || !addressData[key])) addressData[key] = value(key)
  }
  if (JSON.stringify(addressData) !== JSON.stringify(lead.addressData || {})) {
    patch.addressData = addressData
    patch.address = addressLine(addressData)
  }
  const access = { 'térreo':'terreo', terreo:'terreo', escada:'escada', elevador:'elevador' }[value('access').toLowerCase()]
  if (access && (!fillOnly || !lead.access || lead.access === 'nao_sei')) patch.access = access
  const period = value('estimatedPeriod').match(/^(\d{1,3})\s*(m[eê]s|meses)$/iu)
  if (period && Number(period[1]) >= 1 && Number(period[1]) <= 120 && (!fillOnly || !lead.rentalMonths)) patch.rentalMonths = Number(period[1])
  return patch
}

export function rebuildLeadQualification(lead, messages, config) {
  const qualificationData = recoverQualification(lead.qualificationData || {}, messages, config)
  return { ...qualificationLeadPatch(lead, qualificationData, { fillOnly: true }), qualificationData, aiSummary: qualificationSummary(qualificationData) }
}

