import { useEffect, useRef, useState } from 'react'
import { siteConfig } from './config.js'
import { openWhatsAppContact } from './whatsappContact.js'

const starterMessages = [
  {
    role: 'model',
    text: 'Olá! Sou a YRIA, do atendimento do Grupo YR Hospitalar. Como posso te chamar?',
  },
]

const quickActions = [
  'Preciso de uma cama hospitalar',
  'Quero saber se compensa alugar',
  'Não sei qual equipamento preciso',
]

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z" />
      <path d="M8.4 7.9c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.8 1.9c.1.3 0 .5-.2.7l-.6.7c-.2.2-.2.4-.1.6.4.8 1 1.5 1.7 2.1.7.6 1.5 1 2.3 1.3.3.1.5 0 .7-.2l.7-.9c.2-.3.5-.3.8-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.4-.8 1.9-.5.5-1.3.8-2.2.7-1.1-.1-2.6-.5-4.4-1.6-1.6-1-2.8-2.3-3.6-3.5-.8-1.2-1.3-2.5-1.2-3.5 0-.6.3-1.1.6-1.4Z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

export default function AssistantYR() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(starterMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [handoff, setHandoff] = useState(false)
  const sessionRef = useRef('')
  const requestRef = useRef('')
  const busyRef = useRef(false)
  const controllerRef = useRef(null)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  useEffect(() => {
    const updateFloatingAction = () => {
      const threshold = Math.max(260, window.innerHeight * 0.38)
      setShowWhatsApp(window.scrollY > threshold)
    }

    updateFloatingAction()
    window.addEventListener('scroll', updateFloatingAction, { passive: true })
    window.addEventListener('resize', updateFloatingAction)
    return () => {
      window.removeEventListener('scroll', updateFloatingAction)
      window.removeEventListener('resize', updateFloatingAction)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [messages, loading, open])

  const whatsappUrl = (text) => `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(text)}`

  const openWhatsAppLead = () => {
    const text = 'Olá! Vim pelo site do Grupo YR Hospitalar e gostaria de receber orientação sobre compra ou locação de equipamentos hospitalares.'
    openWhatsAppContact(whatsappUrl(text))
  }

  const humanContact = () => {
    const text = 'Olá! Vim pelo atendimento YRIA do site e gostaria de falar com a equipe sobre equipamentos hospitalares.'
    if (siteConfig.whatsapp?.trim()) {
      openWhatsAppContact(contactUrl || whatsappUrl(text))
      return
    }
    window.location.href = `mailto:${siteConfig.email}?subject=${encodeURIComponent('Atendimento humano - Grupo YR Hospitalar')}&body=${encodeURIComponent(text)}`
  }

  const restart = () => {
    if (busyRef.current) return
    sessionRef.current = ''
    requestRef.current = ''
    setMessages(starterMessages)
    setInput('')
    setError('')
    setExpired(false)
    setPendingText('')
    setContactUrl('')
    setHandoff(false)
  }

  const send = async (forcedText, retry = false) => {
    const text = (forcedText ?? input).trim()
    if (!text || busyRef.current || handoff || expired || (!retry && pendingText)) return
    busyRef.current = true

    if (!retry) {
      setMessages(current => [...current, { role: 'user', text }])
      requestRef.current = crypto.randomUUID()
    }
    setInput('')
    setLoading(true)
    setError('')
    setPendingText(text)
    const controller = new AbortController()
    controllerRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 40000)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionRef.current || undefined, requestId: requestRef.current }),
        signal: controller.signal,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.code === 'session_expired') setExpired(true)
        throw new Error(data?.error || 'Não foi possível responder agora. Tente novamente.')
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Não foi possível responder agora. Tente novamente.')

      setMessages((current) => [...current, { role: 'model', text: data.reply }])
      sessionRef.current = data.sessionId || ''
      setContactUrl(data.contactUrl || '')
      setHandoff(data.handoff === true)
      setPendingText('')
    } catch (failure) {
      setError(failure.name === 'AbortError' ? 'A resposta demorou mais que o esperado. Tente novamente ou fale com a equipe no WhatsApp.' : failure.message)
    } finally {
      clearTimeout(timeout)
      busyRef.current = false
      setLoading(false)
    }
  }

  const onSubmit = (event) => {
    event.preventDefault()
    send()
  }

  return (
    <>
      <div className={`yr-floating-action ${showWhatsApp ? 'yr-floating-action--whatsapp' : 'yr-floating-action--ai'}`}>
        {showWhatsApp ? (
          <button className="yr-whatsapp-launcher" type="button" onClick={openWhatsAppLead} aria-label="Falar com a YR no WhatsApp">
            <span><WhatsAppIcon /></span>
            <strong>WhatsApp</strong>
            <small>ATENDIMENTO</small>
          </button>
        ) : (
          <button className="yr-ai-launcher" type="button" onClick={() => setOpen(true)} aria-label="Abrir atendimento YRIA">
            <span><SparkIcon /></span>
            <strong>YRIA</strong>
            <small>IA</small>
          </button>
        )}
      </div>

      {open ? (
        <div className="yr-ai-shell" role="dialog" aria-label="Atendimento YRIA" onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
          <header className="yr-ai-header">
            <div className="yr-ai-avatar"><SparkIcon /></div>
            <div>
              <strong>YRIA</strong>
              <span>Atendimento do Grupo YR Hospitalar</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar assistente">×</button>
          </header>

          <div className="yr-ai-messages" ref={scrollRef} role="log" aria-live="polite" aria-busy={loading}>
            {messages.map((message, index) => (
              <div className={`yr-ai-message yr-ai-message--${message.role}${message.error ? ' yr-ai-message--error' : ''}`} key={`${message.role}-${index}`}>
                <p>{message.text}</p>
              </div>
            ))}

            {messages.length === 1 ? (
              <div className="yr-ai-quick-actions">
                {quickActions.map((action) => (
                  <button type="button" key={action} onClick={() => send(action)}>{action}</button>
                ))}
              </div>
            ) : null}

            {loading ? (
              <div className="yr-ai-message yr-ai-message--model yr-ai-thinking" role="status" aria-label="YRIA está respondendo">
                <span /><span /><span />
              </div>
            ) : null}
            {error ? <div className="yr-ai-error" role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => expired ? restart() : send(pendingText, true)}>{expired ? 'Iniciar nova conversa' : 'Tentar novamente'}</button></div> : null}
            {handoff ? <button className="yr-ai-handoff" type="button" onClick={humanContact}>Falar no WhatsApp</button> : null}
          </div>

          <div className="yr-ai-disclaimer">
            Atendimento automatizado para orientar sobre equipamentos. Não envie exames ou dados de saúde. A equipe confirma entrega e contratação.
          </div>

          <form className="yr-ai-input" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ex.: preciso de uma cama por 2 meses..."
              maxLength={1800}
              aria-label="Mensagem para a YRIA"
              disabled={loading || handoff || expired}
            />
            <button type="submit" disabled={!input.trim() || loading || handoff || Boolean(pendingText)} aria-label="Enviar mensagem"><SendIcon /></button>
          </form>

          <footer className="yr-ai-footer">
            <button type="button" onClick={humanContact}>Falar com a equipe</button>
            {messages.length > 1 ? <button type="button" onClick={restart} disabled={loading}>Nova conversa</button> : <span>Grupo YR Hospitalar</span>}
          </footer>
        </div>
      ) : null}
    </>
  )
}
