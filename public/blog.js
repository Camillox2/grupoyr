// Blog YR: o unico comportamento que precisa de script e o video.
//
// O artigo chega com um cartaz desenhado no lugar do player. So depois do clique
// o <iframe> e criado, entao nenhum pedido vai ao YouTube ou ao Vimeo para quem
// apenas le o texto. O id vem do HTML montado pelo servidor e e conferido de novo
// aqui antes de virar endereco.
(() => {
  const PLAYERS = {
    youtube: { id: /^[A-Za-z0-9_-]{11}$/, src: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` },
    vimeo: { id: /^\d{6,12}$/, src: (id) => `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` },
  }

  // Delegado no documento: a previa do painel injeta o HTML depois do carregamento.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.video-play') : null
    const figure = button?.closest('.video')
    if (!button || !figure) return

    const player = PLAYERS[figure.dataset.video]
    const id = figure.dataset.id || ''
    if (!player || !player.id.test(id)) return

    const frame = document.createElement('iframe')
    frame.src = player.src(id)
    frame.title = 'Vídeo do artigo'
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
    frame.allowFullscreen = true
    frame.referrerPolicy = 'strict-origin-when-cross-origin'
    frame.loading = 'lazy'
    button.replaceWith(frame)
    frame.focus()
  })
})()
