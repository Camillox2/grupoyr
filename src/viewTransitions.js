/**
 * Continuidade visual entre o catalogo e a pagina do equipamento.
 *
 * Só um elemento por documento pode carregar um mesmo `view-transition-name`.
 * Como o catalogo mostra seis fotos, o nome e aplicado na foto clicada no
 * instante da navegacao: o navegador tira o retrato da pagina de saida nesse
 * momento, entao a foto certa e a que morfa na pagina de destino.
 *
 * Sem suporte a View Transitions o clique continua sendo uma navegacao comum.
 */
export function enableProductMorph() {
  if (typeof document === 'undefined') return
  if (!('startViewTransition' in document)) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const MORPH_ATTR = 'data-yr-morph'

  const clearMorph = () => {
    document.querySelectorAll(`[${MORPH_ATTR}]`).forEach((element) => {
      element.removeAttribute(MORPH_ATTR)
    })
  }

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('a[href]')
      if (!link) return

      // Só navegacoes internas simples: nova aba, download ou modificador saem fora.
      if (link.target === '_blank' || link.hasAttribute('download')) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      let url
      try {
        url = new URL(link.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (!url.pathname.startsWith('/equipamentos/')) return

      // A foto tem de ser descendente da ancora clicada.
      const photo = link.querySelector('img')
      if (!photo) return

      clearMorph()
      photo.setAttribute(MORPH_ATTR, '')
    },
    true,
  )

  // Voltar pelo historico reaproveita a pagina do cache; o nome antigo
  // ficaria preso num elemento que nao e mais o ponto de partida.
  window.addEventListener('pageshow', clearMorph)
}

/**
 * Nitidifica a imagem quando ela termina de carregar.
 * Imagem que ja veio do cache entra direto no estado final, sem piscar.
 */
export function enableBlurUp() {
  if (typeof document === 'undefined') return

  const settle = (image) => image.classList.add('yr-loaded')

  // Marca as fotos que chegam com atraso. A do hero fica de fora: ela e o
  // LCP da pagina e desfoca-la atrasaria a impressao de carregamento.
  document.querySelectorAll('img[loading="lazy"]').forEach((image) => {
    if (image.complete) return
    image.setAttribute('data-yr-blurup', '')
  })

  document.querySelectorAll('img[data-yr-blurup]').forEach((image) => {
    if (image.complete) settle(image)
    else image.addEventListener('load', () => settle(image), { once: true })
  })
}
