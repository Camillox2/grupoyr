import { useEffect, useState } from 'react'
import { siteConfig } from './config.js'

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  )
}

export default function Enhancements() {
  const [open, setOpen] = useState(false)
  const hasWhatsapp = Boolean(siteConfig.whatsapp?.trim())

  useEffect(() => {
    // Onde o navegador anima por scroll timeline, o CSS ja faz o trabalho no
    // compositor: manter o observer aqui so duplicaria o efeito.
    if (CSS.supports?.('animation-timeline: view()')) return undefined

    const targets = document.querySelectorAll('.yr3-section-heading, .yr3-steps, .yr3-reasons, .yr3-guide, .yr3-contact, .yr3-about-image, .showroom-product, .equipment-info, .equipment-faq, .related-products')
    targets.forEach((el) => el.classList.add('yr-reveal'))

    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('yr-visible'))
      return undefined
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('yr-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = [
      'Olá! Vim pelo site do Grupo YR Hospitalar.',
      `Nome: ${data.get('name')}`,
      data.get('phone') ? `Telefone: ${data.get('phone')}` : null,
      `Interesse: ${data.get('interest')}`,
      `Produto: ${data.get('product')}`,
      `Mensagem: ${data.get('message')}`,
    ].filter(Boolean).join('\n')

    if (hasWhatsapp) {
      window.open(`https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
      return
    }

    window.location.href = `mailto:${siteConfig.email}?subject=${encodeURIComponent('Solicitação pelo site - Grupo YR Hospitalar')}&body=${encodeURIComponent(text)}`
  }

  return (
    <>
      <button className="yr-contact-fab" type="button" onClick={() => setOpen(true)} aria-label="Abrir formulário de atendimento">
        <span><MessageIcon /></span>
        <strong>{hasWhatsapp ? 'WhatsApp' : 'Pedir cotação'}</strong>
      </button>

      {open ? (
        <div className="yr-contact-backdrop" onMouseDown={() => setOpen(false)}>
          <section className="yr-contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="yr-contact-title">
            <button className="yr-contact-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar formulário">×</button>
            <div className="yr-contact-copy">
              <span>Atendimento Grupo YR</span>
              <h2 id="yr-contact-title">Peça uma cotação sem compromisso.</h2>
              <p>Informe o que você procura e deixe a solicitação pronta para a equipe responder com mais agilidade.</p>
              <ul>
                <li>Compra ou locação</li>
                <li>Pessoa física ou empresas</li>
                <li>Equipamentos hospitalares e home care</li>
              </ul>
            </div>

            <form className="yr-contact-form" onSubmit={submit}>
              <label>
                <span>Nome</span>
                <input name="name" autoComplete="name" placeholder="Seu nome" required />
              </label>
              <label>
                <span>WhatsApp / telefone</span>
                <input name="phone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
              </label>
              <div className="yr-form-grid">
                <label>
                  <span>Interesse</span>
                  <select name="interest" defaultValue="Orientação">
                    <option>Orientação</option>
                    <option>Comprar</option>
                    <option>Alugar</option>
                  </select>
                </label>
                <label>
                  <span>Produto</span>
                  <select name="product" defaultValue="Ainda não sei">
                    <option>Ainda não sei</option>
                    <option>Cama hospitalar</option>
                    <option>Carrinho de emergência</option>
                    <option>Maca hidráulica</option>
                    <option>Biombo hospitalar</option>
                    <option>Mesa hospitalar</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Mensagem</span>
                <textarea name="message" rows="4" placeholder="Ex.: preciso de uma cama por 60 dias e gostaria de saber valor e entrega." required />
              </label>
              <button className="yr-contact-submit" type="submit">
                <MessageIcon /> {hasWhatsapp ? 'Enviar no WhatsApp' : 'Enviar solicitação'}
              </button>
              <small>{hasWhatsapp ? 'Sua mensagem será aberta no WhatsApp.' : `A solicitação será preparada para ${siteConfig.email}.`}</small>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
