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
