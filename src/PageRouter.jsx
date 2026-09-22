import { useState } from 'react'
import App, { BrandLogo, DeveloperCredit } from './App.jsx'
import { SelectionProvider, useSelection } from './SelectionContext.jsx'
import QuoteDock from './QuoteDock.jsx'
import AssistantYR from './AssistantYR.jsx'
import { products, productPath } from './catalog.js'
import { siteConfig } from './config.js'

export const normalizePath = path => path.replace(/\.html$/, '').replace(/\/+$/, '') || '/'

function PageFrame({ children }) {
  return <><a className="skip-link" href="#conteudo">Ir para o conteúdo</a><header className="site-header"><div className="container header-inner"><BrandLogo /><nav className="detail-nav" aria-label="Navegação principal"><a href="/#produtos">Equipamentos</a><a href="/comprar-ou-alugar">Comprar ou alugar</a><a href="/blog">Blog YR</a></nav><a className="header-cta" href="/#contato">Falar com a YR <span aria-hidden="true">→</span></a></div></header>
    <main id="conteudo">{children}</main>
    <footer className="detail-footer"><div className="container"><BrandLogo /><div><a href="/#produtos">Todos os equipamentos</a><a href="/comprar-ou-alugar">Guia de compra e locação</a><a href="/blog">Blog YR</a><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a><a href={`https://wa.me/${siteConfig.whatsapp}`}>WhatsApp: (41) 99724-4279</a></div><p>© 2026 Grupo YR Hospitalar. Modelos, disponibilidade e condições são confirmados na cotação.</p><DeveloperCredit /></div></footer></>
}
function Breadcrumb({ title }) { return <nav className="breadcrumb container" aria-label="Você está em"><a href="/">Início</a><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav> }

function ProductGallery({ product }) {
  const images = product.gallery?.length ? product.gallery : [product.scene || product.image]
  const [activeIndex, setActiveIndex] = useState(0)
  const activeImage = images[activeIndex]

  return <div className="equipment-gallery">
    <div className="equipment-image"><img src={activeImage} alt={`${product.name} — imagem ${activeIndex + 1} de ${images.length}`} width="1400" height="1100" fetchPriority="high" style={{ objectPosition: product.focus }} /><span>{product.gallery?.length ? 'Fotos reais do produto. Confirme modelo, acessórios e disponibilidade na cotação.' : 'Imagem de referência. Confirme o modelo na cotação.'}</span></div>
    {images.length > 1 && <div className="equipment-thumbs" aria-label={`Fotos de ${product.name}`}>
      {images.map((image, index) => <button className={index === activeIndex ? 'equipment-thumb is-active' : 'equipment-thumb'} key={image} type="button" onClick={() => setActiveIndex(index)} aria-label={`Ver imagem ${index + 1} de ${images.length}`} aria-pressed={index === activeIndex}><img src={image} alt="" width="96" height="96" /></button>)}
    </div>}
  </div>
}

function ProductPage({ product }) {
  const { choose } = useSelection()
  const related = products.filter(item => item.id !== product.id).sort((a,b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0,3)
  return <PageFrame><Breadcrumb title={product.name} />
    <section className="container equipment-hero">
      <ProductGallery product={product} />
      <div className="equipment-copy"><p className="equipment-category">{product.category} / {product.rent ? 'Compra e locação' : 'Compra'}</p><h1>{product.name}</h1><p className="equipment-description">{product.description}</p><ul>{product.benefits.map(item => <li key={item}>{item}</li>)}</ul>
        <div className="equipment-cta"><button className="btn btn--primary" onClick={() => choose(product,'Comprar')}>Cotar compra <span aria-hidden="true">→</span></button>{product.rent && <button className="btn btn--secondary" onClick={() => choose(product,'Alugar')}>Cotar locação <span aria-hidden="true">→</span></button>}</div>
        <p className="equipment-note">Preço, modelo, disponibilidade e entrega sob consulta. Você recebe as condições antes de decidir.</p>
      </div>
    </section>
    <section className="equipment-info"><div className="container equipment-info__grid"><div><h2>Um equipamento que acompanha sua rotina.</h2><p>{product.idealFor}</p><p>Compartilhe o local de uso e a necessidade com a equipe. A orientação do profissional de saúde responsável ajuda a definir os recursos e ajustes necessários.</p></div><div><h2>O que confirmar na cotação</h2><ul className="checklist"><li>Modelo, dimensões e recursos disponíveis.</li><li>Capacidade e compatibilidade com o ambiente de uso.</li><li>Condições de entrega, acesso e montagem, quando aplicável.</li><li>{product.rent ? 'Período de locação, manutenção, retirada e condições de compra.' : 'Condições de compra, garantia e manutenção.'}</li></ul></div></div></section>
    <section className="container equipment-faq"><h2>Dúvidas sobre {product.name.toLowerCase()}</h2><details open><summary>Como consultar o valor?</summary><p>Selecione a modalidade acima e informe sua cidade e o uso previsto. A equipe da YR confirma o modelo disponível e prepara uma cotação para o seu cenário.</p></details><details><summary>{product.rent ? 'Posso comprar ou alugar este equipamento?' : 'Este equipamento está disponível para locação?'}</summary><p>{product.rent ? 'O catálogo da YR apresenta este equipamento para compra e locação. As duas opções dependem da disponibilidade e das condições confirmadas pela equipe.' : 'Este item está apresentado no catálogo para compra. Para outra necessidade, consulte a equipe e conheça as alternativas disponíveis.'}</p></details><details><summary>O produto entregue será igual à fotografia?</summary><p>A fotografia é uma referência. Modelo, acabamento, acessórios e especificações finais são confirmados na cotação antes da contratação.</p></details></section>
    <section className="container related-products"><div className="section-heading"><h2>Continue conhecendo.</h2><a className="inline-link" href="/#produtos">Voltar ao catálogo <span aria-hidden="true">→</span></a></div><div className="related-grid">{related.map(item => <a href={productPath(item)} key={item.id}><img src={item.image} alt={item.name} width="400" height="400" loading="lazy" /><h3>{item.name}</h3><span>Conhecer equipamento <span aria-hidden="true">↗</span></span></a>)}</div></section>
  </PageFrame>
}

function ComparePage() {
  return <PageFrame><Breadcrumb title="Comprar ou alugar" /><article className="container compare-guide"><header><p className="equipment-category">Guia de decisão / Grupo YR Hospitalar</p><h1>Comprar ou alugar um equipamento hospitalar?</h1><p>O tempo de uso é um ponto de partida. O custo total, o espaço disponível e as condições de cada proposta também entram na escolha.</p></header>
    <div className="comparison-table" role="region" aria-label="Comparação de compra e locação" tabIndex="0"><table><caption>Compare as modalidades pelo seu cenário</caption><thead><tr><th scope="col">O que avaliar</th><th scope="col">Locação</th><th scope="col">Compra</th></tr></thead><tbody><tr><th scope="row">Tempo de uso</th><td>Pode ser considerada para períodos temporários ou ainda indefinidos.</td><td>Pode ser considerada para uso contínuo ou recorrente.</td></tr><tr><th scope="row">Custo total</th><td>Compare mensalidades, entrega, retirada e possíveis prorrogações.</td><td>Compare preço de aquisição, entrega, manutenção e acessórios.</td></tr><tr><th scope="row">Depois do uso</th><td>Confirme como funcionam devolução e retirada.</td><td>Planeje onde o equipamento ficará e como será conservado.</td></tr><tr><th scope="row">Manutenção</th><td>Confirme o que está incluído no contrato e como solicitar suporte.</td><td>Confirme garantia, assistência e responsabilidades de manutenção.</td></tr></tbody></table></div>
    <section><h2>Para organizar o cuidado em casa</h2><p>Informe o período estimado, a cidade, o tipo de ambiente e as condições de acesso: escadas, elevador, portas e espaço para circulação. Leve à conversa as orientações da equipe de saúde sobre o equipamento e seus recursos.</p><a className="inline-link" href={productPath(products[0])}>Conhecer a cama hospitalar articulada →</a></section>
    <section><h2>Para clínicas e instituições</h2><p>Considere a frequência de uso, o número de ambientes e os recursos necessários à operação. Compare as propostas incluindo instalação, acessórios e continuidade do uso durante eventuais manutenções.</p><a className="inline-link" href={productPath(products[1])}>Conhecer o carrinho de emergência →</a></section>
    <section><h2>Uma boa cotação começa com estas informações</h2><ol className="guide-list"><li>Equipamento desejado e finalidade de uso.</li><li>Compra, locação ou interesse em comparar as duas.</li><li>Local de entrega e características de acesso.</li><li>Período estimado, prazo desejado e recursos necessários.</li></ol><p>Não existe uma modalidade melhor para todos. As condições finais dependem do produto e da proposta apresentada. A avaliação clínica deve ser feita pelo profissional de saúde responsável.</p></section>
    <aside className="guide-next"><h2>Seu próximo passo pode ser uma conversa.</h2><p>Use o guia interativo da YR para organizar sua necessidade.</p><a className="btn btn--primary" href="/#comprar-alugar">Comparar meu cenário →</a><a className="inline-link" href="/#produtos">Explorar equipamentos →</a></aside>
  </article></PageFrame>
}

function NotFound() { return <PageFrame><section className="container not-found"><p>404 / Página não encontrada</p><h1>Vamos encontrar o caminho certo.</h1><p>Este endereço não está disponível. Explore os equipamentos ou converse com a YR.</p><a className="btn btn--primary" href="/">Voltar ao início →</a></section></PageFrame> }

export default function PageRouter({ path = '/' }) {
  const normalized = normalizePath(path)
  const product = products.find(item => productPath(item) === normalized)
  return <SelectionProvider>{normalized === '/' ? <App /> : product ? <ProductPage product={product} /> : normalized === '/comprar-ou-alugar' ? <ComparePage /> : <NotFound />}<QuoteDock /><AssistantYR /></SelectionProvider>
}
