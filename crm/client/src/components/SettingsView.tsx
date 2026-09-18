import React, { useState, useEffect } from 'react'
import {
  Settings,
  Radio,
  ShieldCheck,
  Bot,
  Key,
  QrCode,
  Save,
  CheckCircle2,
} from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'

interface SettingsViewProps {
  onOpenQr: () => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenQr }) => {
  const { whatsappStatus, switchWhatsAppProvider } = useSocket()
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [metaToken, setMetaToken] = useState('')
  const [metaPhoneId, setMetaPhoneId] = useState('')
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [metaTokenConfigured, setMetaTokenConfigured] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/settings', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setGeminiConfigured(data.geminiApiKey === '__configured__')
          setGeminiApiKey(data.geminiApiKey === '__configured__' ? '' : data.geminiApiKey || '')
          setMetaTokenConfigured(data.metaConfig?.accessToken === '__configured__')
          setMetaToken(data.metaConfig?.accessToken === '__configured__' ? '' : data.metaConfig?.accessToken || '')
          setMetaPhoneId(data.metaConfig?.phoneNumberId || '')
        }
      })
      .catch(() => {})
  }, [])

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
        },
        body: JSON.stringify({
          geminiApiKey,
          metaConfig: {
            accessToken: metaToken,
            phoneNumberId: metaPhoneId,
          },
        }),
      })

      if (res.ok) {
        setSavedSuccess(true)
        setTimeout(() => setSavedSuccess(false), 4000)
      }
    } catch (e) {
      console.error('Erro ao salvar configurações:', e)
    }
  }

  const isBaileys = whatsappStatus.provider === 'baileys'

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          Configurações do Sistema & Integrações
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Alterne entre provedores de WhatsApp, gerencie credenciais da Meta Cloud API e configure a chave da IA Gemini.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Configurações salvas e aplicadas com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
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

          {!isBaileys && (
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
                    placeholder={metaTokenConfigured ? 'Token já configurado — digite para substituir' : 'EAAB...'}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}
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
                placeholder={geminiConfigured ? 'Chave já configurada — digite para substituir' : 'AIzaSy...'}
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

        {/* Submit button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            Salvar Configurações
          </button>
        </div>
      </form>
    </div>
  )
}
