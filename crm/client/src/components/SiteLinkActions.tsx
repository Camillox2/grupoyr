import React, { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

export const GROUP_YR_SITE_URL = 'https://site.grupoyrhospitalar.com.br/'

const copyText = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Alguns tunnels bloqueiam a Clipboard API; o fallback atende esses casos.
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

interface SiteLinkActionsProps {
  compact?: boolean
}

export const SiteLinkActions: React.FC<SiteLinkActionsProps> = ({ compact = false }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const ok = await copyText(GROUP_YR_SITE_URL)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={GROUP_YR_SITE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[12px] font-extrabold transition-colors"
        style={{ background: 'var(--surface-raised)', color: 'var(--ink)', border: '1px solid var(--border-subtle)' }}
      >
        <ExternalLink className="h-3.5 w-3.5" style={{ color: 'var(--yr-500)' }} />
        {!compact && 'Abrir site'}
        {compact && <span className="hidden sm:inline">Site</span>}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[12px] font-extrabold transition-colors"
        style={{ background: 'var(--yr-050)', color: 'var(--yr-700)', border: '1px solid var(--yr-100)' }}
        aria-label={copied ? 'Link do site copiado' : 'Copiar link do site Grupo YR'}
        title={GROUP_YR_SITE_URL}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copiado' : compact ? <span className="hidden sm:inline">Copiar</span> : 'Copiar link'}
      </button>
    </div>
  )
}
