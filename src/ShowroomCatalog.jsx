import { useMemo, useState } from 'react'
import { products, productPath } from './catalog.js'
import { useSelection } from './SelectionContext.jsx'
import { modalityLabel } from './catalog.js'

// A ordem do catalogo e a ordem do proprio array: e a mesma sequencia em que
// as pecas entram no quarto na abertura da home.
const orderedProducts = products
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function ShowroomCatalog({ onContact }) {
  const { selection, choose } = useSelection()
  const [mode, setMode] = useState('todos')
  const [query, setQuery] = useState('')
  const environmentProducts = products
  const visible = useMemo(() => environmentProducts.filter(product => (mode !== 'alugar' || product.rent) && normalize(`${product.name} ${product.category}`).includes(normalize(query.trim()))), [environmentProducts, mode, query])
  const visibleIds = new Set(visible.map(product => product.id))
  return <section className="showroom-catalog yr3-section" id="produtos"><div className="yr3-width">
    <div className="yr3-section-heading catalog-heading"><h2>As quatro peças,<br/>em detalhe.</h2><p>Tudo para compra e locação, menos o colchão pneumático, que sai apenas em compra.</p></div>
    <div className="yr3-catalog-controls"><div className="yr3-segments" role="group" aria-label="Filtrar produtos">{[['todos', 'Todos'], ['comprar', 'Comprar'], ['alugar', 'Alugar']].map(([value, label]) => <button key={value} aria-label={label} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => setMode(value)}>{label}<span aria-hidden="true">{environmentProducts.filter(product => value !== 'alugar' || product.rent).length}</span></button>)}</div><label className="yr3-search"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span className="sr-only">Buscar equipamento</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cama, colchão, cadeira…"/></label></div>
    <p className="yr3-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? 'equipamento encontrado' : 'equipamentos encontrados'}</p>
    {!visible.length && <div className="yr3-empty"><h3>Vamos encontrar uma alternativa?</h3><p>Consulte a equipe sobre o equipamento que você procura.</p><button className="yr3-button" onClick={() => onContact('Orientação')}>Consultar a YR ↗</button><button className="yr3-button yr3-button--soft" onClick={() => { setMode('todos'); setQuery(''); setPlace('all') }}>Limpar filtros</button></div>}
    <div className="showroom-catalog-grid">{orderedProducts.map((product, index) => {
      const selected = selection.slug === product.slug
      return <article key={product.id} data-product-id={product.id} hidden={!visibleIds.has(product.id)} className={`showroom-product ${[0, 3].includes(index) ? 'showroom-product--feature' : 'showroom-product--compact'} ${index === 3 ? 'showroom-product--reverse' : ''} ${selected ? 'is-selected' : ''}`}>
        <a className="showroom-product-photo" href={productPath(product)} aria-label={`Conhecer ${product.name}`}><img src={product.image} alt={product.name} width="1000" height="1000" loading="lazy" decoding="async"/></a>
        <div className="showroom-product-copy"><span className="showroom-category">{product.category} · {modalityLabel(product)}</span><h3><a href={productPath(product)}>{product.name}</a></h3><p>{product.description}</p><div className="showroom-product-actions"><button className="yr3-button" aria-label={`Selecionar ${product.name}`} aria-pressed={selected} onClick={() => choose(product, mode === 'alugar' ? 'Alugar' : mode === 'comprar' ? 'Comprar' : undefined)}>{selected ? 'Na sua seleção' : 'Escolher equipamento'}<span aria-hidden="true">{selected ? '✓' : '+'}</span></button><a className="yr3-button yr3-button--soft" href={productPath(product)}>Ver detalhes <span aria-hidden="true">↗</span></a></div></div>
      </article>
    })}</div>
  </div></section>
}
