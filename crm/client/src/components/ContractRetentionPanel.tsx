import React, { useCallback, useEffect, useState } from 'react'
import { ArrowRight, BrainCircuit, CalendarClock, Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import { Contract } from '../types'
import { getUpcomingSignedRentals, useLocalDateKey } from '../lib/contractCountdown'

interface RetentionInsight {
  title: string
  observation: string
  recommendedAction: string
  timing: string
  principle: string
}

interface InsightsResponse {
  asOf: string
  source: 'gemini' | 'rules'
  model: string | null
  insights: RetentionInsight[]
  cached?: boolean
}

interface ContractRetentionPanelProps {
  contracts: Contract[]
  onOpenContracts: () => void
}

const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export const ContractRetentionPanel: React.FC<ContractRetentionPanelProps> = ({ contracts, onOpenContracts }) => {
  const today = useLocalDateKey()
  const upcoming = getUpcomingSignedRentals(contracts, today)
  const [result, setResult] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadInsights = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/ai/contract-retention-insights', {
        method: forceRefresh ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
          ...(forceRefresh ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(forceRefresh ? { body: JSON.stringify({ forceRefresh: true }) } : {}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.insights) throw new Error(data?.error || 'Não foi possível carregar os insights.')
      setResult(data as InsightsResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os insights.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadInsights() }, [loadInsights, contracts])

  return (
    <section className="yr-retention-panel" aria-labelledby="yr-retention-title">
      <header className="yr-retention-panel__head">
        <div className="yr-retention-panel__title">
          <span className="yr-retention-panel__icon"><BrainCircuit aria-hidden="true" /></span>
          <div>
            <p>Relacionamento e recorrência</p>
            <h3 id="yr-retention-title">Renovações e prazo dos contratos</h3>
          </div>
        </div>
        <div className="yr-retention-panel__actions">
          {result && <span className={`yr-retention-source ${result.source === 'gemini' ? 'is-ai' : ''}`}>{result.source === 'gemini' ? `Gemini · ${result.model || 'IA'}` : 'Análise operacional'}</span>}
          <button type="button" onClick={() => void loadInsights(true)} disabled={loading} aria-label="Atualizar insights de retenção" title="Atualizar insights">
            <RefreshCw className={loading ? 'is-spinning' : ''} aria-hidden="true" /><span>Atualizar</span>
          </button>
        </div>
      </header>

      <div className="yr-retention-panel__body">
        <section className="yr-renewal-timers" aria-label="Locações com término próximo">
          <div className="yr-retention-subhead">
            <div><CalendarClock aria-hidden="true" /><h4>Contagem regressiva</h4></div>
            <button type="button" onClick={onOpenContracts}>Ver contratos <ArrowRight aria-hidden="true" /></button>
          </div>
          {upcoming.length ? <div className="yr-renewal-timers__list">
            {upcoming.map(({ contract, countdown }) => (
              <article className={`yr-renewal-timer yr-renewal-timer--${countdown.phase}`} key={contract.id}>
                <div className="yr-renewal-timer__clock"><Clock3 aria-hidden="true" /><strong>{countdown.label}</strong><span>até {shortDate(contract.endDate)}</span></div>
                <div className="yr-renewal-timer__contract"><strong>{contract.clientName || 'Cliente sem nome'}</strong><span>{contract.number} · {countdown.durationDays} dias de período</span></div>
              </article>
            ))}
          </div> : <p className="yr-retention-empty">Nenhuma locação assinada com término nos próximos 60 dias. Os prazos aparecem somente quando o contrato tem datas confiáveis.</p>}
        </section>

        <section className="yr-retention-insights" aria-label="Insights para renovação de contratos" aria-live="polite">
          <div className="yr-retention-subhead"><div><BrainCircuit aria-hidden="true" /><h4>Próxima melhor ação</h4></div></div>
          {loading && !result ? <p className="yr-retention-loading">Analisando prazos e dados agregados dos contratos…</p> : null}
          {error && <div className="yr-retention-error" role="alert">{error} <button type="button" onClick={() => void loadInsights()}>Tentar novamente</button></div>}
          {result?.insights.map((insight, index) => (
            <article className="yr-retention-insight" key={`${insight.title}-${index}`}>
              <div className="yr-retention-insight__copy">
                <span className="yr-retention-insight__number">0{index + 1}</span>
                <div><h5>{insight.title}</h5><p className="yr-retention-insight__observation">{insight.observation}</p><p>{insight.recommendedAction}</p>
                  <div className="yr-retention-insight__meta"><span><strong>Quando:</strong> {insight.timing}</span><span><ShieldCheck aria-hidden="true" /><strong>Princípio:</strong> {insight.principle}</span></div>
                </div>
              </div>
            </article>
          ))}
          {result?.source === 'rules' && <p className="yr-retention-disclosure">Recomendações baseadas nos registros atuais. Para análise generativa, conecte o Gemini em Configurações.</p>}
        </section>
      </div>

      <footer className="yr-retention-playbook">
        <div><ShieldCheck aria-hidden="true" /><strong>Estratégia de extensão sem pressão</strong></div>
        <p>Faça um check-in antes do fim, relembre os benefícios já combinados e apresente opções mensais ou mais longas com preço total, regras de devolução e flexibilidade visíveis. Use apenas condições aprovadas, sem urgência artificial, medo ou renovação automática sem consentimento.</p>
      </footer>
    </section>
  )
}
