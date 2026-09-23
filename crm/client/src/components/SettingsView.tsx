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
  UserRound,
} from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { Toast, useToast } from './ui/Toast'
import { useSocket } from '../contexts/SocketContext'
import { User } from '../types'

interface SettingsViewProps {
  onOpenQr: () => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenQr }) => {
  const { whatsappStatus, switchWhatsAppProvider } = useSocket()
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [metaToken, setMetaToken] = useState('')
  const [metaPhoneId, setMetaPhoneId] = useState('')
  const [metaWabaId, setMetaWabaId] = useState('')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [aiServicePrompt, setAiServicePrompt] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false)
  const [defaultLeadAssigneeId, setDefaultLeadAssigneeId] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ))
  const [metaAppSecretConfigured, setMetaAppSecretConfigured] = useState(false)
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [metaTokenConfigured, setMetaTokenConfigured] = useState(false)
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  useEffect(() => {
    fetch('/api/settings', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Não foi possível carregar as configurações.')
        return res.json()
      })
      .then((data) => {
        setGeminiConfigured(data.geminiApiKey === '__configured__')
        setGeminiApiKey(data.geminiApiKey === '__configured__' ? '' : data.geminiApiKey || '')
        setMetaTokenConfigured(data.metaConfig?.accessToken === '__configured__')
        setMetaToken(data.metaConfig?.accessToken === '__configured__' ? '' : data.metaConfig?.accessToken || '')
        setMetaPhoneId(data.metaConfig?.phoneNumberId || '')
        setMetaWabaId(data.metaConfig?.wabaId || '')
        setMetaAppSecretConfigured(data.metaConfig?.appSecret === '__configured__')
        setAiServicePrompt(data.aiServicePrompt || '')
        setDefaultLeadAssigneeId(data.defaultLeadAssigneeId || '')
        setSettingsLoaded(true)
      })
      .catch(() => setSettingsLoadFailed(true))

    fetch('/api/users', { headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: User[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const enableDesktopNotifications = async () => {
    if (typeof Notification === 'undefined') {
      showToast({ tone: 'alert', message: 'Este navegador não oferece notificações do sistema.' })
      return
    }
    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
      setNotificationPermission(permission)
      if (permission === 'granted') {
        localStorage.setItem('yr_crm_windows_notifications', 'enabled')
        showToast({ tone: 'ok', message: 'Notificações do computador ativadas neste navegador.' })
      } else {
        localStorage.removeItem('yr_crm_windows_notifications')
        showToast({ tone: 'alert', message: 'Permita notificações para o CRM nas configurações do navegador.' })
      }
    } catch {
      showToast({ tone: 'alert', message: 'Não foi possível ativar as notificações neste navegador.' })
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settingsLoaded) {
      showToast({ tone: 'alert', message: 'As configurações não foram carregadas; recarregue antes de salvar para preservar o texto da YRIA.' })
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
          defaultLeadAssigneeId,
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
        description="Provedor de WhatsApp, credenciais da Meta Cloud API e a chave da IA."
      />

      <form onSubmit={handleSaveSettings} className="grid items-start gap-6 xl:grid-cols-2">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="mb-1 flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-blue-600" />Vendedor que recebe leads novos</span>
              <select
                value={defaultLeadAssigneeId}
                onChange={(event) => setDefaultLeadAssigneeId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Responsável padrão da equipe</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}
              </select>
              <span className="mt-1 block font-normal text-slate-500">A qualificação concluída será encaminhada para esta pessoa.</span>
            </label>

            <div className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"><BellRing className="h-3.5 w-3.5 text-blue-600" />Avisos no Windows</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {notificationPermission === 'granted' ? 'Permissão concedida neste navegador.' : notificationPermission === 'denied' ? 'Permissão bloqueada. Altere nas configurações do site no navegador.' : notificationPermission === 'unsupported' ? 'Este navegador não oferece notificações.' : 'Ative para receber um aviso nativo quando a IA encaminhar um lead.'}
              </p>
              <button type="button" onClick={enableDesktopNotifications} className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-800 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200">
                {notificationPermission === 'granted' ? 'Permissão ativa' : 'Ativar notificações'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ai-service-prompt" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Como a YRIA deve agir</label>
            {settingsLoadFailed && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Não foi possível carregar suas configurações. Recarregue a tela antes de salvar; o texto salvo da YRIA será preservado.</p>}
            <textarea
              id="ai-service-prompt"
              rows={5}
              maxLength={5000}
              value={aiServicePrompt}
              onChange={(event) => setAiServicePrompt(event.target.value)}
              placeholder="Ex.: fale com cordialidade e objetividade; priorize entender o equipamento, cidade, prazo e condições de entrega."
              disabled={!settingsLoaded}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{aiServicePrompt.length}/5000 caracteres. A IA faz somente a triagem comercial, escreve em texto simples sem asteriscos e para após qualificar, avisando o responsável. Essas regras não podem ser substituídas pelo texto personalizado.</p>
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

        {/* Submit button */}
        <div className="flex justify-end xl:col-span-2">
          <button
            type="submit"
            disabled={!settingsLoaded}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Salvar Configurações
          </button>
        </div>
      </form>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
