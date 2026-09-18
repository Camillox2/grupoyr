import { useEffect, useRef, useState } from 'react'
import { products } from './catalog.js'
import { productDetails, imageDimensions } from './productDetails.js'
import { useSelection } from './SelectionContext.jsx'

export default function ProductInspector() {
  const { product: selectedProduct, choose } = useSelection()
  const [productId, setProductId] = useState(1)
  const [point, setPoint] = useState(0)
  const panel = useRef(null)
  const inspect = index => {
    setPoint(index)
    if (window.matchMedia('(max-width: 700px)').matches) requestAnimationFrame(() => panel.current?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}))
  }
  useEffect(() => { if (selectedProduct) { setProductId(selectedProduct.id); setPoint(0) } }, [selectedProduct])
  const product = products.find(item => item.id === productId)
  const details = productDetails[product.id]
  return <section className="product-inspector yr3-section" id="conheca-de-perto"><div className="yr3-width">
    <div className="inspector-heading"><div><h2>Conheça de perto.</h2><p>Toque nos pontos da imagem.</p></div><div className="inspector-picker" role="group" aria-label="Explorar equipamento">{products.map(item => <button key={item.id} type="button" aria-pressed={item.id === productId} className={item.id === productId ? 'is-active' : ''} onClick={() => { setProductId(item.id); setPoint(0) }}><img src={item.image} alt="" width="80" height="80" loading="lazy"/><span>{item.short || item.name}</span></button>)}</div></div>
    <div className="inspector-grid"><div><div className="inspector-photo"><img src={product.image} alt={product.name} width={imageDimensions[product.id][0]} height={imageDimensions[product.id][1]} loading="lazy"/>{details.map((detail, index) => <button key={index} className={`inspector-point ${point === index ? 'is-active' : ''}`} style={{ left: `${detail.x}%`, top: `${detail.y}%` }} aria-label={`${detail.label}: ${product.name}`} aria-pressed={point === index} aria-controls="inspector-explanation" onClick={() => inspect(index)}><span aria-hidden="true">{point === index ? '−' : '+'}</span></button>)}</div><p className="inspector-caption">Imagem de referência. Confirme o modelo na cotação.</p></div>
      <div className="inspector-information"><div className="inspector-explanation" ref={panel} id="inspector-explanation" aria-live="polite"><div className="inspector-explanation-copy">{point !== null ? <><span>{String(point + 1).padStart(2, '0')} / {details[point].label}</span><h3>{details[point].title}</h3><p>{details[point].text}</p><button className="inspector-close" onClick={() => setPoint(null)} aria-label="Fechar explicação">×</button></> : <><span>EXPLORE A IMAGEM</span><h3>Qual detalhe você quer conhecer?</h3><p>Escolha um ponto da foto ou um dos temas abaixo.</p></>}</div><div className="inspector-topics" role="group" aria-label="Detalhes do equipamento">{details.map((detail, index) => <button key={index} aria-pressed={point === index} className={point === index ? 'is-active' : ''} onClick={() => inspect(index)}>{detail.label}</button>)}</div></div>
        <div className="inspector-selection"><span>SUA PRÓXIMA ESCOLHA</span><h3>{product.name}</h3><p>{product.rent ? 'Compare compra e locação para o seu cenário.' : 'Conheça as condições de compra com a equipe.'}</p><button className="yr3-button" onClick={() => choose(product)}>Escolher este equipamento <span aria-hidden="true">→</span></button></div>
      </div>
    </div>
  </div></section>
}
