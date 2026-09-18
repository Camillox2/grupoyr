import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

export type ToastTone = 'ok' | 'alert' | 'wait'

export interface ToastData {
  tone: ToastTone
  message: string
  /** Botao opcional dentro do aviso ("Abrir conversa"). */
  action?: { label: string; onClick: () => void }
}

const ICON = { ok: CircleCheck, alert: CircleAlert, wait: Info }

/**
 * Aviso flutuante, preso ao canto da tela.
 *
 * Existe porque o aviso antigo entrava no TOPO da pagina: empurrava a tela
 * inteira para baixo ao aparecer e puxava de volta ao sumir. Este fica fora
 * do fluxo (position: fixed), entao nada se mexe.
 */
export const Toast: React.FC<{ toast: ToastData | null; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  if (!toast) return null
  const Icon = ICON[toast.tone]
  return (
    <div className="toast-layer" role={toast.tone === 'alert' ? 'alert' : 'status'} aria-live="polite">
      <div className="toast" data-tone={toast.tone}>
        <Icon className="mt-px h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button type="button" onClick={onDismiss} className="toast-close" aria-label="Fechar aviso">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Estado do aviso com sumico automatico (mais tempo quando ha botao). */
export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback((next: ToastData) => {
    window.clearTimeout(timer.current)
    setToast(next)
    timer.current = window.setTimeout(() => setToast(null), next.action ? 9000 : 5000)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { toast, show, dismiss }
}
