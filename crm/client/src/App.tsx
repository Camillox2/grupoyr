import React, { useState, useEffect } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import { useSocket } from './contexts/SocketContext'
import { Navbar } from './components/Navbar'
import { Sidebar, TabType } from './components/Sidebar'
import { DashboardView } from './components/DashboardView'
import { KanbanView } from './components/KanbanView'
import { WhatsAppChatView } from './components/WhatsAppChatView'
import { EquipmentsView } from './components/EquipmentsView'
import { ContractsView } from './components/ContractsView'
import { FinanceView } from './components/FinanceView'
import { BlogManagerView } from './components/BlogManagerView'
import { SettingsView } from './components/SettingsView'
import { LoginView } from './components/LoginView'
import { QrModal } from './components/QrModal'
import { NewLeadModal } from './components/NewLeadModal'
import { NewContractModal } from './components/NewContractModal'
import { NewEquipmentModal } from './components/NewEquipmentModal'
import { PublicContractSigningView } from './components/PublicContractSigningView'
import { Lead, Equipment, Contract, Invoice, Stage } from './types'

function MainContent() {
  const { user, loading } = useAuth()
  const { socket } = useSocket()
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [newLeadModalOpen, setNewLeadModalOpen] = useState(false)
  const [newContractModalOpen, setNewContractModalOpen] = useState(false)
  const [newEquipmentModalOpen, setNewEquipmentModalOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [contractLead, setContractLead] = useState<Lead | null>(null)

  const fetchAllData = async () => {
    const token = localStorage.getItem('yr_crm_token') || ''
    const headers = { Authorization: `Bearer ${token}` }
    setDataLoading(true)
    setDataError(null)

    try {
      const readCollection = async (url: string) => {
        const response = await fetch(url, { headers })
        if (!response.ok) throw new Error(`Falha ao consultar ${url}`)
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error(`Resposta inválida de ${url}`)
        return data
      }

      const results = await Promise.allSettled([
        readCollection('/api/leads'),
        readCollection('/api/equipments'),
        readCollection('/api/contracts'),
        readCollection('/api/finance/invoices'),
      ])

      const failedCollections: string[] = []
      const readResult = (result: PromiseSettledResult<unknown>, fallback: unknown[], label: string) => {
        if (result.status === 'fulfilled') return result.value
        failedCollections.push(label)
        return fallback
      }

      const [leadsResult, equipmentsResult, contractsResult, invoicesResult] = results
      const nextLeads = readResult(leadsResult, leads, 'leads') as Lead[]
      const nextEquipments = readResult(equipmentsResult, equipments, 'equipamentos') as Equipment[]
      const nextContracts = readResult(contractsResult, contracts, 'contratos') as Contract[]
      const nextInvoices = readResult(invoicesResult, invoices, 'financeiro') as Invoice[]

      setLeads(nextLeads)
      setEquipments(nextEquipments)
      setContracts(nextContracts)
      setInvoices(nextInvoices)
      setSelectedLead((current) => current || nextLeads[0] || null)
      if (failedCollections.length > 0) {
        setDataError(`Não foi possível atualizar: ${failedCollections.join(', ')}. Tente novamente.`)
      }
    } catch {
      setDataError('Não foi possível atualizar os dados da operação. Tente novamente.')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchAllData()
    }
  }, [user])

  useEffect(() => {
    if (!socket) return

    const updateLeadInMemory = (lead: Lead) => {
      setLeads((current) => {
        const exists = current.some((item) => item.id === lead.id)
        return exists
          ? current.map((item) => (item.id === lead.id ? { ...item, ...lead } : item))
          : [lead, ...current]
      })
    }

    socket.on('lead:updated', updateLeadInMemory)
    return () => {
      socket.off('lead:updated', updateLeadInMemory)
    }
  }, [socket])

  const handleUpdateLeadStage = async (leadId: string, newStage: Stage) => {
    const previousStage = leads.find((lead) => lead.id === leadId)?.stage
    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    )

    try {
      await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({ stage: newStage }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Falha ao atualizar etapa (${response.status})`)
      })
    } catch (e) {
      console.error('Erro ao atualizar estágio do lead:', e)
      if (previousStage) {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, stage: previousStage } : lead))
        )
      }
    }
  }

  const handleOpenNewContract = (lead: Lead) => {
    setContractLead(lead)
    setNewContractModalOpen(true)
  }

  const pendingContractsCount = contracts.filter((c) => c.status === 'pendente_assinatura').length

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4 text-slate-600 font-sans">
        <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
          <img
            src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
            alt="Grupo YR Hospitalar"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#123b63] rounded-full animate-spin" />
          <span>Carregando CRM Grupo YR Hospitalar</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginView />
  }

  if (dataLoading && leads.length === 0 && equipments.length === 0 && invoices.length === 0) {
    return (
      <div className="min-h-screen bg-[#eef4fa] dark:bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300 font-sans">
        <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
          <img
            src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
            alt="Grupo YR Hospitalar"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#123b63] rounded-full animate-spin" />
          <span>Carregando dados da operação</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#eef4fa] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar
        onOpenQr={() => setQrModalOpen(true)}
        onToggleMobileMenu={() => setMobileSidebarOpen((prev) => !prev)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unreadCount={leads.length}
          pendingContractsCount={pendingContractsCount}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 transition-all">
          <div className="max-w-7xl mx-auto">
            {dataError && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <span>{dataError}</span>
                <button
                  type="button"
                  onClick={fetchAllData}
                  disabled={dataLoading}
                  className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800 disabled:opacity-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                >
                  {dataLoading ? 'Atualizando...' : 'Tentar novamente'}
                </button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                leads={leads}
                equipments={equipments}
                invoices={invoices}
                onSelectLead={(lead) => {
                  setSelectedLead(lead)
                  setActiveTab('whatsapp')
                }}
                onNavigateTab={setActiveTab}
                onOpenNewLead={() => setNewLeadModalOpen(true)}
                onOpenNewContract={() => {
                  setContractLead(leads[0] || null)
                  setNewContractModalOpen(true)
                }}
                onOpenNewEquipment={() => setNewEquipmentModalOpen(true)}
                onOpenQr={() => setQrModalOpen(true)}
              />
            )}

            {activeTab === 'kanban' && (
              <KanbanView
                leads={leads}
                onUpdateLeadStage={handleUpdateLeadStage}
                onSelectLead={(lead) => {
                  setSelectedLead(lead)
                  setActiveTab('whatsapp')
                }}
                onOpenNewContract={handleOpenNewContract}
                onOpenNewLeadModal={() => setNewLeadModalOpen(true)}
              />
            )}

            {activeTab === 'whatsapp' && (
              <WhatsAppChatView
                leads={leads}
                selectedLead={selectedLead}
                onSelectLead={setSelectedLead}
                onOpenNewContract={handleOpenNewContract}
              />
            )}

            {activeTab === 'equipments' && (
              <EquipmentsView
                equipments={equipments}
                onRefreshEquipments={fetchAllData}
              />
            )}

            {activeTab === 'contracts' && (
              <ContractsView
                contracts={contracts}
                leads={leads}
                equipments={equipments}
                onRefreshContracts={fetchAllData}
                onOpenNewContractModal={() => {
                  setContractLead(leads[0] || null)
                  setNewContractModalOpen(true)
                }}
              />
            )}

            {activeTab === 'finance' && (
              <FinanceView invoices={invoices} leads={leads} onRefreshInvoices={fetchAllData} />
            )}

            {activeTab === 'blog' && <BlogManagerView />}

            {activeTab === 'settings' && (
              <SettingsView onOpenQr={() => setQrModalOpen(true)} />
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <QrModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />
      <NewLeadModal
        open={newLeadModalOpen}
        onClose={() => setNewLeadModalOpen(false)}
        onSuccess={fetchAllData}
      />
      <NewEquipmentModal
        open={newEquipmentModalOpen}
        onClose={() => setNewEquipmentModalOpen(false)}
        onSuccess={fetchAllData}
      />
      <NewContractModal
        open={newContractModalOpen}
        onClose={() => setNewContractModalOpen(false)}
        lead={contractLead}
        leads={leads}
        equipments={equipments}
        onSuccess={fetchAllData}
      />
    </div>
  )
}

export default function App() {
  const publicSigningMatch = window.location.pathname.match(/^\/assinar\/([^/]+)\/?$/)
  if (publicSigningMatch) {
    return <PublicContractSigningView token={decodeURIComponent(publicSigningMatch[1])} />
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <MainContent />
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
