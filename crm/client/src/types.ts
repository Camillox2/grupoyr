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
  internalNotes?: string
  checklist?: Record<string, boolean>

  // Atendimento (ver server/src/metaTemplates.js)
  /** Sem valor = aberta. Conversa encerrada some da lista de abertas. */
  conversationStatus?: 'open' | 'closed'
  closedAt?: string
  /** Ultima mensagem DO CLIENTE: e dela que a Meta conta a janela de 24h. */
  lastInboundAt?: string
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
  productCode?: string
  modality: 'locacao' | 'compra'
  qty: number
  unitPrice: number
}

export interface Message {
  id: string
  leadId: string
  from: 'client' | 'agent' | 'ai' | 'system'
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'template'
  modelUsed?: string
  templateName?: string
  content: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaFileName?: string
  deliveryStatus?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'pending_connection'
  deliveryError?: string
  timestamp: string
}

/** Template aprovado na Meta, ja resumido pelo servidor. */
export interface MessageTemplate {
  id: string
  name: string
  language: string
  category: string
  header: { format: string; text: string; variables: string[]; needsMedia: boolean }
  body: { text: string; variables: string[] }
  footer: string
  buttons: { type: string; text: string }[]
  supported: boolean
  unsupportedReason: string
}

/** O que o seletor de template devolve para quem vai enviar. */
export interface TemplateSelection {
  templateId: string
  bodyValues: string[]
  headerValues: string[]
  headerMediaUrl: string
  /** Tudo preenchido: pode enviar. */
  ready: boolean
}

export interface Equipment {
  id: string
  serialNumber: string
  productCode?: string
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
  status: 'rascunho' | 'pendente_assinatura' | 'assinado' | 'cancelado' | 'encerrado'
  /** Mudancas que o servidor aceita a partir do status atual. */
  nextStatuses?: ('pendente_assinatura' | 'cancelado' | 'encerrado')[]
  statusReason?: string
  linkSentAt?: string
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
  status: 'paga' | 'pendente' | 'atrasada' | 'cancelada'
  paidAt: string | null
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'vendedor' | 'tecnico'
}

export interface LeadAttachment {
  id: string
  leadId: string
  fileName: string
  mimeType: string
  size: number
  uploadedBy: string
  createdAt: string
}

export interface CrmNotification {
  id: string
  recipientId: string
  leadId: string
  kind: string
  title: string
  message: string
  createdAt: string
  readAt: string | null
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
