import React, { useState, useEffect } from 'react'
import {
  Settings,
  Radio,
  ShieldCheck,
  Bot,
  Key,
  QrCode,
  Save,
  BellRing,
  Bell,
} from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { Toast, useToast } from './ui/Toast'
import { useSocket } from '../contexts/SocketContext'
import { PwaInstallPanel } from './PwaStatus'
import { ContractEmailSettings } from './ContractEmailPanel'

interface SettingsViewProps {
  onOpenQr: () => void
  onOpenYria?: () => void
}

const toApplicationServerKey = (value: string) => {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenQr, onOpenYria }) => {
  const { whatsappStatus, switchWhatsAppProvider } = useSocket()
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiServicePrompt, setAiServicePrompt] = useState('')
  const [slaGoalMinutes, setSlaGoalMinutes] = useState(15)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsLoadError, setSettingsLoadError] = useState('')
  const [metaToken, setMetaToken] = useState('')
  const [metaPhoneId, setMetaPhoneId] = useState('')
  const [metaWabaId, setMetaWabaId] = useState('')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [metaAppSecretConfigured, setMetaAppSecretConfigured] = useState(false)
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [metaTokenConfigured, setMetaTokenConfigured] = useState(false)
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'disabled' | 'enabled' | 'denied'>('checking')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  useEffect(() => {
    fetch('/api/settings', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
      },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Não foi possível carregar as configurações.'))))
      .then((data) => {
        if (data) {
          setGeminiConfigured(data.geminiApiKey === '__configured__')
          setGeminiApiKey(data.geminiApiKey === '__configured__' ? '' : data.geminiApiKey || '')
          setAiServicePrompt(typeof data.aiServicePrompt === 'string' ? data.aiServicePrompt : '')
          setSlaGoalMinutes(data.conversationSla?.goalMinutes ?? 15)
          setMetaTokenConfigured(data.metaConfig?.accessToken === '__configured__')
          setMetaToken(data.metaConfig?.accessToken === '__configured__' ? '' : data.metaConfig?.accessToken || '')
          setMetaPhoneId(data.metaConfig?.phoneNumberId || '')
          setMetaWabaId(data.metaConfig?.wabaId || '')
          setMetaAppSecretConfigured(data.metaConfig?.appSecret === '__configured__')
          setSettingsLoaded(true)
        }
      })
      .catch((error: unknown) => {
        setSettingsLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as configurações.')
      })
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setPushState('denied')
      return
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushState(subscription ? 'enabled' : 'disabled'))
      .catch(() => setPushState('disabled'))
  }, [])

  const enablePush = async () => {
    setPushBusy(true)
    setPushMessage('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unsupported')
        return
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushState('denied')
        setPushMessage('Permissão não concedida. Você pode liberá-la nas permissões do site no navegador.')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const keyResponse = await fetch('/api/push/public-key', {
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      const keyData = await keyResponse.json().catch(() => null)
      if (!keyResponse.ok || !keyData?.publicKey) throw new Error(keyData?.error || 'Servidor de notificações indisponível.')

      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toApplicationServerKey(keyData.publicKey) })
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar este dispositivo.')
      setPushState('enabled')
      setPushMessage('Notificações ativadas neste dispositivo.')
    } catch (error) {
      console.error('Erro ao ativar notificações push:', error)
      setPushMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.')
    } finally {
      setPushBusy(false)
    }
  }

  const disablePush = async () => {
    setPushBusy(true)
    setPushMessage('')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!response.ok) throw new Error('Não foi possível remover o dispositivo no servidor.')
        await subscription.unsubscribe()
      }
      setPushState('disabled')
      setPushMessage('Notificações desativadas neste dispositivo.')
    } catch (error) {
      console.error('Erro ao desativar notificações push:', error)
      setPushMessage(error instanceof Error ? error.message : 'Não foi possível desativar as notificações.')
    } finally {
      setPushBusy(false)
    }
  }

  const sendPushTest = async () => {
    setPushBusy(true)
    setPushMessage('')
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar o teste.')
      setPushMessage('Notificação de teste enviada. Confira o Windows ou o celular.')
    } catch (error) {
      console.error('Erro ao testar notificação:', error)
      setPushMessage(error instanceof Error ? error.message : 'Não foi possível enviar o teste.')
    } finally {
      setPushBusy(false)
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settingsLoaded) {
      showToast({ tone: 'alert', message: 'Aguarde o carregamento das configurações antes de salvar.' })
      return
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          geminiApiKey,
          aiServicePrompt,
          conversationSla: { goalMinutes: slaGoalMinutes },
          metaConfig: {
            accessToken: metaToken,
            phoneNumberId: metaPhoneId,
            wabaId: metaWabaId,
            appSecret: metaAppSecret,
          },
        }),
      })

      if (res.ok) {
        // Campos de segredo voltam a ficar vazios: o valor ja esta guardado.
        if (metaAppSecret) { setMetaAppSecret(''); setMetaAppSecretConfigured(true) }
        setSettingsLoadError('')
        showToast({ tone: 'ok', message: 'Configurações salvas e aplicadas.' })
      } else {
        // Antes, um erro ao salvar passava calado e parecia que tinha dado certo.
        const data = await res.json().catch(() => null)
        showToast({ tone: 'alert', message: data?.error || 'Não foi possível salvar as configurações.' })
      }
    } catch (e) {
      console.error('Erro ao salvar configurações:', e)
      showToast({ tone: 'alert', message: 'Falha de comunicação com o servidor.' })
    }
  }

  const isBaileys = whatsappStatus.provider === 'baileys'

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={<Settings className="h-5 w-5" />}
        eyebrow="Ajustes"
        title="Configurações"
        description="Provedor de WhatsApp, credenciais e orientações de atendimento da YRIA."
      />
      {settingsLoadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          {settingsLoadError} O texto salvo da YRIA não será substituído enquanto as configurações não carregarem.
        </p>
      )}

      <PwaInstallPanel />
      <ContractEmailSettings />
      <form onSubmit={handleSaveSettings} className="grid items-start gap-6 xl:grid-cols-2">
        <section className="card p-5 xl:col-span-2" aria-labelledby="sla-settings-title">
          <h3 id="sla-settings-title" className="text-sm font-bold">SLA de atendimento humano</h3>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="sheet-field max-w-xs"><span>Meta de resposta do vendedor (minutos)</span><input type="number" className="field-control" min={1} max={1440} step={1} required value={slaGoalMinutes} onChange={event => setSlaGoalMinutes(Number(event.target.value))} /></label>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>Conta tempo corrido desde a mensagem mais antiga ainda sem resposta humana. A YRIA não encerra o SLA. Conversas encerradas não ficam em atraso. Salve abaixo para aplicar.</p>
          </div>
        </section>
        {/* WhatsApp Provider Switcher Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                Motor de Conexão do WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Escolha o método de envio e recepção de mensagens em tempo real.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {isBaileys ? 'Baileys Ativo' : 'Meta Cloud Ativo'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Baileys Option */}
            <div
              onClick={() => switchWhatsAppProvider('baileys')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                isBaileys
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-600" />
                  Baileys (WhatsApp Web QR)
                </span>
                <input type="radio" checked={isBaileys} readOnly />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Conecta diretamente pelo WhatsApp Web escaneando um QR Code no painel. Sem taxa por mensagem da Meta.
              </p>
              {isBaileys && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenQr()
                  }}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-[11px] shadow-sm flex items-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Escanear QR Code
                </button>
              )}
            </div>

            {/* Meta Cloud API Option */}
            <div
              onClick={() => switchWhatsAppProvider('meta')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                !isBaileys
                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Meta Cloud API Oficial
                </span>
                <input type="radio" checked={!isBaileys} readOnly />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Integração oficial da Meta Business com Graph API v21.0. Requer número configurado no WhatsApp Manager.
              </p>
            </div>
          </div>

          {/* Os campos da Meta abrem e fecham com a altura animada. Antes eles
              simplesmente sumiam e o card encolhia no tranco. */}
          <div className="collapse-y" data-open={!isBaileys} inert={isBaileys}>
            <div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number ID (Meta)
                  </label>
                  <input
                    type="text"
                    value={metaPhoneId}
                    onChange={(e) => setMetaPhoneId(e.target.value)}
                    placeholder="Ex: 104829104928"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Permanent Access Token
                  </label>
                  <input
                    type="password"
                    value={metaToken}
                    onChange={(e) => { setMetaToken(e.target.value); setMetaTokenConfigured(false) }}
                    placeholder={metaTokenConfigured ? 'Token já configurado, digite para substituir' : 'EAAB...'}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    WABA ID (conta do WhatsApp Business)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 102938475610293"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">É por ele que o CRM lista os templates aprovados.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    App Secret (assinatura do webhook)
                  </label>
                  <input
                    type="password"
                    value={metaAppSecret}
                    onChange={(e) => { setMetaAppSecret(e.target.value); setMetaAppSecretConfigured(false) }}
                    placeholder={metaAppSecretConfigured ? 'Já configurado, digite para substituir' : 'Painel do app na Meta, Configurações, Básico'}
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {metaAppSecretConfigured
                      ? 'Ativo: o CRM só aceita mensagens recebidas que venham assinadas pela Meta.'
                      : 'Sem ele o webhook aceita qualquer chamada. Com ele, só o que a Meta assinou.'}
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Gemini AI Settings Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-600" />
              Inteligência Artificial Multimodal (Google Gemini)
            </h3>
            <p className="text-xs text-slate-500">
              Pipeline com suporte a áudios, receitas em imagens e fallback em cascata nos 6 modelos.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Google Gemini API Key
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => { setGeminiApiKey(e.target.value); setGeminiConfigured(false) }}
                placeholder={geminiConfigured ? 'Chave já configurada, digite para substituir' : 'AIzaSy...'}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {geminiConfigured ? 'A chave está salva com segurança. Deixe em branco para mantê-la.' : 'A chave é armazenada no servidor e nunca é exibida novamente.'}
            </p>
          </div>

          {/* Cascade visual representation */}
          <div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Ordem de Execução do Fallback:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
              {[
                { name: 'gemini-3.8-flash', tier: 'Principal (Maior Inteligência)' },
                { name: 'gemini-3.7-flash', tier: '2º Fallback' },
                { name: 'gemini-3.6-flash', tier: '3º Fallback' },
                { name: 'gemini-3.5-flash', tier: '4º Fallback' },
                { name: 'gemini-3.5-flash-lite', tier: '5º Fallback (Ultra Rápido)' },
                { name: 'gemini-3.1-flash-lite', tier: '6º Fallback (Garantia)' },
              ].map((m, i) => (
                <div
                  key={m.name}
                  className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50"
                >
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold block">
                    {i + 1}º Passo:
                  </span>
                  <strong className="text-slate-900 dark:text-white block truncate">{m.name}</strong>
                  <span className="text-[9px] text-slate-500 block">{m.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 xl:col-span-2" aria-labelledby="yria-prompt-title">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h3 id="yria-prompt-title" className="text-sm font-bold text-slate-900 dark:text-white">Como a YRIA deve agir</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Instruções da equipe para o tom e as prioridades do atendimento. O texto que já estava salvo foi preservado e é carregado neste campo.
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="yria-service-prompt" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Instruções personalizadas
            </label>
            <p id="yria-settings-note" className="mb-3 text-xs leading-relaxed text-slate-500">Seu texto foi preservado. Edite instruções e personas, teste e publique na nova área YRIA.</p>
            <button type="button" onClick={onOpenYria} className="mb-3 rounded-xl bg-blue-700 px-4 py-3 text-xs font-bold text-white">Abrir YRIA e laboratório</button>
            <textarea
              id="ai-service-prompt"
              value={aiServicePrompt}
              aria-describedby="yria-settings-note"
              readOnly
              maxLength={5000}
              rows={12}
              spellCheck
              disabled={!settingsLoaded}
              placeholder={settingsLoaded ? 'Escreva aqui como a YRIA deve atender…' : 'Carregando o texto salvo…'}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-900 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-purple-950"
            />
            <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-slate-500">
                A YRIA continua limitada à qualificação comercial e ao encaminhamento para o vendedor; estas instruções complementam esse protocolo.
              </p>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{aiServicePrompt.length}/5000 caracteres</span>
            </div>
          </div>
        </section>

        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 xl:col-span-2" aria-labelledby="push-notifications-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {pushState === 'enabled' ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </span>
              <div>
                <h3 id="push-notifications-title" className="text-sm font-bold text-slate-900 dark:text-white">Avisos no Windows e celular</h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                  Receba um aviso quando a IA concluir a qualificação ou precisar passar a conversa para um vendedor. A permissão é salva separadamente em cada dispositivo.
                </p>
                {pushMessage && <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300" role="status">{pushMessage}</p>}
                {pushState === 'unsupported' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Este navegador não oferece notificações push para o CRM.</p>}
                {pushState === 'denied' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">O navegador bloqueou as notificações. Libere-as nas permissões do site e tente novamente.</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              {pushState === 'enabled' ? (
                <>
                  <button type="button" onClick={sendPushTest} disabled={pushBusy} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
                    {pushBusy ? 'Aguarde…' : 'Enviar teste'}
                  </button>
                  <button type="button" onClick={disablePush} disabled={pushBusy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    Desativar
                  </button>
                </>
              ) : (
                <button type="button" onClick={enablePush} disabled={pushBusy || pushState === 'unsupported' || pushState === 'checking'} className="rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">
                  {pushBusy ? 'Ativando…' : pushState === 'checking' ? 'Verificando…' : 'Ativar neste dispositivo'}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Submit button */}
        <div className="flex justify-end xl:col-span-2">
          <button
            type="submit"
            disabled={!settingsLoaded}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            {settingsLoaded ? 'Salvar Configurações' : 'Carregando configurações…'}
          </button>
        </div>
      </form>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
