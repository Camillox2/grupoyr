import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'crm_store.json')
const DATABASE_URL = process.env.DATABASE_URL || ''
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || ''

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const initialData = {
  settings: {
    whatsappProvider: 'baileys', // 'baileys' | 'meta'
    metaConfig: {
      accessToken: '',
      phoneNumberId: '',
      wabaId: '',
      verifyToken: process.env.META_VERIFY_TOKEN || '',
    },
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    activeAiModels: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ],
    company: {
      name: 'Grupo YR Hospitalar',
      cnpj: '45.123.890/0001-23',
      phone: '(41) 99724-4279',
      email: 'rodrigo@grupoyrhospitalar.com.br',
      address: 'Curitiba - PR e Região Metropolitana',
    },
  },
  users: [
    {
      id: 'usr_admin',
      name: 'Rodrigo (Diretoria)',
      email: 'rodrigo@grupoyrhospitalar.com.br',
      passwordHash: INITIAL_ADMIN_PASSWORD ? bcrypt.hashSync(INITIAL_ADMIN_PASSWORD, 10) : '',
      role: 'admin', // admin | vendedor | tecnico
      createdAt: '2026-09-01T10:00:00Z',
    },
    {
      id: 'usr_vendedor',
      name: 'Camila (Comercial YR)',
      email: 'vendas@grupoyrhospitalar.com.br',
      passwordHash: '',
      role: 'vendedor',
      createdAt: '2026-09-02T10:00:00Z',
    },
    {
      id: 'usr_tecnico',
      name: 'Marcos (Logística e Entrega)',
      email: 'logistica@grupoyrhospitalar.com.br',
      passwordHash: '',
      role: 'tecnico',
      createdAt: '2026-09-02T10:00:00Z',
    },
  ],
  leads: [
    {
      id: 'lead_101',
      name: 'Mariana Silveira',
      phone: '5541988881122',
      email: 'mariana.silveira@gmail.com',
      stage: 'qualificacao_ia', // novo_lead | qualificacao_ia | proposta_enviada | contrato_gerado | assinado_entrega | locacao_ativa | finalizado
      origin: 'Google Ads', // Google Ads | Google Orgânico | WhatsApp Direto | Meta Ads | Indicação
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'aluguel_cama_curitiba',
      equipmentInterest: 'Cama hospitalar articulada',
      modality: 'locacao', // locacao | compra
      estimatedPeriod: '60 dias',
      aiSummary: 'Paciente pós-alta cirúrgica de fêmur (idosa de 78 anos). Necessita de elevação de cabeceira e grades de proteção para evitar quedas. Familiar solicitou entrega urgente para amanhã em Santa Felicidade, Curitiba. Recomendado combo com colchão anti-escaras.',
      aiEnabled: true,
      lastInteraction: '2026-09-11T18:45:00Z',
      assignedTo: 'usr_vendedor',
      value: 480.0,
      notes: 'Confirmou que mora em casa térrea, acesso facilitado para montagem.',
      createdAt: '2026-09-11T17:30:00Z',
    },
    {
      id: 'lead_102',
      name: 'Dr. Eduardo Mello (Clínica São Rafael)',
      phone: '5541991112233',
      email: 'eduardo@clinicasaorafael.com.br',
      stage: 'proposta_enviada',
      origin: 'Google Orgânico',
      utmSource: 'google',
      utmMedium: 'organic',
      utmCampaign: 'equipamentos_clinica',
      equipmentInterest: 'Carrinho de emergência',
      modality: 'compra',
      estimatedPeriod: 'Definitivo',
      aiSummary: 'Clínica médica privada expandindo centro de pequenos procedimentos cirúrgicos no Batel. Solicitou orçamento para 2 carrinhos de emergência completos com travas e suporte de cardioversor.',
      aiEnabled: false,
      lastInteraction: '2026-09-11T16:10:00Z',
      assignedTo: 'usr_admin',
      value: 6800.0,
      notes: 'Proposta formal enviada em PDF com desconto de 5% à vista.',
      createdAt: '2026-09-10T14:20:00Z',
    },
    {
      id: 'lead_103',
      name: 'Beatriz Fontoura',
      phone: '5541977773344',
      email: 'beatriz.fontoura@hotmail.com',
      stage: 'contrato_gerado',
      origin: 'Meta Ads',
      utmSource: 'instagram',
      utmMedium: 'stories',
      utmCampaign: 'home_care_cuidado',
      equipmentInterest: 'Cama manual 3 movimentos',
      modality: 'locacao',
      estimatedPeriod: '90 dias',
      aiSummary: 'Cuidados paliativos domiciliares para o pai. Optou por cama manual de 3 movimentos com elevação de pernas e cabeceira. Contrato gerado aguardando assinatura digital da filha.',
      aiEnabled: false,
      lastInteraction: '2026-09-11T19:00:00Z',
      assignedTo: 'usr_vendedor',
      value: 390.0,
      notes: 'Contrato gerado #CTR-2026-089 enviado para assinatura via WhatsApp.',
      createdAt: '2026-09-09T11:00:00Z',
    },
    {
      id: 'lead_104',
      name: 'Carlos Alberto Gusmão',
      phone: '5541984445566',
      email: 'carlos.gusmao@uol.com.br',
      stage: 'locacao_ativa',
      origin: 'Google Ads',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'cama_hospitalar_locacao',
      equipmentInterest: 'Cama hospitalar articulada',
      modality: 'locacao',
      estimatedPeriod: '30 dias',
      aiSummary: 'Locação ativa entregue e montada em 05/09 no bairro Cabral. Equipamento Cama Articulada Patr. #YR-014. Próxima fatura vence em 05/10.',
      aiEnabled: false,
      lastInteraction: '2026-09-08T10:00:00Z',
      assignedTo: 'usr_tecnico',
      value: 480.0,
      notes: 'Equipamento instalado com sucesso pelo técnico Marcos.',
      createdAt: '2026-09-04T09:15:00Z',
    },
    {
      id: 'lead_105',
      name: 'Lar dos Idosos Esperança',
      phone: '5541995556677',
      email: 'contato@laresperanca.org.br',
      stage: 'novo_lead',
      origin: 'Indicação',
      utmSource: 'indicacao',
      utmMedium: 'direto',
      utmCampaign: 'parceria_institucional',
      equipmentInterest: 'Maca hidráulica',
      modality: 'compra',
      estimatedPeriod: 'Definitivo',
      aiSummary: 'Instituição de longa permanência precisando renovar 2 macas hidráulicas para enfermaria de acolhimento.',
      aiEnabled: true,
      lastInteraction: '2026-09-11T20:05:00Z',
      assignedTo: 'usr_vendedor',
      value: 4900.0,
      notes: 'Primeiro contato realizado agora via WhatsApp.',
      createdAt: '2026-09-11T20:01:00Z',
    },
  ],
  messages: [
    {
      id: 'msg_1',
      leadId: 'lead_101',
      from: 'client',
      type: 'text',
      content: 'Olá, boa tarde! Minha mãe vai ter alta amanhã do Hospital Vita e precisamos de uma cama hospitalar urgente para colocar no quarto dela. Vocês alugam e entregam aqui em Curitiba?',
      timestamp: '2026-09-11T18:40:10Z',
    },
    {
      id: 'msg_2',
      leadId: 'lead_101',
      from: 'ai',
      type: 'text',
      modelUsed: 'gemini-3.8-flash',
      content: 'Olá, Mariana! Sim, nós do Grupo YR Hospitalar fazemos locação com entrega e montagem rápida em toda Curitiba e Região Metropolitana! Fique tranquila que vamos organizar tudo para a alta da sua mãe. Ela precisará de elevação de cabeceira e pernas? Você já tem a indicação médica ou gostaria que eu sugerisse o modelo ideal?',
      timestamp: '2026-09-11T18:41:00Z',
    },
    {
      id: 'msg_3',
      leadId: 'lead_101',
      from: 'client',
      type: 'text',
      content: 'Sim, o médico pediu com elevação de cabeceira e grades de segurança porque ela operou o fêmur. Moro em Santa Felicidade, uma casa térrea.',
      timestamp: '2026-09-11T18:43:20Z',
    },
    {
      id: 'msg_4',
      leadId: 'lead_101',
      from: 'ai',
      type: 'text',
      modelUsed: 'gemini-3.8-flash',
      content: 'Perfeito! Para recuperação de cirurgia de fêmur e repouso seguro com grades, nossa Cama Hospitalar Articulada é a mais recomendada. Temos disponibilidade para entrega amanhã pela manhã em Santa Felicidade! O valor mensal fica em R$ 480,00 com montagem inclusa. Também recomendamos o colchão pneumático anti-escaras para maior conforto. Posso pedir para nossa equipe formalizar a reserva e o contrato agora?',
      timestamp: '2026-09-11T18:44:15Z',
    },
    {
      id: 'msg_5',
      leadId: 'lead_101',
      from: 'client',
      type: 'text',
      content: 'Nossa, perfeito! Quero sim com o colchão, por favor!',
      timestamp: '2026-09-11T18:45:00Z',
    },
  ],
  equipments: [
    {
      id: 'eq_001',
      serialNumber: 'YR-CMA-001',
      name: 'Cama hospitalar articulada',
      category: 'Camas',
      status: 'alugado', // disponivel | alugado | higienizacao | manutencao
      currentLeadId: 'lead_104',
      currentClientName: 'Carlos Alberto Gusmão',
      monthlyPrice: 480.0,
      salePrice: 3800.0,
      location: 'Cabral, Curitiba - PR',
      lastSanitized: '2026-09-04T08:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-892',
    },
    {
      id: 'eq_002',
      serialNumber: 'YR-CMA-002',
      name: 'Cama hospitalar articulada',
      category: 'Camas',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 480.0,
      salePrice: 3800.0,
      location: 'Galpão Principal YR (Pronta Entrega)',
      lastSanitized: '2026-09-10T15:30:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-904',
    },
    {
      id: 'eq_003',
      serialNumber: 'YR-CMA-003',
      name: 'Cama manual 3 movimentos',
      category: 'Camas',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 390.0,
      salePrice: 2900.0,
      location: 'Galpão Principal YR (Pronta Entrega)',
      lastSanitized: '2026-09-09T11:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-901',
    },
    {
      id: 'eq_004',
      serialNumber: 'YR-MC-001',
      name: 'Maca hidráulica',
      category: 'Macas',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 550.0,
      salePrice: 4900.0,
      location: 'Galpão Principal YR (Pronta Entrega)',
      lastSanitized: '2026-09-08T16:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-885',
    },
    {
      id: 'eq_005',
      serialNumber: 'YR-CR-001',
      name: 'Carrinho de emergência',
      category: 'Emergência',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 0,
      salePrice: 3400.0,
      location: 'Showroom YR',
      lastSanitized: '2026-09-05T14:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-871',
    },
    {
      id: 'eq_006',
      serialNumber: 'YR-BIO-001',
      name: 'Biombo hospitalar 3 faces',
      category: 'Mobiliário',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 120.0,
      salePrice: 780.0,
      location: 'Galpão Principal YR',
      lastSanitized: '2026-09-07T10:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-879',
    },
    {
      id: 'eq_007',
      serialNumber: 'YR-COL-001',
      name: 'Colchão Pneumático Anti-escaras (Motor 110/220V)',
      category: 'Acessórios',
      status: 'disponivel',
      currentLeadId: null,
      currentClientName: null,
      monthlyPrice: 120.0,
      salePrice: 650.0,
      location: 'Galpão Principal YR (Pronta Entrega)',
      lastSanitized: '2026-09-10T17:00:00Z',
      sanitizationCert: 'LAUDO-ANV-2026-905',
    },
  ],
  contracts: [
    {
      id: 'ctr_2026_001',
      number: 'CTR-2026-088',
      leadId: 'lead_104',
      clientName: 'Carlos Alberto Gusmão',
      clientCpf: '321.654.987-00',
      clientPhone: '5541984445566',
      address: 'Rua das Palmeiras, 340, Cabral, Curitiba - PR',
      type: 'locacao',
      equipmentIds: ['eq_001'],
      equipmentNames: 'Cama hospitalar articulada (Patrimônio YR-CMA-001)',
      startDate: '2026-09-05',
      endDate: '2026-10-05',
      monthlyValue: 480.0,
      status: 'assinado', // rascunho | pendente_assinatura | assinado | cancelado
      signedAt: '2026-09-04T18:22:15Z',
      signerIp: '187.56.12.94',
      signatureDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10,40 Q50,10 90,40 T170,25" fill="none" stroke="%230f172a" stroke-width="2.5"/></svg>',
      createdAt: '2026-09-04T16:00:00Z',
    },
    {
      id: 'ctr_2026_002',
      number: 'CTR-2026-089',
      leadId: 'lead_103',
      clientName: 'Beatriz Fontoura',
      clientCpf: '789.123.456-11',
      clientPhone: '5541977773344',
      address: 'Av. Cândido Hartmann, 1200, Champagnat, Curitiba - PR',
      type: 'locacao',
      equipmentIds: ['eq_003'],
      equipmentNames: 'Cama manual 3 movimentos (Patrimônio YR-CMA-003)',
      startDate: '2026-09-12',
      endDate: '2026-12-12',
      monthlyValue: 390.0,
      status: 'pendente_assinatura',
      signedAt: null,
      signerIp: null,
      signatureDataUrl: null,
      createdAt: '2026-09-11T19:00:00Z',
    },
  ],
  invoices: [
    {
      id: 'inv_001',
      contractNumber: 'CTR-2026-088',
      clientName: 'Carlos Alberto Gusmão',
      leadId: 'lead_104',
      amount: 480.0,
      dueDate: '2026-09-05',
      status: 'paga',
      paidAt: '2026-09-05T14:10:00Z',
    },
    {
      id: 'inv_002',
      contractNumber: 'CTR-2026-088',
      clientName: 'Carlos Alberto Gusmão',
      leadId: 'lead_104',
      amount: 480.0,
      dueDate: '2026-10-05',
      status: 'pendente',
      paidAt: null,
    },
    {
      id: 'inv_003',
      contractNumber: 'CTR-2026-089',
      clientName: 'Beatriz Fontoura',
      leadId: 'lead_103',
      amount: 390.0,
      dueDate: '2026-09-15',
      status: 'pendente',
      paidAt: null,
    },
    {
      id: 'inv_004',
      contractNumber: 'CTR-2026-085',
      clientName: 'Hospital São Lucas Curitiba',
      leadId: 'lead_101',
      amount: 1450.0,
      dueDate: '2026-09-02',
      status: 'paga',
      paidAt: '2026-09-02T10:30:00Z',
    },
    {
      id: 'inv_005',
      contractNumber: 'CTR-2026-086',
      clientName: 'Clínica Residencial Florence',
      leadId: 'lead_102',
      amount: 890.0,
      dueDate: '2026-08-28',
      status: 'atrasada',
      paidAt: null,
    },
    {
      id: 'inv_006',
      contractNumber: 'CTR-2026-087',
      clientName: 'Dr. Marcos Silveira - Home Care',
      leadId: 'lead_105',
      amount: 620.0,
      dueDate: '2026-09-10',
      status: 'paga',
      paidAt: '2026-09-10T11:00:00Z',
    },
    {
      id: 'inv_007',
      contractNumber: 'CTR-2026-090',
      clientName: 'Lar dos Idosos Esperança',
      leadId: 'lead_102',
      amount: 1200.0,
      dueDate: '2026-09-20',
      status: 'pendente',
      paidAt: null,
    },
    {
      id: 'inv_008',
      contractNumber: 'CTR-2026-091',
      clientName: 'Mariana Mendonça',
      leadId: 'lead_103',
      amount: 350.0,
      dueDate: '2026-09-25',
      status: 'pendente',
      paidAt: null,
    }
  ],
}

// O CRM inicia limpo. Mantemos somente o acesso administrativo necessário
// para a primeira entrada; clientes, equipamentos e movimentações são reais
// e devem ser cadastrados pela operação, nunca exemplos de demonstração.
const cleanSeedData = {
  ...initialData,
  users: initialData.users[0]?.passwordHash ? [initialData.users[0]] : [],
  leads: [],
  messages: [],
  equipments: [],
  contracts: [],
  invoices: [],
  calendarEvents: [],
  contractExpenses: [],
}

class Database {
  constructor() {
    this.pool = DATABASE_URL
      ? new Pool({
          connectionString: DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          max: 5,
        })
      : null
    this.writeQueue = Promise.resolve()
    this.data = this.load()
    this.ready = this.initializeRemote()
  }

  async initializeRemote() {
    if (!this.pool) return

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS crm_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS crm_records_collection_idx ON crm_records (collection);
      CREATE TABLE IF NOT EXISTS crm_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    const countResult = await this.pool.query('SELECT COUNT(*)::int AS count FROM crm_records')
    if (countResult.rows[0].count === 0) {
      await this.migrateLocalData()
    }

    const records = await this.pool.query('SELECT collection, id, data FROM crm_records')
    const remoteData = { ...this.data }
    for (const row of records.rows) {
      if (!remoteData[row.collection]) remoteData[row.collection] = []
      const index = remoteData[row.collection].findIndex((item) => item.id === row.id)
      if (index >= 0) remoteData[row.collection][index] = row.data
      else remoteData[row.collection].push(row.data)
    }

    const settings = await this.pool.query('SELECT data FROM crm_settings WHERE id = 1')
    if (settings.rows[0]) remoteData.settings = settings.rows[0].data
    this.data = remoteData
    console.log('[DB] PostgreSQL conectado e dados carregados com sucesso.')
  }

  async migrateLocalData() {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const [collection, items] of Object.entries(this.data)) {
        if (collection === 'settings') continue
        for (const item of items) {
          await client.query(
            `INSERT INTO crm_records (collection, id, data)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (collection, id) DO NOTHING`,
            [collection, item.id, JSON.stringify(item)],
          )
        }
      }
      await client.query(
        `INSERT INTO crm_settings (id, data)
         VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(this.data.settings)],
      )
      await client.query('COMMIT')
      console.log('[DB] crm_store.json migrado para PostgreSQL.')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  enqueue(task) {
    if (!this.pool) return
    this.writeQueue = this.writeQueue
      .then(() => this.ready)
      .then(task)
      .catch((error) => console.error('[DB] Erro ao persistir no PostgreSQL:', error.message))
  }

  persistRecord(collection, item) {
    this.enqueue(() => this.pool.query(
      `INSERT INTO crm_records (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection, id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [collection, item.id, JSON.stringify(item)],
    ))
  }

  persistDelete(collection, id) {
    this.enqueue(() => this.pool.query(
      'DELETE FROM crm_records WHERE collection = $1 AND id = $2',
      [collection, id],
    ))
  }

  persistSettings(settings) {
    this.enqueue(() => this.pool.query(
      `INSERT INTO crm_settings (id, data, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(settings)],
    ))
  }

  load() {
    // Quando há PostgreSQL, o Neon é a única fonte de dados. Não carregue o
    // antigo arquivo JSON de demonstração antes da migração inicial.
    if (this.pool) return structuredClone(cleanSeedData)

    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8')
        const stored = JSON.parse(raw)
        const hasLegacyDemoUsers = stored.users?.some((user) => (
          user.id === 'usr_vendedor' || user.id === 'usr_tecnico'
        ))
        if (hasLegacyDemoUsers) {
          this.save(cleanSeedData)
          return structuredClone(cleanSeedData)
        }
        return stored
      }
    } catch (e) {
      console.error('[DB] Erro ao carregar arquivo de dados, inicializando defaults:', e)
    }
    this.save(cleanSeedData)
    return cleanSeedData
  }

  save(data = this.data) {
    this.data = data
    if (this.pool) return true
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
      this.data = data
      return true
    } catch (e) {
      console.error('[DB] Erro ao salvar dados:', e)
      return false
    }
  }

  get(collection) {
    return this.data[collection] || []
  }

  find(collection, predicate) {
    const list = this.get(collection)
    return list.find(predicate)
  }

  filter(collection, predicate) {
    const list = this.get(collection)
    return list.filter(predicate)
  }

  insert(collection, item) {
    if (!this.data[collection]) this.data[collection] = []
    this.data[collection].unshift(item)
    this.save()
    this.persistRecord(collection, item)
    return item
  }

  update(collection, id, updates) {
    const list = this.get(collection)
    const index = list.findIndex(item => item.id === id)
    if (index === -1) return null
    list[index] = { ...list[index], ...updates, updatedAt: new Date().toISOString() }
    this.save()
    this.persistRecord(collection, list[index])
    return list[index]
  }

  delete(collection, id) {
    const list = this.get(collection)
    const filtered = list.filter(item => item.id !== id)
    this.data[collection] = filtered
    this.save()
    this.persistDelete(collection, id)
    return true
  }

  getSettings() {
    return this.data.settings
  }

  updateSettings(updates) {
    this.data.settings = { ...this.data.settings, ...updates }
    this.save()
    this.persistSettings(this.data.settings)
    return this.data.settings
  }
}

export const db = new Database()
