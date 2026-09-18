import React, { useState } from 'react'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Sun,
  Moon,
  AlertCircle,
  ExternalLink,
  Phone,
  Building2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export const LoginView: React.FC = () => {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const [email, setEmail] = useState('rodrigo@grupoyrhospitalar.com.br')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const success = await login(email.trim(), password)
      if (!success) {
        setError('E-mail ou senha incorretos. Verifique suas credenciais de acesso.')
      }
    } catch (err: any) {
      setError(err.message || 'Falha de comunicação com o servidor de autenticação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
            <img
              src="https://site.grupoyrhospitalar.com.br/yr-hospitalar-logo.jpg"
              alt="Grupo YR Hospitalar"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              Grupo YR Hospitalar
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Portal Corporativo de Gestão & Locações Hospitalares
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://site.grupoyrhospitalar.com.br/"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
          >
            <span>Site Institucional</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-sm"
            title="Alternar tema"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-blue-700" />
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl p-8 space-y-6">
          {/* Header do Card */}
          <div className="text-left space-y-1.5 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
              <span>Ambiente corporativo protegido</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Acesso ao Sistema
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Digite seu e-mail corporativo e senha para entrar no painel.
            </p>
          </div>

          {/* Mensagem de Erro */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulário de Login */}
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@grupoyrhospitalar.com.br"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950 transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Senha de Acesso
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-700 focus:ring-blue-600 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Manter conectado
                </span>
              </label>
              <span className="text-[11px] text-slate-400">Acesso restrito</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 active:bg-blue-900 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Painel</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Aviso Institucional de Segurança */}
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 text-left flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                Diretoria e Operações Grupo YR
              </p>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                Uso exclusivo para colaboradores e gestores autorizados. Dúvidas com credenciais devem ser encaminhadas ao departamento de TI.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2 text-[11px]">
          <span>Grupo YR Hospitalar</span>
          <span>•</span>
          <span>CNPJ: 45.123.890/0001-23</span>
          <span>•</span>
          <span>Curitiba - PR</span>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>Central: (41) 99724-4279</span>
          </span>
          <span>•</span>
          <span>Normas ANVISA RDC & LGPD</span>
        </div>
      </footer>
    </div>
  )
}
