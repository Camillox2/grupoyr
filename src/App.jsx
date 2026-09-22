import { useEffect, useState } from 'react'
import { siteConfig } from './config.js'
import { products, faqs, productPath } from './catalog.js'
import HomeExperience from './HomeExperience.jsx'
import { useSelection, placeLabels } from './SelectionContext.jsx'

const heroBed = '/products/cama-yr-01.jpg'
const logoImage = '/yr-hospitalar-logo.jpg'
const dcFoundryLogo = '/dcfoundry-digital-logo.png'

const trustItems = [
  {
    icon: 'people',
    title: 'Atendimento direto',
    text: 'Você fala com uma equipe enxuta e próxima, sem depender de uma central impessoal.',
  },
  {
    icon: 'compare',
    title: 'Compra e locação lado a lado',
    text: 'A YR ajuda a comparar as alternativas para você escolher pelo uso, não pela pressão de venda.',
  },
  {
    icon: 'chat',
    title: 'Orientação antes da decisão',
    text: 'Conte o cenário e receba ajuda para entender qual tipo de equipamento faz mais sentido.',
  },
  {
    icon: 'document',
    title: 'Cotação clara',
    text: 'Disponibilidade, modalidade e condições são alinhadas antes da contratação.',
  },
]

function Icon({ name, size = 20 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="M6 6l12 12"/><path d="m18 6-12 12"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h5"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    compare: <><path d="M7 7h11"/><path d="m15 4 3 3-3 3"/><path d="M17 17H6"/><path d="m9 14-3 3 3 3"/></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    building: <><path d="M4 21V4h12v17"/><path d="M16 9h4v12"/><path d="M8 8h4"/><path d="M8 12h4"/><path d="M8 16h4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
  }

  return <svg {...props}>{paths[name]}</svg>
}

export function BrandLogo({ compact = false }) {
  return (
    <a className={`brand-logo ${compact ? 'brand-logo--compact' : ''}`} href="/#inicio" aria-label="Grupo YR Hospitalar - início">
      <span className="brand-original"><img src={logoImage} width="1280" height="1280" alt="Grupo YR Hospitalar — Soluções que transformam saúde" /></span>
    </a>
  )
}

export function DeveloperCredit() {
  return (
    <div className="dc-credit">
      <a href="https://dcfoundrydigital.com" target="_blank" rel="noreferrer noopener" aria-label="Desenvolvido e Mantido por DC Foundry Digital">
        <img src={dcFoundryLogo} width="42" height="42" alt="DC Foundry Digital" />
        <span>Desenvolvido e Mantido por <strong>DC Foundry Digital</strong></span>
      </a>
    </div>
  )
}

function App() {
  const { selection, product: chosenEquipment } = useSelection()
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    interest: 'Orientação',
    product: 'Ainda não sei',
    city: '',
    period: '',
    message: '',
  })

  const hasWhatsApp = Boolean(siteConfig.whatsapp?.trim())

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const product = products.find(item => item.slug === params.get('produto'))
    const requested = params.get('interesse')
    if (!product) return
    const interest = requested === 'alugar' && product.rent ? 'Alugar' : requested === 'comprar' ? 'Comprar' : 'Cotação'
    setFormData(current => ({...current, product: product.name, interest}))
    setContactOpen(true)
    window.history.replaceState(null, '', '/#contato')
  }, [])

  useEffect(() => {
    const modalOpen = Boolean(selectedProduct || contactOpen || legalOpen)
    if (!modalOpen) return undefined

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previousFocus = document.activeElement
    const dialog = document.querySelector('.site-shell [role="dialog"]')
    dialog?.querySelector('button, input, select, textarea, a[href]')?.focus()
    const closeOnEscape = (event) => {
      if (event.key === 'Tab' && dialog) {
        const items = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')].filter((el) => !el.disabled && el.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (event.key === 'Escape') {
        setSelectedProduct(null)
        setContactOpen(false)
        setLegalOpen(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [selectedProduct, contactOpen, legalOpen])

  const createContactUrl = ({ product, action = 'orçamento', details = '' } = {}) => {
    const message = [
      'Olá! Vim pelo site do Grupo YR Hospitalar.',
      product ? `Produto: ${product.name || product}` : null,
      action ? `Interesse: ${action}` : null,
      details || null,
      'Pode me orientar?',
    ].filter(Boolean).join('\n')

    if (hasWhatsApp) {
      return `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`
    }

    return `mailto:${siteConfig.email}?subject=${encodeURIComponent('Cotação - Grupo YR Hospitalar')}&body=${encodeURIComponent(message)}`
  }

  const handleProductContact = (product, action) => {
    openContactFor(action === 'locação' ? 'Alugar' : 'Comprar', product.name)
    setSelectedProduct(null)
  }

  const openContactFor = (interest = 'Orientação', product = 'Ainda não sei') => {
    setFormData((current) => ({ ...current, interest, product: product === 'Ainda não sei' ? chosenEquipment?.name || product : product, period: current.period || selection.period, message: current.message || (selection.place !== 'all' ? `Local de uso: ${placeLabels[selection.place]}.` : '') }))
    setContactOpen(true)
  }

  const handleFormSubmit = (event) => {
    event.preventDefault()
    const details = [
      formData.name ? `Nome: ${formData.name}` : null,
      formData.phone ? `Telefone: ${formData.phone}` : null,
      formData.city ? `Cidade de entrega: ${formData.city}` : null,
      formData.period ? `Período de uso: ${formData.period}` : null,
      formData.message ? `Mensagem: ${formData.message}` : null,
    ].filter(Boolean).join('\n')

    const url = createContactUrl({
      product: formData.product === 'Ainda não sei' ? null : formData.product,
      action: formData.interest,
      details,
    })

    if (hasWhatsApp) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      window.location.href = url
    }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <HomeExperience onContact={openContactFor} onLegal={setLegalOpen} onGuide={context=>{setFormData(current=>({...current,interest:chosenEquipment && !chosenEquipment.rent && context.interest === 'Alugar' ? 'Comprar' : context.interest,product:chosenEquipment?.name || current.product,period:context.period,message:context.message}));setContactOpen(true)}} />

      {selectedProduct ? (
        <div className="modal-backdrop" onMouseDown={() => setSelectedProduct(null)}>
          <section className="product-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Detalhes de ${selectedProduct.name}`}>
            <button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label="Fechar"><Icon name="close" size={20} /></button>
            <div className="product-modal__media">
              <img src={selectedProduct.image} alt={selectedProduct.name} onError={(event) => { event.currentTarget.style.display = 'none' }} />
            </div>
            <div className="product-modal__content">
              <span className="eyeline">{selectedProduct.category}</span>
              <h2>{selectedProduct.name}</h2>
              <p>{selectedProduct.description}</p>
              <div className="product-modal__ideal">
                <small>Indicado para</small>
                <strong>{selectedProduct.idealFor}</strong>
              </div>
              <ul>
                {selectedProduct.benefits.map((benefit) => <li key={benefit}><Icon name="check" size={17} /> {benefit}</li>)}
              </ul>
              <div className="product-modal__actions">
                {selectedProduct.sale ? <button className="btn btn--primary" onClick={() => handleProductContact(selectedProduct, 'compra')}>Quero comprar</button> : null}
                {selectedProduct.rent ? <button className="btn btn--secondary" onClick={() => handleProductContact(selectedProduct, 'locação')}>Quero alugar</button> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {contactOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setContactOpen(false)}>
          <section className="contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="contact-title">
            <button className="modal-close" onClick={() => setContactOpen(false)} aria-label="Fechar"><Icon name="close" size={20} /></button>
            <div className="contact-modal__intro">
              <img src={logoImage} alt="YR" />
              <span className="eyeline eyeline--light">Atendimento Grupo YR</span>
              <h2 id="contact-title">Conte o que você precisa.</h2>
              <p>Deixe as informações principais e leve a conversa pronta para o atendimento.</p>
              <div className="contact-modal__bullets">
                <span><Icon name="check" size={17} /> Compra ou locação</span>
                <span><Icon name="check" size={17} /> Pessoa física ou empresa</span>
                <span><Icon name="check" size={17} /> Orientação antes da escolha</span>
              </div>
            </div>
            <form className="contact-form" onSubmit={handleFormSubmit}>
              <label>
                <span>Nome</span>
                <input autoComplete="name" maxLength={100} value={formData.name} onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))} placeholder="Seu nome" required />
              </label>
              <label>
                <span>WhatsApp / telefone</span>
                <input type="tel" autoComplete="tel" maxLength={25} value={formData.phone} onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))} placeholder="(00) 00000-0000" />
              </label>
              <div className="form-row">
                <label>
                  <span>Interesse</span>
                  <select value={formData.interest} onChange={(event) => setFormData((current) => ({ ...current, interest: event.target.value }))}>
                    <option>Orientação</option>
                    <option>Cotação</option>
                    <option>Comprar</option>
                    <option>Alugar</option>
                  </select>
                </label>
                <label>
                  <span>Produto</span>
                  <select value={formData.product} onChange={(event) => setFormData((current) => ({ ...current, product: event.target.value }))}>
                    <option>Ainda não sei</option>
                    {products.map((product) => <option key={product.id}>{product.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label><span>Cidade de entrega</span><input autoComplete="address-level2" maxLength={100} value={formData.city} onChange={(event) => setFormData((current) => ({ ...current, city: event.target.value }))} placeholder="Cidade / UF" /></label>
                <label><span>Tempo de uso previsto</span><input maxLength={80} value={formData.period} onChange={(event) => setFormData((current) => ({ ...current, period: event.target.value }))} placeholder="Ex.: 30 dias ou contínuo" /></label>
              </div>
              <label>
                <span>Mensagem</span>
                <textarea maxLength={1500} rows="4" value={formData.message} onChange={(event) => setFormData((current) => ({ ...current, message: event.target.value }))} placeholder="Ex.: preciso para uso domiciliar por cerca de 60 dias..." required />
              </label>
              <button className="btn btn--primary contact-submit" type="submit">{hasWhatsApp ? 'Continuar no WhatsApp' : 'Enviar solicitação'} <Icon name="arrow" size={18} /></button>
              <small className="form-handoff">A mensagem será preparada no WhatsApp. Você revisa e envia para a equipe.</small>
              <small className="form-privacy">Ao enviar, você concorda com o uso dos dados para responder à sua solicitação. <button type="button" onClick={() => { setContactOpen(false); setLegalOpen('privacy') }}>Ver Política de Privacidade.</button></small>
            </form>
          </section>
        </div>
      ) : null}

      {legalOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setLegalOpen(null)}>
          <section className="legal-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={legalOpen === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso'}>
            <button className="modal-close" onClick={() => setLegalOpen(null)} aria-label="Fechar"><Icon name="close" size={20} /></button>
            {legalOpen === 'privacy' ? (
              <div className="legal-content">
                <span className="eyeline">Privacidade e LGPD</span>
                <h2>Política de Privacidade</h2>
                <p className="legal-updated">Última atualização: setembro de 2026</p>
                <h3>1. Quais dados podemos receber</h3>
                <p>Quando você solicita atendimento, podemos receber dados informados por você, como nome, telefone, e-mail, produto de interesse e o conteúdo da mensagem enviada.</p>
                <h3>2. Para que usamos esses dados</h3>
                <p>Usamos as informações para responder solicitações, preparar cotações, dar continuidade ao atendimento e organizar comunicações relacionadas ao pedido ou interesse apresentado.</p>
                <h3>3. Compartilhamento</h3>
                <p>Os dados não são vendidos. Eles podem ser processados por fornecedores de tecnologia necessários para operar o site, e-mail, hospedagem e canais de atendimento, sempre de acordo com a finalidade do serviço.</p>
                <h3>4. Retenção e segurança</h3>
                <p>Buscamos manter os dados apenas pelo período necessário para atendimento, obrigações legais e legítima organização comercial, adotando medidas razoáveis de segurança compatíveis com a operação.</p>
                <h3>5. Seus direitos</h3>
                <p>Nos termos da LGPD, você pode solicitar informações sobre seus dados, correção, exclusão quando aplicável e outras providências previstas em lei.</p>
                <h3>6. Contato</h3>
                <p>Para assuntos de privacidade, entre em contato pelo e-mail <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
                <div className="legal-note"><Icon name="info" size={18} /><span>Este texto deve ser revisado quando novos recursos forem adicionados, como checkout, cookies de marketing, analytics avançado ou integrações que alterem o tratamento de dados.</span></div>
              </div>
            ) : (
              <div className="legal-content">
                <span className="eyeline">Uso do site</span>
                <h2>Termos de Uso</h2>
                <p className="legal-updated">Última atualização: setembro de 2026</p>
                <h3>1. Finalidade do site</h3>
                <p>O site apresenta o Grupo YR Hospitalar, seus produtos e modalidades de venda ou locação, além de facilitar solicitações de contato e cotação.</p>
                <h3>2. Cotações e disponibilidade</h3>
                <p>Informações de disponibilidade, preços, prazos, entrega e condições comerciais são confirmadas pela equipe antes da contratação. O envio de um formulário não representa aceite automático de pedido.</p>
                <h3>3. Informações e imagens</h3>
                <p>Descrições e imagens têm finalidade informativa. Características, modelos e disponibilidade podem variar, e os dados finais do produto serão confirmados durante o atendimento.</p>
                <h3>4. Uso responsável</h3>
                <p>O conteúdo do site não substitui orientação médica, fisioterapêutica ou de outro profissional de saúde. A escolha de equipamentos deve considerar a necessidade individual e, quando apropriado, recomendação profissional.</p>
                <h3>5. Alterações</h3>
                <p>Estes termos podem ser atualizados conforme o site, os produtos e os serviços evoluírem.</p>
                <h3>6. Contato</h3>
                <p>Dúvidas podem ser enviadas para <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
