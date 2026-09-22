import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sun, Moon, AlertCircle, LoaderCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { BedArt } from './ui/BedArt'
import { Mark } from './ui/PageHeader'
import { SiteLinkActions } from './SiteLinkActions'

/**
 * Login na linguagem do site: painel azul-marinho com a cama vetorial animada
 * de um lado, formulario sobre a base pastel do outro.
 *
 * O e-mail NAO vem pre-preenchido: deixar o login do administrador escrito na
 * tela entrega metade da credencial para qualquer um que abra a pagina.
 */
export const LoginView: React.FC = () => {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const success = await login(email.trim(), password)
      if (!success) setError('E-mail ou senha incorretos. Confira e tente de novo.')
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Falha de comunicação com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  const field: React.CSSProperties = {
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    color: 'var(--ink)',
  }

  return (
    // A tela de login rola por conta propria: em celular baixo ou com zoom o
    // formulario nao pode ficar cortado sem rolagem.
    <div className="login grid min-h-[100dvh] overflow-y-auto lg:grid-cols-[1.05fr_1fr]" style={{ background: 'var(--surface-canvas)' }}>
      {/* ----------------------------------------------------- painel da marca */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'var(--brand-panel)', color: '#fffdf9' }}
      >
        <span className="plus absolute left-[12%] top-[16%] text-[26px]" style={{ color: '#4f93e0', opacity: 0.6, animation: 'plus-float 7s ease-in-out infinite' }} aria-hidden="true" />
        <span className="plus absolute right-[14%] top-[30%] text-[16px]" style={{ color: '#4f93e0', opacity: 0.4, animation: 'plus-float 7s ease-in-out -2.4s infinite' }} aria-hidden="true" />
        <span className="plus absolute right-[34%] top-[12%] text-[12px]" style={{ color: '#4f93e0', opacity: 0.35, animation: 'plus-float 7s ease-in-out -4.6s infinite' }} aria-hidden="true" />

        <div className="flex items-center gap-3 p-8">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-[13px]" style={{ background: '#fffdf9' }}>
            <img
              src="/yr-hospitalar-logo.jpg"
              alt=""
              className="h-full w-full object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <p className="serif text-[22px] leading-none">Grupo YR</p>
        </div>

        <div className="px-10">
          <BedArt className="mx-auto block w-full max-w-[520px]" />
        </div>

        <div className="p-10 pt-4">
          <p className="serif text-[clamp(28px,2.8vw,42px)] leading-[1.06]">
            Cada quarto pronto
            <br />
            começa aqui.
          </p>
          <p className="mt-4 max-w-[44ch] text-[14px] leading-relaxed" style={{ color: '#b9d2f0' }}>
            Funil, conversas, contratos e cobrança do Grupo YR Hospitalar em um só lugar.
          </p>
        </div>
      </aside>

      {/* ---------------------------------------------------------- formulario */}
      <main className="flex min-h-[100dvh] flex-col px-5 py-5 sm:px-10 lg:min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-[12px]" style={{ background: '#fffdf9', border: '1px solid var(--border-subtle)' }}>
              <img
                src="/yr-hospitalar-logo.jpg"
                alt=""
                className="h-full w-full object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <p className="serif text-[20px]" style={{ color: 'var(--ink)' }}>
              Grupo YR
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <SiteLinkActions compact />
            </div>
            <button
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                toggleTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
              }}
              aria-label={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
              className="action-btn action-btn--ghost grid h-10 w-10 place-items-center rounded-full"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* No celular a cama aparece numa faixa compacta: e a assinatura da marca
            e no desktop ela vive no painel ao lado. */}
        <div
          className="mx-auto mt-5 flex min-h-[170px] w-full max-w-[420px] flex-none items-center justify-center overflow-hidden rounded-[24px] px-6 py-2 lg:hidden"
          style={{ background: 'var(--brand-panel)' }}
        >
          <BedArt className="mx-auto block h-[150px] w-auto max-w-full shrink-0" />
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8 lg:py-10">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--yr-500)' }}>
            Acesso da equipe
          </p>
          <h1 className="serif text-[clamp(34px,5vw,52px)] leading-[1.03]" style={{ color: 'var(--ink)' }}>
            Bom te ver
            <br />
            <Mark>de volta.</Mark>
          </h1>
          <p className="mt-5 text-[14px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Entre com o e-mail e a senha da sua conta do CRM.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-[14px] px-4 py-3 text-[12.5px] font-semibold"
                style={{ background: 'var(--alert-surface)', color: 'var(--alert)', border: '1px solid var(--alert-border)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                E-mail
              </span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@grupoyrhospitalar.com.br"
                  className="w-full rounded-[14px] py-3.5 pl-11 pr-4 text-[14px] outline-none"
                  style={field}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                Senha
              </span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                  className="w-full rounded-[14px] py-3.5 pl-11 pr-12 text-[14px] outline-none"
                  style={field}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="tap-exempt absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="action-btn action-btn--primary flex w-full items-center justify-center gap-2 rounded-full py-4 text-[14px] font-extrabold disabled:opacity-60"
            >
              {loading ? (
                <LoaderCircle className="spin h-4 w-4" />
              ) : (
                <>
                  Entrar no CRM
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-[12px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
            Uso exclusivo de colaboradores autorizados. Esqueceu a senha? Fale com quem administra o sistema.
          </p>
        </div>

        <p className="text-center text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          Grupo YR Hospitalar · Curitiba, PR · Uso interno
        </p>
      </main>
    </div>
  )
}
