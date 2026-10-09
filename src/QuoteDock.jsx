import { useEffect, useRef, useState } from 'react'
import { useSelection, placeLabels, fitsPlace } from './SelectionContext.jsx'
import { siteConfig } from './config.js'
import { openWhatsAppContact } from './whatsappContact.js'

export default function QuoteDock() {
  const { selection, product, update, setPlace, clear } = useSelection()
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState('')
  const [access, setAccess] = useState('')
  const [quantity, setQuantity] = useState('1')
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    if (!open || !element || !product) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, product])
  if (!product) return null
  const message = [
    'Olá! Vim pelo showroom do Grupo YR Hospitalar.',
    `Equipamento: ${product.name}.`, `Modalidade: ${selection.mode}.`,
    `Local de uso: ${placeLabels[selection.place]}.`,
    selection.period && `Tempo de uso previsto: ${selection.period}.`,
    city && `Cidade de entrega: ${city}.`,
    selection.place === 'clinic' && `Quantidade desejada: ${quantity || 'A definir'}.`,
    selection.place === 'home' && access && `Condições de acesso: ${access}.`,
    'Gostaria de confirmar modelo, disponibilidade, medidas e condições de entrega.',
  ].filter(Boolean).join('\n')
  const whatsapp = `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`
  return <>
    <aside className="quote-dock" aria-label="Sua seleção">
      <img src={product.image} alt="" width="56" height="56" />
      <div className="quote-dock-copy" aria-live="polite"><strong>{product.name}</strong><span>{selection.mode} · {placeLabels[selection.place]}</span></div>
      <button className="quote-dock-next" onClick={() => setOpen(true)}>Continuar <span aria-hidden="true">→</span></button>
      <button className="quote-dock-clear" onClick={() => { setOpen(false); clear() }} aria-label="Remover seleção">×</button>
    </aside>
    <dialog ref={dialog} className="quote-sheet" aria-labelledby="quote-sheet-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false) }}>
      <form method="dialog" onSubmit={event => { event.preventDefault(); openWhatsAppContact(whatsapp) }}>
        <div className="quote-sheet-heading"><div><p>SUA COTAÇÃO</p><h2 id="quote-sheet-title">Sua escolha,<br/>do seu jeito.</h2></div><button type="button" className="quote-sheet-close" onClick={() => setOpen(false)} aria-label="Fechar cotação">×</button></div>
        <div className="quote-sheet-product"><img src={product.image} alt="" width="72" height="72"/><div><strong>{product.name}</strong><span>Modelo e disponibilidade sob consulta</span></div></div>
        <fieldset className="quote-mode"><legend>Como você prefere?</legend>{['Comprar', ...(product.rent ? ['Alugar'] : [])].map(mode => <label key={mode} className={selection.mode === mode ? 'is-active' : ''}><input type="radio" name="quote-mode" value={mode} checked={selection.mode === mode} onChange={() => update({ mode })}/>{mode}</label>)}</fieldset>
        <label className="quote-field">Local de uso<select value={selection.place} onChange={event => setPlace(event.target.value)}><option value="all">Ainda não defini</option>{fitsPlace(product, 'home') && <option value="home">Para cuidar em casa</option>}<option value="clinic">Clínica ou instituição</option></select></label>
        <div className="quote-field-row"><label className="quote-field">Tempo de uso previsto<input maxLength="80" value={selection.period} onChange={event => update({ period: event.target.value })} placeholder="Ex.: 30 dias ou contínuo"/></label><label className="quote-field">Cidade de entrega<input autoComplete="address-level2" maxLength="100" value={city} onChange={event => setCity(event.target.value)} placeholder="Cidade / UF"/></label></div>
        {selection.place === 'home' && <label className="quote-field">Como é o acesso ao ambiente?<input maxLength="200" value={access} onChange={event => setAccess(event.target.value)} placeholder="Ex.: térreo, escadas ou elevador"/></label>}
        {selection.place === 'clinic' && <label className="quote-field">Quantidade de equipamentos<input type="number" min="1" max="999" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>}
        <button type="submit" className="yr3-button quote-submit">Continuar no WhatsApp <span aria-hidden="true">→</span></button>
        <p className="quote-sheet-note">Você revisa a mensagem antes de enviar. Valores, medidas e entrega são confirmados com a equipe.</p>
      </form>
    </dialog>
  </>
}
