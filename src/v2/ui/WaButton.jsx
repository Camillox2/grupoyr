import { useMagnetic } from './useMagnetic.js'
import { WhatsAppIcon, ArrowIcon } from './icons.jsx'
import { waLink } from '../whatsapp.js'

/**
 * CTA real de WhatsApp: <a target=_blank> para o google-tag registrar a conversão.
 * O wrapper externo pode ser animado por timelines; o magnético mexe só no <a>.
 */
export default function WaButton({ message, children = 'Falar com a YR no WhatsApp', ariaLabel, variant = 'solid', className = '' }) {
  const ref = useMagnetic(0.22)
  return (
    <a
      ref={ref}
      className={`v2-btn v2-btn--wa v2-btn--${variant} ${className}`}
      href={waLink(message)}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel || `${typeof children === 'string' ? children : 'Falar com a YR no WhatsApp'} (abre o WhatsApp em nova aba)`}
      data-cursor="wa"
    >
      <span className="v2-btn__icon"><WhatsAppIcon size={20} /></span>
      <span className="v2-btn__label">{children}</span>
      <span className="v2-btn__arrow"><ArrowIcon /></span>
    </a>
  )
}
