import React, { useEffect, useState } from 'react'
import { QrCode, Smartphone, RefreshCw, CheckCircle2, KeyRound, Copy, Check, Info, PhoneCall, X } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'

interface QrModalProps {
  open: boolean
  onClose: () => void
}

export const QrModal: React.FC<QrModalProps> = ({ open, onClose }) => {
  const { whatsappStatus } = useSocket()
  const [tab, setTab] = useState<'qrcode' | 'pairing'>('qrcode')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loadingPairing, setLoadingPairing] = useState(false)
  const [pairingCode, setPairingCode] = useState<string | null>(whatsappStatus.pairingCode || null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    setPairingCode(whatsappStatus.pairingCode || null)
  }, [whatsappStatus.pairingCode])

  if (!open) return null

  const isConnected =
    whatsappStatus.status === 'connected' || whatsappStatus.status === 'connected_meta'

  const handleRequestPairingCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoadingPairing(true)
    setPairingError(null)

    try {
      const token = localStorage.getItem('yr_crm_token') || ''
      const cleanNumber = phoneNumber.replace(/\D/g, '')
      const res = await fetch('/api/whatsapp/pairing-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumber: cleanNumber }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setPairingCode(data.code)
      } else {
        setPairingError(data.error || 'Não foi possível gerar o código. Tente via QR Code.')
      }
    } catch (err: any) {
      setPairingError(err.message || 'Erro de conexão ao solicitar código.')
    } finally {
      setLoadingPairing(false)
    }
  }

  const handleCopyCode = () => {
    if (!pairingCode) return
    navigator.clipboard.writeText(pairingCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleResetSession = async () => {
    setResetting(true)
    setPairingError(null)
    try {
      const res = await fetch('/api/whatsapp/reset-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível reiniciar a sessão.')
    } catch (error: any) {
      setPairingError(error.message || 'Não foi possível reiniciar a sessão.')
    } finally {
      setResetting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setPairingError(null)
    try {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível desconectar o telefone.')
    } catch (error: any) {
      setPairingError(error.message || 'Não foi possível desconectar o telefone.')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 text-center">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Vincular WhatsApp Grupo YR
              </h3>
              <p className="text-[11px] text-slate-500">Conexão segura via Baileys API</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isConnected ? (
          <div className="py-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              WhatsApp Conectado com Sucesso!
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Número ativo:{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                {whatsappStatus.connectedNumber || '(41) 99724-4279'}
              </span>
            </p>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              Todas as mensagens recebidas e disparadas passam agora pela triagem automática da IA e notificações no CRM.
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              {disconnecting ? 'Desconectando...' : 'Desconectar este telefone'}
            </button>
            {pairingError && (
              <p className="mx-auto max-w-xs rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {pairingError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tabs Selector */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
              <button
                onClick={() => setTab('pairing')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  tab === 'pairing'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Código de pareamento
              </button>
              <button
                onClick={() => setTab('qrcode')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  tab === 'qrcode'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                Escanear QR Code
              </button>
            </div>

            {tab === 'pairing' ? (
              <div className="space-y-4 text-left">
                <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Como funciona o pareamento sem câmera:
                  </div>
                  <ol className="list-decimal list-inside text-[11px] text-blue-800/90 dark:text-blue-300/90 space-y-0.5 pt-1">
                    <li>Informe o número que será conectado, com DDI e DDD.</li>
                    <li>No WhatsApp do aparelho, toque em <strong>Aparelhos Conectados</strong>.</li>
                    <li>Selecione <strong>Conectar um aparelho</strong> &rarr; <strong>Conectar com número de telefone</strong>.</li>
                    <li>Digite o código de 8 dígitos na tela do seu WhatsApp.</li>
                  </ol>
                </div>

                <form onSubmit={handleRequestPairingCode} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Número do WhatsApp com DDI e DDD
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <PhoneCall className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="Ex.: 5541999999999"
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loadingPairing}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20 shrink-0"
                      >
                        {loadingPairing ? 'Gerando...' : 'Gerar Código'}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Use somente se o WhatsApp exibir a opção de conexão por número.
                    </span>
                  </div>
                </form>

                {pairingError && (
                  <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-800">
                    {pairingError}
                  </p>
                )}

                {pairingCode && (
                  <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/50 border-2 border-emerald-500/40 text-center space-y-3 animate-fade-in">
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                      Seu Código de Pareamento
                    </span>
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-900 py-3 px-4 rounded-xl border border-emerald-300 dark:border-emerald-800 shadow-inner select-all">
                      {pairingCode.length === 8
                        ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}`
                        : pairingCode}
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Código Copiado!' : 'Copiar Código'}
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      O código expira em alguns minutos. Se expirar, clique em "Gerar Código" novamente.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 space-y-3">
                {whatsappStatus.qrCode ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-inner inline-block">
                      <img
                        src={whatsappStatus.qrCode}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 mx-auto object-contain"
                      />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed px-4">
                      No WhatsApp que ficará conectado ao CRM, acesse <strong>Aparelhos Conectados</strong> &rarr; <strong>Conectar um aparelho</strong> e aponte a câmera.
                    </p>
                    <div className="mx-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-[11px] leading-relaxed text-blue-900">
                      <strong>Teste correto:</strong> escaneie este QR com o número A. Em seguida, envie uma mensagem do número B para o número A. O CRM registrará o número B como conversa recebida.
                    </div>
                  </div>
                ) : (
                  <div className="py-8 space-y-3">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                    <p className="text-xs text-slate-500">
                      {whatsappStatus.lastError || 'Preparando uma sessão segura com o WhatsApp...'}
                    </p>
                    <button
                      type="button"
                      onClick={handleResetSession}
                      disabled={resetting}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {resetting ? 'Reiniciando sessão...' : 'Gerar novo QR Code'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
        >
          Fechar Janela
        </button>
      </div>
    </div>
  )
}
