import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
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
  Download,
  Smile,
  Phone,
  RefreshCw,
  MoreVertical,
} from 'lucide-react'
import { Lead, Message } from '../types'
import { useSocket } from '../contexts/SocketContext'
import { useIsMobile, useMediaQuery } from '../hooks/useMediaQuery'
import { authHeaders, displayContactName, isClosed, maskPhone, windowInfo } from '../lib/conversation'
import { LeadSheet } from './LeadSheet'
import { NewContactModal } from './NewContactModal'
import { SendTemplateModal } from './SendTemplateModal'
import { ChatEmojiPicker } from './ChatEmojiPicker'
import { WhatsAppHistoryStatus } from './WhatsAppHistoryStatus'
import { historySyncBusy } from '../lib/historySync'
import { useConversationMetrics } from '../hooks/useConversationMetrics'
import { ContactAvatar } from './ContactAvatar'
import { chatDayKey, chatDayLabel, chatTime, chatDateTime, chatListTime, leadMatchesDay, conversationSlaLabel } from '../lib/chatTimeline'

interface WhatsAppChatViewProps {
  leads: Lead[]
  selectedLead: Lead | null
  onSelectLead: (lead: Lead | null) => void
  onLeadUpdated: (lead: Lead) => void
  onOpenNewContract: (lead: Lead) => void
  /** Chamado quando a ficha gera o contrato. */
  onContractCreated?: () => void
}

const messageHasPlaceholderContent = (content: string) => /^\[(?:imagem|vídeo|audio|áudio|arquivo|figurinha|gif)(?::[^\]]*)?\]$/i.test(content.trim())
const EMPTY_MESSAGES: Message[] = []
const compareMessages = (a: Message, b: Message) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || Date.parse(a.receivedAt || a.timestamp) - Date.parse(b.receivedAt || b.timestamp)

const AuthenticatedMessageMedia: React.FC<{ message: Message }> = ({ message }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!message.mediaUrl) return
    const controller = new AbortController()
    let createdUrl: string | null = null
    setObjectUrl(null)
    setFailed(false)

    fetch(message.mediaUrl, { headers: authHeaders(false), signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('Não foi possível carregar a mídia da conversa:', error)
          setFailed(true)
        }
      })

    return () => {
      controller.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [message.mediaUrl, message.mediaStatus, retry])

  if (!message.mediaUrl) return messageHasPlaceholderContent(message.content)
    ? <p className="mb-2 text-[11px] opacity-75">Anexo antigo ainda não recuperado. Use “Atualizar histórico”.</p> : null
  const kind = message.type === 'sticker' ? 'sticker'
    : message.type === 'image' || message.mediaMimeType?.startsWith('image/') ? 'image'
    : message.type === 'video' || message.mediaMimeType?.startsWith('video/') ? 'video'
    : message.type === 'audio' || message.mediaMimeType?.startsWith('audio/') ? 'audio' : 'file'
  // O mesmo espaço existe antes e depois do download, sem empurrar o histórico.
  const frame = (content: React.ReactNode) => <div className={`chat-media-frame chat-media-frame--${kind}`}>{content}</div>
  if (failed) return frame(<div className="chat-media-placeholder text-[11px] opacity-75"><p>Não foi possível carregar este anexo.</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-1 underline">Tentar carregar anexo</button></div>)
  if (!objectUrl) return frame(<p className="chat-media-placeholder text-[11px] opacity-70">Carregando anexo…</p>)

  const label = message.mediaFileName || (message.type === 'file' ? 'Baixar arquivo' : 'Baixar mídia')
  if (message.type === 'sticker') {
    return frame(<a href={objectUrl} target="_blank" rel="noreferrer" className="block h-full" aria-label={message.mediaIsAnimated ? 'Abrir figurinha animada' : 'Abrir figurinha'}>
      <img src={objectUrl} alt={message.mediaIsAnimated ? 'Figurinha animada' : 'Figurinha'} className="chat-media-asset" loading="lazy" />
    </a>)
  }
  if (message.type === 'image' || message.mediaMimeType?.startsWith('image/')) {
    return (
      frame(<a href={objectUrl} target="_blank" rel="noreferrer" className="block h-full overflow-hidden rounded-lg">
        <img src={objectUrl} alt={message.mediaFileName || 'Imagem enviada na conversa'} className="chat-media-asset" loading="lazy" />
      </a>)
    )
  }
  if (message.type === 'video' || message.mediaMimeType?.startsWith('video/')) {
    return frame(<><video src={objectUrl} controls={!message.mediaIsGif} autoPlay={message.mediaIsGif} loop={message.mediaIsGif} muted={message.mediaIsGif} playsInline preload="metadata" className="chat-media-asset rounded-lg" aria-label={message.mediaIsGif ? 'GIF recebido' : message.mediaFileName || 'Vídeo enviado na conversa'} />
      {message.mediaIsGif && <a href={objectUrl} download={label} className="mt-1 inline-block text-[10px] underline">GIF · baixar</a>}</>)
  }
  if (message.type === 'audio' || message.mediaMimeType?.startsWith('audio/')) {
    return frame(<><audio src={objectUrl} controls preload="metadata" className="block h-10 w-full" aria-label={message.mediaFileName || 'Áudio enviado na conversa'} />
      <a href={objectUrl} download={label} className="mt-1 inline-block text-[10px] underline">Baixar áudio</a></>)
  }
  return (
    frame(<a href={objectUrl} download={label} className="inline-flex h-full w-full items-center gap-2 rounded-lg border border-current/15 px-3 py-2 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/10">
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>)
  )
}

const AudioPreview: React.FC<{ file: File }> = ({ file }) => {
  const [source, setSource] = useState('')
  useEffect(() => { const url = URL.createObjectURL(file); setSource(url); return () => URL.revokeObjectURL(url) }, [file])
  return source ? <audio src={source} controls className="mt-2 h-9 w-full max-w-full" aria-label="Prévia do áudio antes de enviar" /> : null
}

export const WhatsAppChatView: React.FC<WhatsAppChatViewProps> = ({
  leads,
  selectedLead,
  onSelectLead,
  onLeadUpdated,
  onOpenNewContract,
  onContractCreated,
}) => {
  const isMobile = useIsMobile()
  // Em tela larga a ficha e uma coluna fixa; abaixo disso ela abre por cima.
  // A ficha so ocupa uma coluna fixa em telas largas; em notebooks menores,
  // ela continua disponivel no drawer sem apertar a area de mensagens.
  const isWide = useMediaQuery('(min-width: 1440px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false)
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
  const { whatsappStatus, socket, connected, browserOnline, serverReachable, historySyncByLead, requestHistorySync } = useSocket()
  const conversationInfo = useConversationMetrics(socket)
  const [entryFilter, setEntryFilter] = useState<'all' | 'today' | 'yesterday'>('all')
  const [messagesByLead, setMessagesByLead] = useState<Record<string, Message[]>>({})
  const [historyLoaded, setHistoryLoaded] = useState<Record<string, boolean>>({})
  const [historyError, setHistoryError] = useState<Record<string, string>>({})
  const [historyRetry, setHistoryRetry] = useState(0)
  const [positionedLead, setPositionedLead] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [asSticker, setAsSticker] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const actionsButtonRef = useRef<HTMLButtonElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [pendingAiControls, setPendingAiControls] = useState<Record<string, boolean>>({})
  const pendingAiControlIds = useRef(new Set<string>())
  const [aiControlError, setAiControlError] = useState<{ leadId: string; message: string } | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const followLatestRef = useRef(true)
  const automaticScrollRef = useRef(false)
  const scrollHistoryRef = useRef<{ leadId?: string; lastId?: string }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
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
    (whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta') && browserOnline && serverReachable !== false
  const isMeta = whatsappStatus.provider === 'meta'

  // `selectedLead` e uma copia guardada no App e nao recebe os eventos do
  // socket. O estado vivo (encerrada, ultima mensagem do cliente) sai da lista.
  const selectedLeadId = selectedLead?.id
  const syncJob = selectedLeadId ? historySyncByLead[selectedLeadId] : undefined
  const syncActive = !!syncJob && ['requesting', 'waiting_phone', 'processing'].includes(syncJob.phase)
  const syncBusy = syncing || historySyncBusy(syncJob, now)
  useEffect(() => {
    setEmojiOpen(false)
    setAsSticker(false)
    setSyncNotice('')
    setActionsOpen(false)
    setRecording(false)
    return () => {
      const recorder = audioRecorderRef.current
      if (recorder) {
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
        recorder.stream.getTracks().forEach(track => track.stop())
        audioRecorderRef.current = null
      }
    }
  }, [selectedLeadId])

  useEffect(() => {
    if (!actionsOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setActionsOpen(false); actionsButtonRef.current?.focus() }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [actionsOpen])
  const messages = selectedLeadId ? messagesByLead[selectedLeadId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  const messagesReady = !!selectedLeadId && !!historyLoaded[selectedLeadId]
  const liveLead = (selectedLeadId && leads.find((lead) => lead.id === selectedLeadId)) || selectedLead
  const aiEnabled = liveLead?.aiEnabled === true && !liveLead.aiManualPausedAt && !liveLead.humanAssumedAt
  const pendingAiControl = selectedLeadId ? pendingAiControls[selectedLeadId] : undefined
  const savingAiControl = pendingAiControl !== undefined
  const visibleAiControlError = aiControlError && aiControlError.leadId === selectedLeadId ? aiControlError.message : ''
  const externalAutomationPresent = messages.some(message => message.isAutomated === true && message.automaticReplyKind === 'legacy_fallback' && Date.parse(message.timestamp) > now - 86400000)
  const selectedMetric = selectedLeadId ? conversationInfo[selectedLeadId] : undefined
  const selectedSla = conversationSlaLabel(selectedMetric, now)
  const photosEnabled = whatsappStatus.provider === 'baileys' && whatsappStatus.status === 'connected'
  const conversationClosed = liveLead ? isClosed(liveLead) : false
  const windowState = windowInfo(liveLead, now)
  // Texto livre so e barrado na API oficial: o Baileys nao tem janela.
  const windowBlocked = isMeta && (!windowState.open || serverClosedFor === selectedLeadId)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!selectedLead || !connected) return

    const leadId = selectedLead.id
    const controller = new AbortController()
    setSelectedFile(null)
    setAiSummary(null)
    setSendError(null)
    setHistoryError(current => ({ ...current, [leadId]: '' }))
    setNow(Date.now())
    fetch(`/api/leads/${leadId}/messages`, {
      headers: authHeaders(false),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((res) => { if (!res.ok) throw new Error('Histórico indisponível'); return res.json() })
      .then((data: Message[]) => {
        if (controller.signal.aborted) return
        setMessagesByLead((current) => {
          const merged = new Map((current[leadId] ?? EMPTY_MESSAGES).map((message) => [message.id, message]))
          for (const message of Array.isArray(data) ? data : []) merged.set(message.id, message)
          return {
            ...current,
            [leadId]: [...merged.values()].sort(compareMessages),
          }
        })
        setHistoryLoaded(current => ({ ...current, [leadId]: true }))
      })
      .catch(() => { if (!controller.signal.aborted) setHistoryError(current => ({ ...current, [leadId]: 'Não foi possível carregar as mensagens. Tente novamente.' })) })

    return () => controller.abort()
    // So o id: trocar o OBJETO do mesmo lead nao pode zerar a conversa aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId, connected, historyRetry])

  useEffect(() => {
    if (!socket || !selectedLeadId) return

    const appendLiveMessage = (message: Message) => {
      if (message.leadId !== selectedLeadId) return
      setMessagesByLead((current) => {
        const conversation = current[selectedLeadId] ?? EMPTY_MESSAGES
        return conversation.some((item) => item.id === message.id)
          ? current
          : { ...current, [selectedLeadId]: [...conversation, message].sort(compareMessages) }
      })
      // Mensagem do cliente renova a janela: o contador ja sai certo.
      setNow(Date.now())
      if (message.from === 'client') setServerClosedFor(null)
    }
    // Status de entrega que a Meta manda depois (entregue, lida, falhou).
    const updateLiveMessage = (message: Message) => {
      if (message.leadId !== selectedLeadId) return
      setMessagesByLead((current) => {
        const conversation = current[selectedLeadId] ?? EMPTY_MESSAGES
        const updated = conversation.some(item => item.id === message.id)
          ? conversation.map(item => item.id === message.id ? { ...item, ...message } : item) : [...conversation, message]
        return { ...current, [selectedLeadId]: updated.sort(compareMessages) }
      })
    }

    socket.on('message:new', appendLiveMessage)
    socket.on('message:updated', updateLiveMessage)
    return () => {
      socket.off('message:new', appendLiveMessage)
      socket.off('message:updated', updateLiveMessage)
    }
  }, [socket, selectedLeadId])

  useLayoutEffect(() => {
    const list = messagesScrollRef.current
    if (!list || !selectedLeadId || !messagesReady) {
      scrollHistoryRef.current = {}
      setPositionedLead(null)
      return
    }
    const previous = scrollHistoryRef.current
    const lastId = messages.at(-1)?.id
    if (previous.leadId !== selectedLeadId) {
      // A posição inicial é definida antes do primeiro quadro visível.
      followLatestRef.current = true
      automaticScrollRef.current = false
      list.scrollTop = list.scrollHeight
      setPositionedLead(selectedLeadId)
    } else if (followLatestRef.current && previous.lastId !== lastId) {
      automaticScrollRef.current = true
      list.scrollTo({ top: list.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    } else if (followLatestRef.current && !automaticScrollRef.current) {
      list.scrollTop = list.scrollHeight
    }
    scrollHistoryRef.current = { leadId: selectedLeadId, lastId }
  }, [selectedLeadId, messages, messagesReady])

  useEffect(() => {
    const list = messagesScrollRef.current
    if (!list || !messagesReady) return
    // Mudanças de viewport/cabeçalho mantêm o fim somente para quem já o acompanha.
    const observer = new ResizeObserver(() => {
      if (followLatestRef.current) list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [selectedLeadId, messagesReady])

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSelectedFile(file)
    setAsSticker(file.type === 'image/webp')
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
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'
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

  const handleSyncHistory = async () => {
    if (!selectedLeadId || syncing) return
    setSyncing(true)
    setSyncNotice('')
    try {
      await requestHistorySync(selectedLeadId)
    } catch (error) { setSyncNotice(error instanceof Error ? error.message : 'Não foi possível atualizar o histórico.') }
    finally { setSyncing(false) }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if ((!inputText.trim() && !selectedFile) || !selectedLead || !isConnected || loading || recording) return

    const textToSend = inputText
    const fileToSend = selectedFile
    const conversationId = selectedLead.id
    setInputText('')
    setLoading(true)
    setSendError(null)
    setEmojiOpen(false)

    try {
      const token = localStorage.getItem('yr_crm_token') || ''
      let res: Response
      if (fileToSend) {
        const formData = new FormData()
        formData.append('leadId', conversationId)
        formData.append('caption', textToSend)
        formData.append('file', fileToSend)
        formData.append('asSticker', String(asSticker))
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
          body: JSON.stringify({ leadId: conversationId, text: textToSend }),
        })
      }
      if (res.ok) {
        const data = await res.json()
        setMessagesByLead((current) => {
          const conversation = current[conversationId] ?? EMPTY_MESSAGES
          return conversation.some((item) => item.id === data.message.id)
            ? current
            : { ...current, [conversationId]: [...conversation, data.message] }
        })
        setSelectedFile(null)
      } else {
        const data = await res.json().catch(() => null)
        setInputText(textToSend)
        setSendError(data?.error || 'Não foi possível enviar. Confira a conexão do WhatsApp e tente novamente.')
        // O relogio do navegador pode estar adiantado/atrasado: quem decide a
        // janela e o servidor. Se ele disse que fechou, a tela acompanha.
        if (data?.code === 'window_closed') setServerClosedFor(conversationId)
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      setInputText(textToSend)
      setSendError('Falha de comunicação com o atendimento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const entryDate = (lead: Lead) => conversationInfo[lead.id]?.enteredAt || lead.createdAt
  const periodLeads = leads.filter(lead => leadMatchesDay(lead.createdAt, entryFilter, now))
  const todayCount = leads.filter(lead => leadMatchesDay(lead.createdAt, 'today', now)).length
  const yesterdayCount = leads.filter(lead => leadMatchesDay(lead.createdAt, 'yesterday', now)).length
  const openCount = periodLeads.filter((lead) => !isClosed(lead)).length
  const closedCount = periodLeads.length - openCount

  const filteredLeads = periodLeads.filter((lead) => {
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
    if (!liveLead || pendingAiControlIds.current.has(liveLead.id)) return
    const leadId = liveLead.id
    const newState = !aiEnabled
    pendingAiControlIds.current.add(leadId)
    setPendingAiControls(current => ({ ...current, [leadId]: newState }))
    setAiControlError(current => current?.leadId === leadId ? null : current)
    try {
      const response = await fetch(`/api/leads/${leadId}/toggle-ai`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({ enabled: newState, revision: liveLead.aiControlRevision || '' }),
        signal: AbortSignal.timeout(15_000),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Não foi possível confirmar a alteração. Tente novamente.')
      if (result?.id !== leadId || result.aiEnabled !== newState) throw new Error('O servidor não confirmou o estado solicitado. Atualize a conversa e tente novamente.')
      onLeadUpdated(result)
    } catch (error) {
      setAiControlError({ leadId, message: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Não foi possível confirmar a alteração. Atualize a conversa antes de tentar novamente.' })
    } finally {
      pendingAiControlIds.current.delete(leadId)
      setPendingAiControls(current => { const next = { ...current }; delete next[leadId]; return next })
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
      className={`no-cascade chat-panel flex overflow-hidden ${isMobile ? 'h-full min-h-0 flex-1 flex-col' : 'h-[calc(100dvh-112px)] min-h-[420px] flex-row rounded-[16px]'}`}
      style={{
        background: 'var(--surface-raised)',
        border: isMobile ? 'none' : '1px solid var(--border-subtle)',
        boxShadow: isMobile ? 'none' : 'var(--shadow-sm)',
      }}
    >
      {/* Lista de conversas */}
      <div
        id="whatsapp-conversation-list"
        className={`min-h-0 flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          isMobile
            ? selectedLead
              ? 'hidden'
              : 'flex w-full flex-1'
            : conversationsCollapsed
              ? 'flex w-[52px] flex-none'
              : 'flex w-72 xl:w-80 flex-none'
        }`}
        style={{ background: 'var(--surface-sunken)' }}
      >
        {!isMobile && conversationsCollapsed ? (
          <div className="flex h-full justify-center p-1.5">
            <button
              type="button"
              onClick={() => setConversationsCollapsed(false)}
              aria-label="Mostrar lista de conversas"
              aria-controls="whatsapp-conversation-list"
              aria-expanded={false}
              title="Mostrar lista de conversas"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition-colors hover:bg-blue-100/70 dark:hover:bg-slate-800"
              style={{ color: 'var(--ink-muted)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
        <>
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Conversas</h3>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                via {isMeta ? 'API oficial da Meta' : 'Baileys Web'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!isMobile && (
                <button
                  type="button"
                  onClick={() => setConversationsCollapsed(true)}
                  aria-label="Recolher lista de conversas"
                  aria-controls="whatsapp-conversation-list"
                  aria-expanded={true}
                  title="Recolher lista de conversas"
                  className="grid h-9 w-9 place-items-center rounded-[10px] transition-colors hover:bg-blue-100/70 dark:hover:bg-slate-800"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
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
          </div>
          <div className="chat-entry-filters" role="group" aria-label="Filtrar pela data de entrada do lead">
            {([{ id: 'today', label: 'Hoje', count: todayCount }, { id: 'yesterday', label: 'Ontem', count: yesterdayCount }, { id: 'all', label: 'Todos', count: leads.length }] as const).map(filter => <button key={filter.id} type="button" aria-pressed={entryFilter === filter.id} onClick={() => setEntryFilter(filter.id)}>{filter.label}<span className="tnum">{filter.count}</span></button>)}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>Pela entrada do lead · horário de Brasília · inclui abertas e encerradas</p>
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
            const metric = conversationInfo[lead.id]
            const sla = conversationSlaLabel(metric, now)
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
                <ContactAvatar lead={lead} enabled={photosEnabled} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {displayContactName(lead.name)}
                    </h4>
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400" title={`Última interação: ${chatDateTime(lead.lastInteraction)}`}>
                      {chatListTime(lead.lastInteraction, now)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400" title={lead.phone}>
                    {maskPhone(lead.phone) || 'Número não informado'}
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}><time dateTime={entryDate(lead) || undefined}>{metric?.entrySource === 'history' ? 'Primeiro contato' : 'Entrada'}: {chatDateTime(entryDate(lead))}</time></p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {lead.equipmentInterest} • R$ {lead.value.toFixed(0)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                  <span className="chat-sla mt-1.5" data-tone={sla.tone} title={sla.title}>{sla.text}</span>
                </div>
              </div>
            )
          })}
        </div>
        </>
        )}
      </div>

      {/* Main Chat Thread Area */}
      {selectedLead ? (
        <div key={selectedLead.id} className="chat-conversation-enter flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Cabecalho da conversa */}
          <div
            className={`relative z-20 flex shrink-0 items-center justify-between gap-2 ${isMobile ? 'px-2 py-2' : 'min-h-16 flex-wrap px-5 py-3'}`}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {/* Volta para a lista no mobile. */}
              {isMobile && (
                <button
                  onClick={() => onSelectLead(null)}
                  aria-label="Voltar para a lista de conversas"
                  className="grid h-10 w-9 shrink-0 place-items-center rounded-[8px]"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <ContactAvatar lead={liveLead || selectedLead} enabled={photosEnabled} className="chat-contact-avatar--header" />
              <div className="min-w-0">
                <h3 className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {displayContactName(selectedLead.name)}
                </h3>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{maskPhone(selectedLead.phone) || 'Número não informado'}</p>
                <p className="truncate text-[11px] text-slate-500" title={`${selectedLead.equipmentInterest} (${selectedLead.modality === 'locacao' ? 'locação' : 'compra'})`}>
                  Interesse: <span className="font-semibold">{selectedLead.equipmentInterest}</span> ({selectedLead.modality === 'locacao' ? 'locação' : 'compra'})
                </p>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div ref={actionsRef} className="relative shrink-0">
              {isMobile && <button ref={actionsButtonRef} type="button" onClick={() => setActionsOpen(value => !value)} aria-label="Mais opções da conversa" aria-expanded={actionsOpen} aria-controls="chat-actions" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-black/5" style={{ color: 'var(--ink-muted)' }}><MoreVertical className="h-5 w-5" /></button>}
              {(!isMobile || actionsOpen) && <div id="chat-actions" aria-label="Opções da conversa" onClick={event => { if (isMobile && (event.target as HTMLElement).closest('button,a')) setActionsOpen(false) }} className={isMobile ? 'chat-actions-popover absolute right-0 top-full z-30 mt-2 flex w-64 max-w-[calc(100vw-16px)] flex-col gap-1 rounded-xl border p-2 shadow-xl' : 'flex flex-wrap items-center gap-2'} style={isMobile ? { background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' } : undefined}>
              <a href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp para ligar" title="Abrir WhatsApp para fazer uma chamada" className="action-btn action-btn--ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold">
                <Phone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ligar no WhatsApp</span>
              </a>
              {!isMeta && <button type="button" onClick={handleSyncHistory} disabled={!isConnected || syncBusy} aria-label="Atualizar histórico do WhatsApp" title="Recuperar mensagens e anexos antigos do telefone" className="action-btn action-btn--ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${syncing || syncJob?.phase === 'processing' || syncJob?.phase === 'requesting' ? 'animate-spin' : ''}`} />{isMobile && <span>{syncActive ? 'Sincronização em andamento' : 'Sincronizar histórico'}</span>}</button>}
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
                disabled={savingAiControl}
                aria-busy={savingAiControl}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  aiEnabled
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
                title="Pausar ou ativar respostas automáticas da IA para este lead"
              >
                <Bot className="w-3.5 h-3.5" />
                {savingAiControl ? (pendingAiControl ? 'Reativando…' : 'Salvando pausa…') : aiEnabled ? 'IA Respondendo' : 'IA Pausada'}
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
              {isWide && selectedLead && (
                <button
                  type="button"
                  onClick={() => setDetailsCollapsed((current) => !current)}
                  aria-controls="lead-closing-sheet"
                  aria-expanded={!detailsCollapsed}
                  aria-label={detailsCollapsed ? 'Mostrar ficha do cliente' : 'Recolher ficha do cliente'}
                  title={detailsCollapsed ? 'Mostrar ficha do cliente' : 'Recolher ficha do cliente'}
                  className="action-btn action-btn--ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold"
                >
                  {detailsCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span>{detailsCollapsed ? 'Mostrar ficha' : 'Recolher ficha'}</span>
                </button>
              )}
              </div>}
            </div>
          </div>

          <div className="chat-attendance-bar">
            <time dateTime={(selectedMetric?.enteredAt || liveLead?.createdAt) ?? undefined}>{selectedMetric?.entrySource === 'history' ? 'Primeiro contato' : 'Entrada do lead'}: {chatDateTime(selectedMetric?.enteredAt || liveLead?.createdAt)}</time>
            <span className="chat-sla" data-tone={selectedSla.tone} title={selectedSla.title}>{selectedSla.text}</span>
          </div>

          {syncJob && <WhatsAppHistoryStatus job={syncJob} />}
          {syncNotice && <p className="shrink-0 px-3 py-2 text-[11px] text-rose-600" role="alert">{syncNotice}</p>}

          {/* Messages Scroll Area */}
          {visibleAiControlError && <div className="chat-gate" data-tone="wait" role="alert"><CircleAlert className="h-4 w-4 shrink-0" /><p>{visibleAiControlError}</p></div>}
          {!aiEnabled && externalAutomationPresent && <div className="chat-gate" data-tone="neutral" role="status"><Bot className="h-4 w-4 shrink-0" /><p>A YRIA deste CRM está pausada. Há mensagens de uma automação externa nesta conversa; o emissor precisa ser desligado na origem.</p></div>}
          <div ref={messagesScrollRef} aria-label="Mensagens da conversa" aria-busy={!messagesReady} data-chat-ready={messagesReady && positionedLead === selectedLead.id} onWheel={() => { automaticScrollRef.current = false }} onTouchStart={() => { automaticScrollRef.current = false }} onPointerDown={() => { automaticScrollRef.current = false }} onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) automaticScrollRef.current = false }} onScroll={event => { const list = event.currentTarget; const gap = list.scrollHeight - list.scrollTop - list.clientHeight; if (automaticScrollRef.current && gap > 1) return; automaticScrollRef.current = false; followLatestRef.current = gap < 64 }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5" style={{ background: 'var(--surface-canvas)' }}>
            {!messagesReady && <div className="chat-history-loading flex h-full flex-col items-center justify-center gap-3 text-center text-xs" role="status">
              <p>{historyError[selectedLead.id] || (connected ? 'Carregando mensagens…' : 'Aguardando conexão para carregar a conversa…')}</p>
              {historyError[selectedLead.id] && <button type="button" className="action-btn action-btn--ghost rounded-xl px-3 py-2" onClick={() => setHistoryRetry(value => value + 1)}>Tentar carregar mensagens</button>}
            </div>}
            <div className={`chat-messages-content space-y-3 ${messagesReady && messages.length === 0 ? 'h-full' : ''} ${messagesReady && positionedLead === selectedLead.id ? 'chat-messages-ready' : ''}`}>
            {messagesReady && messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                  <MessageSquareIcon />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Nenhuma mensagem registrada</p>
                <p className="mt-1 max-w-xs text-[11px] leading-4 text-slate-400">Inicie o atendimento ou aguarde uma nova mensagem deste contato.</p>
              </div>
            ) : messages.map((msg, index) => {
              const isClient = msg.from === 'client'
              const isAi = msg.from === 'ai'
              const isExternalAutomation = msg.isAutomated === true && msg.automaticReplyKind === 'legacy_fallback'
              const separator = index === 0 || chatDayKey(messages[index - 1].timestamp) !== chatDayKey(msg.timestamp)
                ? <div className="chat-day-divider" role="separator" aria-label={chatDayLabel(msg.timestamp, now)}><time dateTime={chatDayKey(msg.timestamp) || undefined}>{chatDayLabel(msg.timestamp, now)}</time></div> : null

              // Aviso do sistema: uma linha no meio, sem balao.
              if (msg.from === 'system') {
                return (
                  <React.Fragment key={msg.id}>{separator}<div className="chat-system chat-message-enter">
                    <span>
                      {msg.content}
                      <time className="tnum" dateTime={msg.timestamp} title={chatDateTime(msg.timestamp)}>
                        {chatTime(msg.timestamp)}
                      </time>
                    </span>
                  </div></React.Fragment>
                )
              }

              return (
                <React.Fragment key={msg.id}>{separator}
                <div
                  key={msg.id}
                  className={`chat-message-enter flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`min-w-0 max-w-full sm:max-w-lg [overflow-wrap:anywhere] p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      isClient
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/80 dark:border-slate-700'
                        : isAi || isExternalAutomation
                        ? 'bg-blue-100 text-slate-900 border border-blue-200 rounded-tr-none dark:bg-blue-900 dark:text-white dark:border-blue-800'
                        : 'bg-slate-900 text-white rounded-tr-none dark:bg-blue-600'
                    }`}
                  >
                    {/* Header for AI response */}
                    {(isAi || isExternalAutomation) && (
                      <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-blue-200 text-[10px] font-extrabold text-blue-700 dark:border-white/20 dark:text-blue-200">
                        <Bot className="w-3 h-3" />
                        <span>{isExternalAutomation ? 'Automação externa · não é resposta do vendedor' : `Assistente YR (${msg.modelUsed || 'gemini-3.8-flash'})`}</span>
                      </div>
                    )}

                    {msg.type === 'template' && (
                      <div className="mb-1 flex items-center gap-1.5 border-b border-white/20 pb-1 text-[10px] font-extrabold text-white/80">
                        <MessageSquareDashed className="h-3 w-3" />
                        <span>Template{msg.templateName ? `: ${msg.templateName}` : ''}</span>
                      </div>
                    )}

                    {/* Mídias privadas usam busca autenticada: <img src> não envia o Bearer token. */}
                    <AuthenticatedMessageMedia message={msg} />
                    {/* Content */}
                    {!(messageHasPlaceholderContent(msg.content)) && (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {/* Timestamp & checks */}
                    <div
                      className={`text-[9px] mt-1.5 flex items-center justify-end gap-1 ${
                        isClient ? 'text-slate-400' : isAi || isExternalAutomation ? 'text-slate-500 dark:text-white/70' : 'text-white/70'
                      }`}
                    >
                      <time dateTime={msg.timestamp} title={chatDateTime(msg.timestamp)}>{chatTime(msg.timestamp)}</time>
                      {!isClient && (msg.deliveryStatus === 'cancelled' ? (
                        <span className="font-semibold">Não enviada · IA pausada ou alterada</span>
                      ) : ['prepared', 'sending', 'pending_connection', 'delivery_unknown'].includes(msg.deliveryStatus || '') ? (
                        <span className="font-semibold">{msg.deliveryStatus === 'prepared' ? 'Link preparado · envio pendente' : msg.deliveryStatus === 'sending' ? 'Enviando…' : msg.deliveryStatus === 'delivery_unknown' ? 'Envio incerto · confira antes de reenviar' : 'Aguardando conexão'}</span>
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
                </React.Fragment>
              )
            })}
            </div>
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
            className="chat-composer relative shrink-0 p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={handleFileSelection}
              className="hidden"
            />
            {selectedFile && (
              <div className="absolute bottom-full mb-2 left-3 right-3 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[11px] text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">Anexo: {selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="shrink-0 rounded-lg p-1 text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/60"
                  aria-label="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button></div>
                {selectedFile.type.startsWith('audio/') && <AudioPreview file={selectedFile} />}
                {!isMeta && selectedFile.type.startsWith('image/') && <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={asSticker} onChange={event => setAsSticker(event.target.checked)} />Enviar como figurinha</label>}
              </div>
            )}
            {emojiOpen && <ChatEmojiPicker onClose={() => { setEmojiOpen(false); textInputRef.current?.focus() }} onSelect={emoji => {
              const input = textInputRef.current
              const start = input?.selectionStart ?? inputText.length
              const end = input?.selectionEnd ?? start
              setInputText(value => value.slice(0, start) + emoji + value.slice(end))
              setEmojiOpen(false)
              input?.focus()
            }} />}
            <div className="hidden xl:flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-1">
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
            <button type="button" onClick={() => setEmojiOpen(value => !value)} aria-label="Escolher emoji" aria-expanded={emojiOpen} className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:text-blue-600 dark:border-slate-700"><Smile className="h-4 w-4" /></button>
            <input
              ref={textInputRef}
              type="text"
              placeholder={
                isConnected
                  ? 'Digite sua mensagem para o cliente...'
                  : 'WhatsApp offline. Conecte pelo botão superior para disparar.'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              aria-label="Mensagem para o cliente"
              className="min-w-0 flex-1 px-2 sm:px-4 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
        <aside
          id="lead-closing-sheet"
          className={`chat-details-panel ${detailsCollapsed ? 'is-collapsed' : ''}`}
          aria-label="Ficha de fechamento"
          aria-hidden={detailsCollapsed}
          inert={detailsCollapsed}
        >
          <LeadSheet
            lead={liveLead || selectedLead}
            aiSummary={liveLead?.aiSummary || aiSummary}
            generatingSummary={generatingSummary}
            onGenerateSummary={handleGenerateSummary}
            onContractCreated={onContractCreated}
          />
        </aside>
      )}
      {selectedLead && !isWide && sheetOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
          <div className="backdrop-in absolute inset-0 bg-[#0a1c33]/60" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="sheet-drawer relative z-10 h-full w-full max-w-[460px]">
            <LeadSheet
              lead={liveLead || selectedLead}
              aiSummary={liveLead?.aiSummary || aiSummary}
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
