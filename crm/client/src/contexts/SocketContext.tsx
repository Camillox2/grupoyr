import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { WhatsAppStatus, WhatsAppHistorySync, Message, Lead, Contract } from '../types'
import { useAuth } from './AuthContext'
import { replaceHistorySnapshot } from '../lib/historySync'

interface SocketContextType {
  socket: Socket | null
  connected: boolean
  browserOnline: boolean
  serverReachable: boolean | null
  whatsappStatus: WhatsAppStatus
  historySyncByLead: Record<string, WhatsAppHistorySync>
  requestHistorySync: (leadId: string) => Promise<void>
  switchWhatsAppProvider: (provider: 'baileys' | 'meta') => Promise<void>
}

const defaultStatus: WhatsAppStatus = {
  provider: 'baileys',
  status: 'disconnected',
  connectedNumber: null,
  qrCode: null,
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  browserOnline: true,
  serverReachable: null,
  whatsappStatus: defaultStatus,
  historySyncByLead: {},
  requestHistorySync: async () => {},
  switchWhatsAppProvider: async () => {},
})

export const SocketProvider: React.FC<{
  children: React.ReactNode
  onNewMessage?: (msg: Message) => void
  onLeadUpdated?: (lead: Lead) => void
  onContractSigned?: (contract: Contract) => void
}> = ({ children, onNewMessage, onLeadUpdated, onContractSigned }) => {
  const { token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [serverReachable, setServerReachable] = useState<boolean | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>(defaultStatus)
  const [historySyncByLead, setHistorySyncByLead] = useState<Record<string, WhatsAppHistorySync>>({})

  useEffect(() => {
    if (!token) {
      setConnected(false)
      setSocket(null)
      setHistorySyncByLead({})
      return
    }
    let cancelled = false
    let refreshing = false
    let latestServerId: string | undefined
    const applyStatus = (status: WhatsAppStatus) => {
      if (cancelled) return
      const sameServer = latestServerId === status.instanceId
      latestServerId = status.instanceId
      setWhatsappStatus(status)
      if (status.historySync?.conversations) setHistorySyncByLead(current => replaceHistorySnapshot(current, status.historySync!.conversations!, sameServer, status.snapshotAt))
    }
    const refreshStatus = async () => {
      if (cancelled || refreshing || !navigator.onLine) return
      refreshing = true
      try {
        const response = await fetch('/api/whatsapp/status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (!response.ok) throw new Error('Status indisponível')
        const status: WhatsAppStatus = await response.json()
        if (!cancelled) { setServerReachable(true); applyStatus(status) }
      } catch { if (!cancelled) setServerReachable(false) }
      finally { refreshing = false }
    }
    const s = io(window.location.origin, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    })

    s.on('connect', () => {
      setConnected(true)
      setServerReachable(true)
      void refreshStatus()
      console.log('[Socket.io] Conectado ao servidor CRM')
    })

    s.on('disconnect', () => {
      setConnected(false)
      void refreshStatus()
    })

    s.on('whatsapp:status', (status: WhatsAppStatus) => {
      applyStatus(status)
    })

    s.on('whatsapp:history-sync', (job: WhatsAppHistorySync) => {
      setHistorySyncByLead(current => !current[job.leadId] || Date.parse(job.updatedAt) >= Date.parse(current[job.leadId].updatedAt) ? { ...current, [job.leadId]: job } : current)
    })

    s.on('message:new', (msg: Message) => {
      if (onNewMessage) onNewMessage(msg)
    })

    s.on('lead:updated', (lead: Lead) => {
      if (onLeadUpdated) onLeadUpdated(lead)
    })

    s.on('contract:signed', (contract: Contract) => {
      if (onContractSigned) onContractSigned(contract)
    })

    setSocket(s)
    const reconnect = () => { setBrowserOnline(true); s.connect(); void refreshStatus() }
    const offline = () => { setBrowserOnline(false); setServerReachable(false) }
    const visible = () => { if (document.visibilityState === 'visible') { s.connect(); void refreshStatus() } }
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('focus', visible)
    const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshStatus() }, 10000)
    void refreshStatus()

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('focus', visible)
      s.disconnect()
    }
  }, [token])

  const requestHistorySync = async (leadId: string) => {
    let response: Response
    try {
      response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/messages/sync`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
        signal: AbortSignal.timeout(15000),
      })
    } catch { throw new Error('A conexão com o CRM caiu. Ao voltar, o estado da solicitação será atualizado automaticamente.') }
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o histórico.')
    if (result.sync) setHistorySyncByLead(current => {
      const previous = current[leadId]
      // Um evento do socket pode chegar antes da resposta HTTP inicial.
      return previous && Date.parse(previous.updatedAt) > Date.parse(result.sync.updatedAt)
        ? current : { ...current, [leadId]: result.sync }
    })
  }

  const switchWhatsAppProvider = async (provider: 'baileys' | 'meta') => {
    const token = localStorage.getItem('yr_crm_token')
    try {
      const res = await fetch('/api/whatsapp/switch-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider }),
      })
      if (res.ok) {
        const data = await res.json()
        setWhatsappStatus((prev) => ({ ...prev, provider: data.provider, status: data.status }))
      }
    } catch (e) {
      console.error('[WhatsApp Switch] Erro ao alternar provedor:', e)
    }
  }

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        browserOnline,
        serverReachable,
        whatsappStatus,
        historySyncByLead,
        requestHistorySync,
        switchWhatsAppProvider,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
