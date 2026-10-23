import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { authHeaders, displayContactName } from '../lib/conversation'
import type { Lead } from '../types'

const requests = new Map<string, { expires: number; value: Promise<Blob | null> }>()
function loadPhoto(key: string, leadId: string) {
  const saved = requests.get(key)
  if (saved && saved.expires > Date.now()) return saved.value
  if (requests.size >= 200) requests.delete(requests.keys().next().value!)
  const value = fetch(`/api/leads/${encodeURIComponent(leadId)}/avatar`, { headers: authHeaders(false), cache: 'no-store', signal: AbortSignal.timeout(45000) })
    .then(response => response.status === 200 && response.headers.get('content-type')?.startsWith('image/webp') ? response.blob() : null).catch(() => null)
  requests.set(key, { expires: Date.now() + 10 * 60000, value })
  return value
}
export function ContactAvatar({ lead, enabled, className = '' }: { lead: Lead; enabled: boolean; className?: string }) {
  const { user } = useAuth()
  const userId = user?.id
  const key = `${userId || 'anonymous'}:${lead.id}:${lead.phone}`
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null)
  useEffect(() => {
    if (!enabled || !userId) return
    let disposed = false, url: string | null = null
    loadPhoto(key, lead.id).then(blob => {
      if (disposed || !blob) return
      url = URL.createObjectURL(blob); setPhoto({ key, url })
    })
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [enabled, key, lead.id, userId])
  const name = displayContactName(lead.name)
  return <div className={`chat-contact-avatar ${className}`} aria-label={`Foto de ${name}`}>
    <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
    {photo?.key === key ? <img src={photo.url} alt={`Foto de perfil de ${name}`} onError={() => setPhoto(null)} /> : null}
  </div>
}
