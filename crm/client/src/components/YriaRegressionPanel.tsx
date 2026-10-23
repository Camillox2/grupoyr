import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { customerApi } from '../lib/customerApi'
import './inspection.css'

interface RegressionCase {
  name: string
  passed: boolean
  providerOk: boolean | null
  providerCalls?: number
  providerFailures?: string[]
  reply: string
  model: string | null
}
interface Run {
  id: string
  at: string
  mode: string
  passed: boolean
  providerVerified: boolean
  notice: string
  cases: RegressionCase[]
}
const failureLabels: Record<string, string> = {
  quota: 'Cota do Gemini atingida',
  timeout: 'Tempo de resposta excedido',
  network: 'Falha de conexão',
  unconfigured: 'Chave Gemini não configurada',
  invalid_output: 'Resposta fora do formato esperado',
  credentials: 'Chave ou permissão recusada',
  provider_error: 'Provedor temporariamente indisponível',
}

export function YriaRegressionPanel() {
  const [runs, setRuns] = useState<Run[]>([])
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    customerApi<Run[]>('/api/yria/regression')
      .then(value => { if (active) setRuns(value) })
      .catch(reason => { if (active) setError((reason as Error).message) })
    return () => { active = false }
  }, [])

  const execute = async () => {
    setBusy(true)
    setError('')
    try {
      const run = await customerApi<Run>('/api/yria/regression', 'POST', { online, confirmed: online })
      setRuns(current => [run, ...current].slice(0, 10))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const latest = runs[0]

  return <section className="yr-care yr-care-inline">
    <div className="yr-care-card">
      <div className="yr-care-row">
        <div>
          <h2><ShieldCheck size={18} style={{ display: 'inline', marginRight: 9 }} />Regressão de atendimento</h2>
          <p>Confira apresentação, extração da ficha, perguntas repetidas, preço inventado e encaminhamento humano.</p>
        </div>
        <button className="yr-care-primary" disabled={busy} onClick={() => void execute()}>
          {busy ? 'Executando cenários…' : 'Executar bateria'}
        </button>
      </div>
      <label className="yr-care-check">
        <input type="checkbox" checked={online} disabled={busy} onChange={event => setOnline(event.target.checked)} />
        <span>Incluir o Gemini real. Consome cota da chave configurada. Sem esta opção, testa somente o roteiro local, sem chamar IA.</span>
      </label>
      {error ? <p role="alert" className="yr-care-notice yr-care-error">{error}</p> : null}
      {latest ? <>
        <div className={'yr-care-notice ' + (latest.passed ? 'yr-care-success' : 'yr-care-error')}>
          <strong>{latest.passed ? 'Verificações do fluxo passaram' : 'Há cenários que precisam de revisão'}</strong>
          <p>{latest.notice}</p>
          <small>{new Date(latest.at).toLocaleString('pt-BR')} · {latest.mode === 'online' ? 'Gemini real e roteiro' : 'Somente roteiro local'}</small>
        </div>
        {latest.mode === 'online' ? <p className={'yr-care-notice ' + (latest.providerVerified ? 'yr-care-success' : 'yr-care-error')}>
          {latest.providerVerified
            ? 'O Gemini respondeu às chamadas necessárias. Pedidos de atendimento humano não chamam a IA novamente.'
            : 'O Gemini real NÃO foi validado em todos os cenários. Houve contingência ou falha; confira os detalhes abaixo.'}
        </p> : null}
        {latest.cases.map(scenario => <details key={scenario.name} className="yr-care-item">
          <summary>{scenario.passed ? 'Passou' : 'Revisar'} · {scenario.name}</summary>
          <p>{scenario.reply}</p>
          <small>{scenario.model || 'Roteiro local'}{scenario.providerOk === false ? ' · provedor real não confirmado' : ''}</small>
          {scenario.providerFailures?.map(code => <p className="yr-care-notice yr-care-error" key={code}>
            {failureLabels[code] || 'Chamada ao provedor não concluída'}
          </p>)}
        </details>)}
      </> : <p>Nenhuma bateria executada nesta tela. Os testes não criam leads, contratos, cobranças ou mensagens reais.</p>}
    </div>
  </section>
}
