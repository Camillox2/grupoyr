import React, { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft,
  Send,
  Bot,
  Sparkles,
  CheckCheck,
  FileSignature,
  Search,
  MessageSquare as MessageSquareIcon,
  Paperclip,
  Mic,
  Square,
  X,
  UserRoundPlus,
  Archive,
  ArchiveRestore,
  Hourglass,
  LockKeyhole,
  CircleAlert,
  Check,
  MessageSquareDashed,
} from 'lucide-react'
import { Lead, Message } from '../types'
import { useSocket } from '../contexts/SocketContext'
import { useIsMobile, useMediaQuery } from '../hooks/useMediaQuery'
import { authHeaders, isClosed, windowInfo } from '../lib/conversation'
import { LeadSheet } from './LeadSheet'
import { NewContactModal } from './NewContactModal'
import { SendTemplateModal } from './SendTemplateModal'

interface WhatsAppChatViewProps {
  leads: Lead[]
  selectedLead: Lead | null
  onSelectLead: (lead: Lead | null) => void
  onOpenNewContract: (lead: Lead) => void
  /** Chamado quando a ficha gera o contrato. */
  onContractCreated?: () => void
}

export const WhatsAppChatView: React.FC<WhatsAppChatViewProps> = ({
  leads,
  selectedLead,
  onSelectLead,
  onOpenNewContract,
  onContractCreated,
}) => {
  const isMobile = useIsMobile()
  // Em tela larga a ficha e uma coluna fixa; abaixo disso ela abre por cima.
  const isWide = useMediaQuery('(min-width: 1280px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const { whatsappStatus, socket } = useSocket()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [listTab, setListTab] = useState<'open' | 'closed'>('open')
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  // Relogio da janela de 24h: um tique por minuto basta para o contador.
  const [now, setNow] = useState(() => Date.now())
  // Lead para o qual o SERVIDOR ja respondeu que a janela fechou.
  const [serverClosedFor, setServerClosedFor] = useState<string | null>(null)

  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'
  const isMeta = whatsappStatus.provider === 'meta'

  // `selectedLead` e uma copia guardada no App e nao recebe os eventos do
  // socket. O estado vivo (encerrada, ultima mensagem do cliente) sai da lista.
  const selectedLeadId = selectedLead?.id
  const liveLead = (selectedLeadId && leads.find((lead) => lead.id === selectedLeadId)) || selectedLead
  const conversationClosed = liveLead ? isClosed(liveLead) : false
  const windowState = windowInfo(liveLead, now)
  // Texto livre so e barrado na API oficial: o Baileys nao tem janela.
  const windowBlocked = isMeta && (!windowState.open || serverClosedFor === selectedLeadId)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedLead) {
      setMessages([])
      setSelectedFile(null)
      setAiEnabled(selectedLead.aiEnabled)
      setAiSummary(null)
      setSendError(null)
      setNow(Date.now())
      fetch(`/api/leads/${selectedLead.id}/messages`, { headers: authHeaders(false) })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMessages(data))
        .catch(() => {})
    }
    // So o id: trocar o OBJETO do mesmo lead nao pode zerar a conversa aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId])

  useEffect(() => {
    if (!socket || !selectedLeadId) return

    const appendLiveMessage = (message: Message) => {
      if (message.leadId !== selectedLeadId) return
      setMessages((current) => (
        current.some((item) => item.id === message.id) ? current : [...current, message]
      ))
      // Mensagem do cliente renova a janela: o contador ja sai certo.
      setNow(Date.now())
      if (message.from === 'client') setServerClosedFor(null)
    }
    // Status de entrega que a Meta manda depois (entregue, lida, falhou).
    const updateLiveMessage = (message: Message) => {
      if (message.leadId !== selectedLeadId) return
      setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, ...message } : item)))
    }

    socket.on('message:new', appendLiveMessage)
    socket.on('message:updated', updateLiveMessage)
    return () => {
      socket.off('message:new', appendLiveMessage)
      socket.off('message:updated', updateLiveMessage)
    }
  }, [socket, selectedLeadId])

  useEffect(() => {
    // Rola SO a lista de mensagens. scrollIntoView rola todos os ancestrais
    // rolaveis, inclusive a pagina: a tela inteira subia e voltava ao abrir.
    const list = messagesEndRef.current?.parentElement
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSelectedFile(file)
    setSendError(null)
  }

  const handleToggleRecording = async () => {
    if (recording) {
      audioRecorderRef.current?.stop()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSendError('Este navegador não permite gravação de áudio. Selecione um arquivo de áudio.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('ogg') ? 'ogg' : 'webm'
        setSelectedFile(new File([blob], `audio-yr-${Date.now()}.${extension}`, { type: blob.type }))
        stream.getTracks().forEach((track) => track.stop())
        audioRecorderRef.current = null
        setRecording(false)
      }
      recorder.start()
      audioRecorderRef.current = recorder
      setSendError(null)
      setRecording(true)
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      setSendError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if ((!inputText.trim() && !selectedFile) || !selectedLead || !isConnected || loading || recording) return

    const textToSend = inputText
    const fileToSend = selectedFile
    setInputText('')
    setLoading(true)
    setSendError(null)

    try {
      const token = localStorage.getItem('yr_crm_token') || ''
      let res: Response
      if (fileToSend) {
        const formData = new FormData()
        formData.append('leadId', selectedLead.id)
        formData.append('caption', textToSend)
        formData.append('file', fileToSend)
        res = await fetch('/api/whatsapp/send-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
      } else {
        res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ leadId: selectedLead.id, text: textToSend }),
        })
      }
      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => (prev.some((item) => item.id === data.message.id) ? prev : [...prev, data.message]))
        setSelectedFile(null)
      } else {
        const data = await res.json().catch(() => null)
        setInputText(textToSend)
        setSendError(data?.error || 'Não foi possível enviar. Confira a conexão do WhatsApp e tente novamente.')
        // O relogio do navegador pode estar adiantado/atrasado: quem decide a
        // janela e o servidor. Se ele disse que fechou, a tela acompanha.
        if (data?.code === 'window_closed') setServerClosedFor(selectedLead.id)
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      setInputText(textToSend)
      setSendError('Falha de comunicação com o atendimento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const openCount = leads.filter((lead) => !isClosed(lead)).length
  const closedCount = leads.length - openCount

  const filteredLeads = leads.filter((lead) => {
    const term = contactSearch.trim().toLowerCase()
    // Buscando, procura nas duas abas: ninguem lembra se ja encerrou.
    if (!term) return isClosed(lead) === (listTab === 'closed')
    return [lead.name, lead.phone, lead.equipmentInterest, lead.origin]
      .join(' ')
      .toLowerCase()
      .includes(term)
  })

  const handleConversationStatus = async (status: 'open' | 'closed') => {
    if (!liveLead || closing) return
    setClosing(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/leads/${liveLead.id}/conversation`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSendError(data?.error || 'Não foi possível alterar a conversa.')
        return
      }
      // A lista se atualiza pelo socket (lead:updated). Ao encerrar, sai da
      // conversa: ela acabou de deixar a aba em que o usuario esta.
      if (status === 'closed') onSelectLead(null)
      else setListTab('open')
    } catch {
      setSendError('Falha de comunicação com o servidor.')
    } finally {
      setClosing(false)
    }
  }

  const handleToggleAi = async () => {
    if (!selectedLead) return
    const newState = !aiEnabled
    setAiEnabled(newState)
    try {
      await fetch(`/api/leads/${selectedLead.id}/toggle-ai`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({ enabled: newState }),
      })
    } catch (e) {
      console.error('Erro ao alterar status da IA:', e)
    }
  }

  const handleGenerateSummary = async () => {
    if (!selectedLead) return
    setGeneratingSummary(true)
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/ai-summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setAiSummary(data.summary)
      }
    } catch (e) {
      console.error('Erro ao gerar resumo com IA:', e)
    } finally {
      setGeneratingSummary(false)
    }
  }

  return (
    // `dvh` no lugar de `vh`: a barra do Chrome mobile nao corta o campo de envio.
    // No mobile mostra a LISTA ou a CONVERSA, nunca as duas com scroll aninhado.
    <div
      className={`no-cascade flex h-[calc(100dvh-112px)] min-h-[420px] overflow-hidden rounded-[16px] ${isMobile ? 'flex-col' : 'flex-row'}`}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Lista de conversas */}
      <div
        className={`min-h-0 flex-col ${
          isMobile
            ? selectedLead
              ? 'hidden'
              : 'flex w-full flex-1'
            : 'flex w-80 flex-none'
        }`}
        style={{ background: 'var(--surface-sunken)' }}
      >
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Conversas</h3>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                via {isMeta ? 'API oficial da Meta' : 'Baileys Web'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewContactOpen(true)}
              className="action-btn action-btn--primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-extrabold"
              title={isMeta ? 'Adicionar contato e enviar um template' : 'Adicionar contato'}
            >
              <UserRoundPlus className="h-3.5 w-3.5" />
              Novo contato
            </button>
          </div>
          {/* Abertas x encerradas. O polegar desliza; o tamanho nunca muda. */}
          <div className="chat-tabs" role="tablist" aria-label="Filtrar conversas" data-tab={listTab}>
            <span className="chat-tabs-thumb" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={listTab === 'open'} onClick={() => setListTab('open')}>
              Abertas <span className="tnum">{openCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={listTab === 'closed'} onClick={() => setListTab('closed')}>
              Encerradas <span className="tnum">{closedCount}</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Buscar conversa ou telefone"
              aria-label="Buscar conversa ou telefone"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain" style={{ borderColor: 'var(--border-subtle)' }}>
          {filteredLeads.length === 0 ? (
            <div className="p-6 text-center">
              <Search className="w-5 h-5 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {contactSearch.trim() ? 'Nenhuma conversa encontrada' : listTab === 'closed' ? 'Nenhuma conversa encerrada' : 'Nenhuma conversa aberta'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {contactSearch.trim() ? 'Tente outro nome ou telefone.' : listTab === 'closed' ? 'O que você encerrar fica guardado aqui.' : 'Adicione um contato para começar.'}
              </p>
            </div>
          ) : filteredLeads.map((lead) => {
            const isSelected = selectedLead?.id === lead.id
            return (
              <div
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className={`p-3.5 cursor-pointer transition-colors flex items-start gap-3 ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-slate-800 border-l-4 border-blue-600'
                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center shrink-0 text-xs">
                  {lead.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {lead.name}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {new Date(lead.lastInteraction).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {lead.equipmentInterest} • R$ {lead.value.toFixed(0)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {lead.origin}
                    </span>
                    {lead.aiEnabled && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center gap-0.5">
                        <Bot className="w-2.5 h-2.5" /> IA Ativa
                      </span>
                    )}
                    {isClosed(lead) ? (
                      <span className="chat-flag" data-tone="neutral"><Archive className="h-2.5 w-2.5" /> Encerrada</span>
                    ) : isMeta && !windowInfo(lead, now).open ? (
                      <span className="chat-flag" data-tone="wait" title="Janela de 24h fechada: só template"><LockKeyhole className="h-2.5 w-2.5" /> 24h</span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Chat Thread Area */}
      {selectedLead ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Cabecalho da conversa */}
          <div
            className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              {/* Volta para a lista no mobile. */}
              {isMobile && (
                <button
                  onClick={() => onSelectLead(null)}
                  aria-label="Voltar para a lista de conversas"
                  className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-[8px]"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-xs">
                {selectedLead.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedLead.name}
                  <span className="text-[10px] font-mono font-medium text-slate-500">
                    +{selectedLead.phone}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Interesse: <span className="font-semibold">{selectedLead.equipmentInterest}</span> ({selectedLead.modality === 'locacao' ? 'locação' : 'compra'})
                </p>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex flex-wrap items-center gap-2">
              {isMeta && !conversationClosed && (
                <span
                  className="chat-window"
                  data-tone={windowBlocked ? 'wait' : windowState.closingSoon ? 'alert' : 'ok'}
                  title="A Meta só aceita texto livre até 24h depois da última mensagem do cliente"
                >
                  {windowBlocked ? <LockKeyhole className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
                  {windowBlocked
                    ? windowState.neverOpened ? 'Sem janela: só template' : 'Janela de 24h fechada'
                    : `Janela fecha em ${windowState.remaining}`}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleConversationStatus(conversationClosed ? 'open' : 'closed')}
                disabled={closing}
                className="action-btn action-btn--ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-50"
                title={conversationClosed ? 'Trazer de volta para as conversas abertas' : 'Encerrar: a conversa sai das abertas e volta sozinha se o cliente escrever'}
              >
                {conversationClosed ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                {conversationClosed ? 'Reabrir' : 'Encerrar'}
              </button>
              <button
                onClick={handleToggleAi}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  aiEnabled
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
                title="Pausar ou ativar respostas automáticas da IA para este lead"
              >
                <Bot className="w-3.5 h-3.5" />
                {aiEnabled ? 'IA Respondendo' : 'IA Pausada'}
              </button>

              {!isWide && (
                <button
                  onClick={() => setSheetOpen(true)}
                  className="action-btn action-btn--primary inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold"
                  title="Abrir a ficha de fechamento deste cliente"
                >
                  <FileSignature className="w-3.5 h-3.5" />
                  Ficha
                </button>
              )}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5" style={{ background: 'var(--surface-canvas)' }}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                  <MessageSquareIcon />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Nenhuma mensagem registrada</p>
                <p className="mt-1 max-w-xs text-[11px] leading-4 text-slate-400">Inicie o atendimento ou aguarde uma nova mensagem deste contato.</p>
              </div>
            ) : messages.map((msg) => {
              const isClient = msg.from === 'client'
              const isAi = msg.from === 'ai'

              // Aviso do sistema: uma linha no meio, sem balao.
              if (msg.from === 'system') {
                return (
                  <div key={msg.id} className="chat-system">
                    <span>
                      {msg.content}
                      <time className="tnum">
                        {new Date(msg.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-lg p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      isClient
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/80 dark:border-slate-700'
                        : isAi
                        ? 'bg-blue-100 text-slate-900 border border-blue-200 rounded-tr-none dark:bg-blue-900 dark:text-white dark:border-blue-800'
                        : 'bg-slate-900 text-white rounded-tr-none dark:bg-blue-600'
                    }`}
                  >
                    {/* Header for AI response */}
                    {isAi && (
                      <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-blue-200 text-[10px] font-extrabold text-blue-700 dark:border-white/20 dark:text-blue-200">
                        <Bot className="w-3 h-3" />
                        <span>Assistente YR ({msg.modelUsed || 'gemini-3.8-flash'})</span>
                      </div>
                    )}

                    {msg.type === 'template' && (
                      <div className="mb-1 flex items-center gap-1.5 border-b border-white/20 pb-1 text-[10px] font-extrabold text-white/80">
                        <MessageSquareDashed className="h-3 w-3" />
                        <span>Template{msg.templateName ? `: ${msg.templateName}` : ''}</span>
                      </div>
                    )}

                    {/* Content */}
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Timestamp & checks */}
                    <div
                      className={`text-[9px] mt-1.5 flex items-center justify-end gap-1 ${
                        isClient ? 'text-slate-400' : 'text-white/70'
                      }`}
                    >
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!isClient && (msg.deliveryStatus === 'pending_connection' ? (
                        <span className="font-semibold">Aguardando conexão</span>
                      ) : msg.deliveryStatus === 'failed' ? (
                        <span className="inline-flex items-center gap-1 font-extrabold text-rose-200"><CircleAlert className="h-3 w-3" /> Não entregue</span>
                      ) : msg.deliveryStatus === 'read' ? (
                        <CheckCheck className="w-3 h-3 text-sky-300" aria-label="Lida" />
                      ) : msg.deliveryStatus === 'delivered' ? (
                        <CheckCheck className="w-3 h-3" aria-label="Entregue" />
                      ) : msg.type === 'template' ? (
                        <Check className="w-3 h-3" aria-label="Enviada" />
                      ) : (
                        <CheckCheck className="w-3 h-3" />
                      ))}
                    </div>
                  </div>
                  {msg.deliveryStatus === 'failed' && msg.deliveryError && (
                    <p className="mt-1 max-w-lg text-right text-[10.5px] font-semibold" style={{ color: 'var(--alert)' }}>{msg.deliveryError}</p>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Conversa encerrada ou janela fechada: o campo de texto da lugar a
              uma faixa que explica o porque e oferece o unico caminho valido. */}
          {conversationClosed ? (
            <div className="chat-gate" data-tone="neutral">
              <Archive className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">
                <strong>Conversa encerrada.</strong> Ela volta sozinha para as abertas se o cliente escrever.
              </p>
              <button type="button" onClick={() => handleConversationStatus('open')} disabled={closing} className="action-btn action-btn--primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-extrabold disabled:opacity-50">
                <ArchiveRestore className="h-3.5 w-3.5" />
                Reabrir
              </button>
            </div>
          ) : windowBlocked ? (
            <div className="chat-gate" data-tone="wait">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">
                <strong>{windowState.neverOpened ? 'Este contato ainda não escreveu.' : 'A janela de 24h fechou.'}</strong> Pela regra da Meta, agora só dá para falar com um template aprovado. Quando o cliente responder, o texto livre volta.
              </p>
              <button type="button" onClick={() => setTemplateOpen(true)} className="action-btn action-btn--primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-extrabold">
                <MessageSquareDashed className="h-3.5 w-3.5" />
                Enviar template
              </button>
            </div>
          ) : (
          <form
            onSubmit={handleSendMessage}
            className="relative p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={handleFileSelection}
              className="hidden"
            />
            {selectedFile && (
              <div className="absolute -translate-y-14 left-3 right-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[11px] text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                <span className="truncate font-semibold">Anexo: {selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="shrink-0 rounded-lg p-1 text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/60"
                  aria-label="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="hidden xl:flex items-center gap-1 mr-1">
              {['Olá, posso ajudar?', 'Enviar proposta', 'Confirmar endereço'].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInputText(suggestion)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-500 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 whitespace-nowrap"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected || loading || recording}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Anexar imagem, áudio ou documento (até 10 MB)"
              aria-label="Anexar arquivo"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleRecording}
              disabled={!isConnected || loading || Boolean(selectedFile)}
              className={`p-2.5 rounded-xl border disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
                recording
                  ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300 hover:text-blue-600'
              }`}
              title={recording ? 'Parar gravação' : 'Gravar áudio'}
              aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              type="text"
              placeholder={
                isConnected
                  ? 'Digite sua mensagem para o cliente...'
                  : 'WhatsApp offline. Conecte pelo botão superior para disparar.'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              aria-label="Mensagem para o cliente"
              className="flex-1 px-4 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={(!inputText.trim() && !selectedFile) || !isConnected || loading || recording}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-md shadow-blue-500/20 transition-all shrink-0"
              title="Enviar Mensagem"
            >
              {loading ? <span className="block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          )}
          {sendError && (
            <p className="px-4 pb-3 text-[11px] font-medium text-rose-600 dark:text-rose-300" role="alert">
              {sendError}
            </p>
          )}
        </div>
      ) : isMobile ? null : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 p-8 text-center">
          <Bot className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Selecione uma conversa
          </h3>
          <p className="text-xs max-w-sm mt-1">
            Escolha um lead na barra lateral para ver o histórico do WhatsApp, intervir nas respostas da IA ou emitir contratos.
          </p>
        </div>
      )}

      <NewContactModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        provider={isMeta ? 'meta' : 'baileys'}
        onCreated={(lead) => {
          setListTab(isClosed(lead) ? 'closed' : 'open')
          setContactSearch('')
          onSelectLead(lead)
        }}
      />
      {liveLead && (
        <SendTemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} lead={liveLead} />
      )}

      {/* Ficha de fechamento: coluna fixa em tela larga, painel por cima nas demais */}
      {selectedLead && isWide && (
        <LeadSheet
          lead={selectedLead}
          aiSummary={aiSummary}
          generatingSummary={generatingSummary}
          onGenerateSummary={handleGenerateSummary}
          onContractCreated={onContractCreated}
        />
      )}
      {selectedLead && !isWide && sheetOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
          <div className="backdrop-in absolute inset-0 bg-[#0a1c33]/60" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="sheet-drawer relative z-10 h-full w-full max-w-[460px]">
            <LeadSheet
              lead={selectedLead}
              aiSummary={aiSummary}
              generatingSummary={generatingSummary}
              onGenerateSummary={handleGenerateSummary}
              onContractCreated={onContractCreated}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
