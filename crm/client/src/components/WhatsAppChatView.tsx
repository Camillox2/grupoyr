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
} from 'lucide-react'
import { Lead, Message } from '../types'
import { useSocket } from '../contexts/SocketContext'
import { useIsMobile } from '../hooks/useMediaQuery'

interface WhatsAppChatViewProps {
  leads: Lead[]
  selectedLead: Lead | null
  onSelectLead: (lead: Lead | null) => void
  onOpenNewContract: (lead: Lead) => void
}

export const WhatsAppChatView: React.FC<WhatsAppChatViewProps> = ({
  leads,
  selectedLead,
  onSelectLead,
  onOpenNewContract,
}) => {
  const isMobile = useIsMobile()
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

  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'

  useEffect(() => {
    if (selectedLead) {
      setMessages([])
      setSelectedFile(null)
      setAiEnabled(selectedLead.aiEnabled)
      setAiSummary(null)
      const token = localStorage.getItem('yr_crm_token') || ''
      fetch(`/api/leads/${selectedLead.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMessages(data))
        .catch(() => {})
    }
  }, [selectedLead])

  useEffect(() => {
    if (!socket || !selectedLead) return
    const selectedLeadId = selectedLead.id

    const appendLiveMessage = (message: Message) => {
      if (message.leadId !== selectedLeadId) return
      setMessages((current) => (
        current.some((item) => item.id === message.id) ? current : [...current, message]
      ))
    }

    socket.on('message:new', appendLiveMessage)
    return () => {
      socket.off('message:new', appendLiveMessage)
    }
  }, [socket, selectedLead])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      setInputText(textToSend)
      setSendError('Falha de comunicação com o atendimento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const term = contactSearch.trim().toLowerCase()
    if (!term) return true
    return [lead.name, lead.phone, lead.equipmentInterest, lead.origin]
      .join(' ')
      .toLowerCase()
      .includes(term)
  })

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
      className={`flex h-[calc(100dvh-112px)] sm:h-[calc(100dvh-150px)] min-h-[420px] overflow-hidden rounded-[14px] ${isMobile ? 'flex-col' : 'flex-row'}`}
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
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Conversas WhatsApp ({leads.length})
            </h3>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full whitespace-nowrap">
              {whatsappStatus.provider === 'baileys' ? 'Baileys Web' : 'Meta Cloud'}
            </span>
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
              <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Nenhuma conversa encontrada</p>
              <p className="mt-1 text-[11px] text-slate-400">Tente outro nome ou telefone.</p>
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
            <div className="flex items-center gap-2">
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

              <button
                onClick={() => onOpenNewContract(selectedLead)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 flex items-center gap-1.5 transition-all"
                title="Gerar contrato de locação ou venda agora"
              >
                <FileSignature className="w-3.5 h-3.5" />
                Gerar Contrato
              </button>
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
                      ) : (
                        <CheckCheck className="w-3 h-3" />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
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

      {/* Right Drawer: AI Qualification Dossier */}
      {selectedLead && (
        <div className="hidden min-h-0 w-80 shrink-0 flex-col justify-between overflow-y-auto p-4 xl:flex" style={{ background: 'var(--surface-sunken)', borderLeft: '1px solid var(--border-subtle)' }}>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Dossiê de Qualificação IA
              </h4>
              <button
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                title="Atualizar síntese com IA agora"
              >
                {generatingSummary ? 'Gerando...' : 'Atualizar'}
              </button>
            </div>

            {/* AI Summary Box */}
            <div className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/60 text-xs text-purple-950 dark:text-purple-100 leading-relaxed space-y-2">
              <p className="font-semibold text-[11px] text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                Síntese do Caso:
              </p>
              <p className="whitespace-pre-wrap">{(aiSummary ?? selectedLead.aiSummary) || 'Ainda sem resumo. Clique em Atualizar para analisar o diálogo.'}</p>
            </div>

            {/* Commercial Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Canal de Origem:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedLead.origin}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Período Previsto:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedLead.estimatedPeriod}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Valor Estimado:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {selectedLead.value.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => onOpenNewContract(selectedLead)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <FileSignature className="w-4 h-4" />
              Emitir Contrato & Assinatura
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
