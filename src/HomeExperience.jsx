import { useState } from 'react'
import { BrandLogo } from './App.jsx'
import { faqs, hospitalBedGallery } from './catalog.js'
import TheRoom from './TheRoom.jsx'
import HeroBed from './HeroBed.jsx'
import { KineticBand, MotionBento, JourneyRoad, ChatCTA, FaqMotion } from './Motion.jsx'
import { siteConfig } from './config.js'
import ProductCarousel from './ProductCarousel.jsx'
import DecisionGuide from './DecisionGuide.jsx'
import ShowroomCatalog from './ShowroomCatalog.jsx'
import ProductInspector from './ProductInspector.jsx'

export default function HomeExperience({onContact,onLegal,onGuide}) {
  const [menu,setMenu]=useState(false)
  return <div className="yr3">
    <header className="yr3-header"><div className="yr3-width yr3-header-inner"><BrandLogo/><nav className={menu?'yr3-nav is-open':'yr3-nav'} id="yr3-menu" aria-label="Navegação principal">{[['#produtos','Equipamentos'],['#conheca-de-perto','Conheça de perto'],['#comprar-alugar','Compra ou locação'],['/blog','Blog YR'],['#faq','Dúvidas']].map(([href,label])=><a key={href} href={href} onClick={()=>setMenu(false)}>{label}</a>)}</nav><button className="yr3-button yr3-header-contact" onClick={()=>onContact('Orientação')}>Vamos conversar <span aria-hidden="true">↗</span></button><button className="yr3-menu-toggle" onClick={()=>setMenu(value=>!value)} aria-label={menu?'Fechar menu':'Abrir menu'} aria-controls="yr3-menu" aria-expanded={menu}>{menu?'×':<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>}</button></div></header>
    <main id="conteudo">
      <HeroBed onContact={onContact} />
      <TheRoom onContact={onContact} />
      <KineticBand />
      <MotionBento />
      <ShowroomCatalog onContact={onContact}/>
      <ProductInspector/>

      <div className="yr3-guide"><DecisionGuide onContinue={onGuide}/></div>

      <section className="yr3-about yr3-section" id="porque-yr"><div className="yr3-width yr3-about-grid"><div className="yr3-about-image"><img src={hospitalBedGallery[1]} width="1280" height="853" loading="lazy" alt="Cama hospitalar articulada do Grupo YR Hospitalar"/><div className="yr3-brand-card"><img src="/yr-hospitalar-logo.jpg" width="1280" height="1280" alt="Logo original do Grupo YR Hospitalar — Soluções que transformam saúde"/></div></div><div><p className="yr3-eyebrow">O JEITO YR DE CUIDAR</p><h2>A escolha é sua.<br/>A atenção é nossa.</h2><p className="yr3-body">O Grupo YR Hospitalar trabalha com venda e locação de equipamentos hospitalares para famílias, cuidadores, clínicas e instituições. A proposta é entender o seu contexto e facilitar cada etapa da escolha.</p><div className="yr3-reasons">{[['01','Conversa de verdade','Conte sua necessidade e receba orientação comercial antes de decidir.'],['02','Opções lado a lado','Compare compra, locação e as condições de cada equipamento.'],['03','Tudo combinado','Modelo, disponibilidade, valores e entrega são alinhados na cotação.']].map(([number,title,text])=><div key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><button className="yr3-button" onClick={()=>onContact('Orientação')}>Conhecer minhas opções ↗</button></div></div></section>

      <section className="yr3-journey yr3-section" id="como-funciona"><div className="yr3-width"><div className="yr3-section-heading"><h2>Do primeiro contato<br/>ao quarto pronto.</h2><p>Role a página e acompanhe o caminho, do WhatsApp à instalação.</p></div><JourneyRoad /></div></section>

      <FaqMotion faqs={faqs} onContact={onContact} />

      <ChatCTA onContact={onContact} email={siteConfig.email} />
    </main>
    <footer className="yr3-footer"><div className="yr3-width yr3-footer-grid"><BrandLogo/><div><strong>Explore</strong><a href="#produtos">Equipamentos</a><a href="/comprar-ou-alugar">Guia de compra e locação</a><a href="/blog">Blog YR</a><a href="#porque-yr">Sobre a YR</a></div><div><strong>Converse</strong><a href={`https://wa.me/${siteConfig.whatsapp}`}>WhatsApp: (41) 99724-4279</a><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></div><div><strong>Informações</strong><button onClick={()=>onLegal('privacy')}>Privacidade</button><button onClick={()=>onLegal('terms')}>Termos de uso</button></div></div><div className="yr3-width yr3-footer-bottom"><span>© 2026 Grupo YR Hospitalar.</span><span>Modelos e disponibilidade são confirmados na cotação.</span></div></footer>
  </div>
}
