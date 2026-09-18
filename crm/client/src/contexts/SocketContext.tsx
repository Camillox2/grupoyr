import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { WhatsAppStatus, Message, Lead, Contract } from '../types'

interface SocketContextType {
  socket: Socket | null
  connected: boolean
  whatsappStatus: WhatsAppStatus
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
  whatsappStatus: defaultStatus,
  switchWhatsAppProvider: async () => {},
})

export const SocketProvider: React.FC<{
  children: React.ReactNode
  onNewMessage?: (msg: Message) => void
  onLeadUpdated?: (lead: Lead) => void
  onContractSigned?: (contract: Contract) => void
}> = ({ children, onNewMessage, onLeadUpdated, onContractSigned }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>(defaultStatus)

  useEffect(() => {
    const s = io(window.location.origin, {
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })

    s.on('connect', () => {
      setConnected(true)
      console.log('[Socket.io] Conectado ao servidor CRM')
    })

    s.on('disconnect', () => {
      setConnected(false)
    })

    s.on('whatsapp:status', (status: WhatsAppStatus) => {
      setWhatsappStatus(status)
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

    return () => {
      s.disconnect()
    }
  }, [])

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
        whatsappStatus,
        switchWhatsAppProvider,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
