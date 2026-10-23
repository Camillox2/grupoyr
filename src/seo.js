import { products, faqs, productPath } from './catalog.js'
import { siteConfig } from './config.js'

export const paths = ['/', '/comprar-ou-alugar', ...products.map(productPath)]
export function pageMetadata(path) {
  const product = products.find(item => productPath(item) === path)
  if (product) return { title: `${product.name}: ${product.rent ? 'Compra e Locação' : 'Venda'} | YR`, description: `${product.name} para ${product.rent ? 'compra ou locação' : 'compra'}. Conheça as aplicações e consulte modelo, valor e entrega com o Grupo YR Hospitalar.`, product }
  if (path === '/comprar-ou-alugar') return { title: 'Comprar ou Alugar Equipamento Hospitalar? | Guia YR', description: 'Compare compra e locação de equipamentos hospitalares: tempo de uso, custo total, entrega e manutenção. Organize sua cotação com o Grupo YR.' }
  if (path !== '/') return { title: 'Página não encontrada | Grupo YR Hospitalar', description: 'Encontre equipamentos hospitalares para compra e locação no Grupo YR Hospitalar.', noindex: true }
  return { title: 'Equipamentos Hospitalares: Venda e Locação | Grupo YR', description: 'Compre ou alugue camas hospitalares, macas e mobiliário com a YR. Equipamentos para casa, clínicas e hospitais. Compare opções e solicite sua cotação.' }
}
export function structuredData(path) {
  const meta = pageMetadata(path), url = siteConfig.url + (path === '/' ? '/' : path)
  const orgId = siteConfig.url + '/#organization'
  const graph = [
    { '@type': 'Organization', '@id': orgId, name: siteConfig.company, url: siteConfig.url + '/', logo: { '@type': 'ImageObject', url: siteConfig.url + '/yr-hospitalar-logo.jpg', width: 1280, height: 1280 }, email: siteConfig.email, telephone: '+' + siteConfig.whatsapp, contactPoint: { '@type': 'ContactPoint', telephone: '+' + siteConfig.whatsapp, contactType: 'sales', availableLanguage: 'Portuguese' } },
    { '@type': 'WebSite', '@id': siteConfig.url + '/#website', url: siteConfig.url + '/', name: siteConfig.company, inLanguage: 'pt-BR', publisher: { '@id': orgId } },
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: meta.title, description: meta.description, inLanguage: 'pt-BR', isPartOf: { '@id': siteConfig.url + '/#website' }, about: { '@id': orgId } },
  ]
  if (path === '/') graph.push(
    { '@type': 'ItemList', name: 'Equipamentos hospitalares para compra e locação', itemListElement: products.map((p,i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: siteConfig.url + productPath(p) })) },
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faqs.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) },
  )
  // Quote-based items (price on request): described as a Service, not Product, so no product-snippet offers/review/rating are expected.
  if (meta.product) graph.push({ '@type': 'Service', '@id': url + '#service', name: meta.product.name, description: meta.product.description, serviceType: meta.product.rent ? 'Venda e locação de equipamento hospitalar' : 'Venda de equipamento hospitalar', category: meta.product.category, image: siteConfig.url + meta.product.image, url, provider: { '@id': orgId }, areaServed: 'Curitiba e região' })
  if (path !== '/' && !meta.noindex) graph.push({ '@type': 'BreadcrumbList', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'Início', item: siteConfig.url + '/' }, { '@type': 'ListItem', position: 2, name: meta.product?.name || 'Comprar ou alugar', item: url } ] })
  return { '@context': 'https://schema.org', '@graph': graph }
}
