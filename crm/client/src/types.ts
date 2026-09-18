export type Stage =
  | 'novo_lead'
  | 'qualificacao_ia'
  | 'proposta_enviada'
  | 'contrato_gerado'
  | 'assinado_entrega'
  | 'locacao_ativa'
  | 'finalizado'

export interface Lead {
  id: string
  name: string
  phone: string
  email: string
  stage: Stage
  origin: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  equipmentInterest: string
  modality: 'locacao' | 'compra'
  estimatedPeriod: string
  aiSummary: string
  aiEnabled: boolean
  lastInteraction: string
  assignedTo: string
  value: number
  notes: string
  createdAt: string

  // Ficha de fechamento (ver LeadSheet.tsx e server/src/leadDetails.js)
  cpf?: string
  address?: string
  addressData?: LeadAddress
  access?: LeadAccess
  floor?: string
  quoteItems?: QuoteItem[]
  freight?: number
  rentalMonths?: number
  deliveryDate?: string
  deliveryNotes?: string
  checklist?: Record<string, boolean>
}

export type LeadAccess = 'terreo' | 'escada' | 'elevador' | 'nao_sei'

export interface LeadAddress {
  cep: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
}

export interface QuoteItem {
  product: string
  modality: 'locacao' | 'compra'
  qty: number
  unitPrice: number
}

export interface Message {
  id: string
  leadId: string
  from: 'client' | 'agent' | 'ai'
  type: 'text' | 'image' | 'audio' | 'file'
  modelUsed?: string
  content: string
  deliveryStatus?: 'sending' | 'sent' | 'pending_connection'
  timestamp: string
}

export interface Equipment {
  id: string
  serialNumber: string
  name: string
  category: string
  status: 'disponivel' | 'alugado' | 'higienizacao' | 'manutencao'
  currentLeadId: string | null
  currentClientName: string | null
  monthlyPrice: number
  salePrice: number
  location: string
  lastSanitized: string
  sanitizationCert: string
}

export interface Contract {
  id: string
  number: string
  leadId: string
  clientName: string
  clientCpf: string
  clientPhone: string
  address: string
  type: 'locacao' | 'venda'
  equipmentIds: string[]
  equipmentNames: string
  startDate: string
  endDate: string
  monthlyValue: number
  status: 'rascunho' | 'pendente_assinatura' | 'assinado' | 'cancelado'
  signedAt: string | null
  signerIp: string | null
  signerName?: string | null
  signatureDataUrl: string | null
  documentHash?: string | null
  customClauses?: string
  signingToken?: string | null
  createdAt: string
}

export interface Invoice {
  id: string
  contractNumber: string
  clientName: string
  leadId: string | null
  amount: number
  dueDate: string
  status: 'paga' | 'pendente' | 'atrasada'
  paidAt: string | null
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'vendedor' | 'tecnico'
}

export interface WhatsAppStatus {
  provider: 'baileys' | 'meta'
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready' | 'connected_meta'
  connectedNumber: string | null
  qrCode: string | null
  qrGeneratedAt?: string | null
  pairingCode?: string | null
  lastError?: string | null
}
