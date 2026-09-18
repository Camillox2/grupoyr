import { useEffect, useState } from 'react'
import { useSelection, placeLabels } from './SelectionContext.jsx'
import { DecisionScale } from './Motion.jsx'

export default function DecisionGuide({ onContinue }) {
  const { selection, setPlace, update } = useSelection()
  const place = selection.place === 'all' ? 'Em casa' : placeLabels[selection.place]
  const [period, setPeriod] = useState('Temporário')
  useEffect(() => {
    if (selection.period) setPeriod(['Temporário', 'Contínuo', 'Ainda não sei'].includes(selection.period) ? selection.period : 'Ainda não sei')
  }, [selection.period])
  const result = period === 'Temporário'
    ? { title: 'Comece comparando a locação.', text: 'Para um período definido, vale consultar as condições de aluguel e comparar com a compra.', interest: 'Alugar' }
    : period === 'Contínuo'
      ? { title: 'Coloque a compra na comparação.', text: 'Para uma rotina contínua, compare o investimento na compra com o custo total da locação e as condições de manutenção.', interest: 'Comprar' }
      : { title: 'Vamos entender o seu momento.', text: 'Mesmo sem um prazo definido, você pode consultar as duas modalidades e esclarecer as condições antes de decidir.', interest: 'Orientação' }
  const chosenPeriod = selection.period || period
  const context = { interest: result.interest, period: chosenPeriod, message: `Local de uso: ${place}. Tempo de uso: ${chosenPeriod}. Gostaria de comparar as opções de compra e locação.` }
  return <section className="decision-studio" id="comprar-alugar" aria-labelledby="decision-title">
    <div className="container decision-studio__grid">
      <div className="decision-studio__intro">
        <h2 id="decision-title">Cada necessidade tem um começo.</h2>
        <p>Responda duas perguntas para organizar sua próxima conversa com a YR.</p>
        <small>Uma orientação comercial. A escolha do equipamento deve acompanhar as recomendações da equipe de saúde.</small>
        <a href="/comprar-ou-alugar">Entenda a comparação completa <span aria-hidden="true">↗</span></a>
      </div>
      <div className="decision-studio__panel">
        <fieldset><legend>01 / Onde será o uso?</legend><div className="choice-row">
          {['Em casa', 'Clínica ou instituição'].map(value => <label key={value} className={place === value ? 'choice is-selected' : 'choice'}><input type="radio" name="local-de-uso" value={value} checked={place === value} onChange={() => setPlace(value === 'Em casa' ? 'home' : 'clinic')} /><span>{value}</span></label>)}
        </div></fieldset>
        <fieldset><legend>02 / Por quanto tempo?</legend><div className="choice-row choice-row--three">
          {['Temporário', 'Contínuo', 'Ainda não sei'].map(value => <label key={value} className={period === value ? 'choice is-selected' : 'choice'}><input type="radio" name="periodo-de-uso" value={value} checked={period === value} onChange={() => { setPeriod(value); update({ period: value }) }} /><span>{value}</span></label>)}
        </div></fieldset>
        <DecisionScale lean={result.interest} />
        <div className="decision-result" aria-live="polite" aria-atomic="true"><div key={period} className="decision-result__content"><h3>{result.title}</h3><p>{result.text}</p></div></div>
        <button className="btn btn--primary" onClick={() => onContinue(context)}>Levar minha escolha à YR <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </section>
}
