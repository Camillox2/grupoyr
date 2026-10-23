export type Stage =
  | 'novo_lead'
  | 'qualificacao_ia'
  | 'proposta_enviada'
  | 'contrato_gerado'
  | 'assinado_entrega'
  | 'locacao_ativa'
  | 'finalizado'

export interface Lead {
  closingNotes?: string
  id: string
  clientRegisteredAt?: string
  clientRegisteredBy?: string
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
  yriaOrderDraft?: { product:string; productCode:string; modality:'locacao'|'compra'; quantity:number; unitPrice:number; rentalMonths:number|null; subtotal:number; deliveryFreight:number; pickupFreight:number; total:number; confirmedAt:string; pendingChecks:string[] }
  aiEnabled: boolean
  aiControlRevision?: string
  aiControlChangedAt?: string
  aiManualPausedAt?: string | null
  humanAssumedAt?: string | null
  updatedAt?: string
  lastInteraction: string
  assignedTo: string
  value: number
  notes: string
  createdAt: string
  /** Reversible removal from the sales board, not deletion of the client. */
  funnelArchive?: { at:string; by:string; byName:string; reason:string } | null
  funnelRevision?: string

  // Ficha de fechamento (ver LeadSheet.tsx e server/src/leadDetails.js)
  cpf?: string
  address?: string
  addressData?: LeadAddress
  access?: LeadAccess
  floor?: string
  quoteItems?: QuoteItem[]
  freight?: number
  deliveryFreight?: number
  pickupFreight?: number
  pickupFreightDueDate?: string
  rentalMonths?: number
  deliveryDate?: string
  deliveryNotes?: string
  checklist?: Record<string, boolean>
  qualificationData?: {
    fields?: Record<string, { value: string; status: 'confirmed' | 'unknown'; source?: string; messageId?: string }>
    status?: string
    name?: string
    equipmentInterest?: string
    modality?: 'locacao' | 'compra' | 'indefinido'
    estimatedPeriod?: string
    city?: string
    district?: string
    access?: 'terreo' | 'escada' | 'elevador' | 'nao_sei'
    urgency?: 'imediata' | '24-48h' | 'planejada' | 'nao_informado'
    missingFields?: string[]
    qualified?: boolean
    updatedAt?: string
  }
  aiHandoffReason?: 'ia_indisponivel' | 'qualificacao_concluida'

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
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'template' | 'sticker' | 'call'
  modelUsed?: string
  templateName?: string
  content: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaFileName?: string
  mediaSize?: number
  mediaIsGif?: boolean
  mediaIsAnimated?: boolean
  mediaStatus?: 'available' | 'pending'
  sentVia?: string
  isAutomated?: boolean
  automaticReplyKind?: 'legacy_fallback'
  callStatus?: string
  callIsVideo?: boolean
  deliveryStatus?: 'prepared' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'pending_connection' | 'delivery_unknown' | 'cancelled'
  deliveryError?: string
  timestamp: string
  receivedAt?: string
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
  status: 'disponivel' | 'alugado' | 'higienizacao' | 'manutencao' | 'reservado' | 'vendido'
  reservationContractId?: string | null
  shipping?: {widthCm:number;heightCm:number;lengthCm:number;weightKg:number;insuranceValue:number;carrierEligible:boolean}
  currentLeadId: string | null
  currentClientName: string | null
  monthlyPrice: number
  salePrice: number
  location: string
  lastSanitized: string
  sanitizationCert: string
}

export interface Contract {
  closingNotes?: string
  clientEmail?: string
  emailRecipient?: string
  itemDetailsVersion?: number
  itemsSnapshot?: { product: string; productCode: string; qty: number; unitPrice: number; modality: 'locacao' | 'compra'; equipmentIds: string[]; patrimonies: string[] }[]
  oneTimePurchaseTotal?: number
  deliveryFreight?: number
  pickupFreight?: number
  pickupFreightDueDate?: string
  freightDetailsVersion?: number
  freightBillingVersion?: number
  billingSchedule?: { installment: number; dueDate: string; amount: number; rentalCents: number; saleCents: number; purchaseCents: number; deliveryCents: number; pickupCents: number; kind: string }[]
  automatic?: boolean
  rentalMonths?: number | null
  reservationExpiresAt?: string
  quoteSnapshot?: {totalCents:number}
  freightQuote?: {deliveryCents:number;pickupCents:number}
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
  kind?: string
  id: string
  contractNumber: string
  clientName: string
  leadId: string | null
  amount: number
  dueDate: string
  status: 'paga' | 'pendente' | 'atrasada' | 'cancelada'
  paidAt: string | null
}

export type CalendarEventType = 'compromisso' | 'entrega' | 'retirada' | 'visita' | 'ligacao' | 'cobranca' | 'manutencao'

export interface CalendarEvent {
  id: string
  title: string
  type: CalendarEventType
  date: string
  startTime: string
  endTime: string
  leadId: string | null
  contractId: string | null
  equipmentId: string | null
  notes: string
  status: 'scheduled' | 'done' | 'cancelled'
  assignedTo: string | null
  createdBy: string
  createdAt: string
}

export type ContractExpenseCategory = 'entrega' | 'retirada' | 'manutencao' | 'outro'

export interface ContractExpense {
  id: string
  contractId: string
  contractNumber: string
  clientName: string
  leadId: string
  category: ContractExpenseCategory
  description: string
  amount: number
  date: string
  createdBy: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'vendedor' | 'tecnico'
  /** Telas liberadas para o usuário (vem do servidor). Ausente = todas. */
  screens?: string[]
  active?: boolean
}

export interface WhatsAppHistorySync {
  leadId: string
  phase: 'requesting' | 'waiting_phone' | 'processing' | 'paused' | 'timed_out' | 'completed' | 'no_history' | 'error'
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  received: number
  processed: number
  imported: number
  error: string | null
  providerProgress: number | null
  deadlineAt: string | null
  attempts: number
  runId: string
  pauseReason?: string | null
}

export interface WhatsAppStatus {
  instanceId?: string
  snapshotAt?: string
  provider: 'baileys' | 'meta'
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready' | 'connected_meta'
  connectedNumber: string | null
  qrCode: string | null
  qrGeneratedAt?: string | null
  pairingCode?: string | null
  lastError?: string | null
  historySync?: { conversations?: Record<string, WhatsAppHistorySync> }
}
