// All programmatic WhatsApp departures pass here; opening a form is not a conversion.
export function openWhatsAppContact(url) {
  const result = window.open(url, '_blank', 'noopener,noreferrer')
  try {
    const destination = new URL(url, window.location.href)
    const phone = destination.searchParams.get('phone')
    destination.search = ''
    destination.hash = ''
    if (phone) destination.searchParams.set('phone', phone)
    document.dispatchEvent(new CustomEvent('yr:whatsapp-contact', { detail: { url: destination.href } }))
  } catch { /* Tracking must never interfere with the already requested contact. */ }
  return result
}
