import { useEffect, useId, useRef, useState } from 'react'
import { AR_MODELS, BED_SPECS } from './specs.js'

/** Detecta a plataforma para acionar o visualizador AR nativo correto. */
export function detectArPlatform() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * Modal nativo `<dialog>` para orientar a visualizacao em Realidade Aumentada
 * no desktop (via QR Code) ou quando o dispositivo precisa de instrucoes.
 *
 * Segue as diretrizes modernas de `<dialog>`: `showModal()`, `closedby="any"`
 * com fallback para Safari (pointerdown/pointerup fora do retangulo do modal),
 * e reset de `returnValue` no evento `close`.
 */
export default function ArModal({ open, onClose, mode = 'eletrica', onQuote }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const [qrSvg, setQrSvg] = useState('')
  const [arUrl, setArUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [isLocalhost, setIsLocalhost] = useState(false)

  const model = AR_MODELS[mode] || AR_MODELS.eletrica

  // Abre/fecha o <dialog> nativamente com showModal()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Sincroniza fechamento (Esc, botao fechar, light dismiss) e fallback Safari closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    const handleClose = () => {
      dialog.returnValue = ''
      onClose?.()
    }
    dialog.addEventListener('close', handleClose)

    let cleanupFallback
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false
      const isOutside = (event) => {
        const rect = dialog.getBoundingClientRect()
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
      }
      const onDown = (event) => {
        pressedOutside = isOutside(event)
      }
      const onUp = (event) => {
        if (pressedOutside && isOutside(event)) dialog.close()
      }
      dialog.addEventListener('pointerdown', onDown)
      dialog.addEventListener('pointerup', onUp)
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onDown)
        dialog.removeEventListener('pointerup', onUp)
      }
    }

    return () => {
      dialog.removeEventListener('close', handleClose)
      cleanupFallback?.()
    }
  }, [onClose])

  // Gera o QR Code localmente (sem servicos externos) apenas quando o modal abre
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    let active = true
    const url = new URL(window.location.href)
    url.searchParams.set('ar', mode)
    url.hash = 'inicio'
    const href = url.toString()
    setArUrl(href)
    setIsLocalhost(['localhost', '127.0.0.1'].includes(window.location.hostname))

    import('qrcode')
      .then((QRCode) =>
        QRCode.toString(href, {
          type: 'svg',
          margin: 1,
          width: 204,
          color: { dark: '#102a4c', light: '#ffffff' },
        }),
      )
      .then((svg) => {
        if (active) setQrSvg(svg)
      })
      .catch(() => {
        if (active) setQrSvg('')
      })

    return () => {
      active = false
    }
  }, [open, mode])

  const copyLink = async () => {
    if (!arUrl || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(arUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* Clipboard optional */
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="ar-dialog"
      closedby="any"
      aria-labelledby={titleId}
    >
      <div className="ar-dialog-inner">
        <div className="ar-dialog-head">
          <div>
            <span className="ar-dialog-kicker">Realidade Aumentada · Escala real 1:1</span>
            <h1 id={titleId} className="ar-dialog-title">
              Veja a cama no seu quarto
            </h1>
          </div>
          <form method="dialog">
            <button
              type="submit"
              className="ar-dialog-close"
              aria-label="Fechar janela de Realidade Aumentada"
              autoFocus
            >
              ×
            </button>
          </form>
        </div>

        <div className="ar-dialog-body">
          <div className="ar-dialog-qr-box">
            {qrSvg ? (
              <div
                className="ar-dialog-qr"
                role="img"
                aria-label="QR Code para abrir a cama hospitalar em Realidade Aumentada no celular"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="ar-dialog-qr ar-dialog-qr--loading">Gerando QR Code…</div>
            )}
            <p className="ar-dialog-qr-caption">
              Aponte a câmera do <strong>iPhone ou Android</strong> para projetar a{' '}
              <strong>{model.label.toLowerCase()}</strong> direto no chão do quarto.
            </p>
          </div>

          <div className="ar-dialog-info">
            <h2>Medidas reais projetadas no AR</h2>
            <ul className="ar-dialog-specs">
              <li>
                <span>Leito interno</span>
                <strong>
                  {BED_SPECS.internalLength.toFixed(2).replace('.', ',')} m ×{' '}
                  {BED_SPECS.internalWidth.toFixed(2).replace('.', ',')} m
                </strong>
              </li>
              <li>
                <span>Espaço total (c/ cabeceira e grades)</span>
                <strong>
                  ~{BED_SPECS.externalLength.toFixed(2).replace('.', ',')} m ×{' '}
                  {BED_SPECS.externalWidth.toFixed(2).replace('.', ',')} m
                </strong>
              </li>
              <li>
                <span>Altura do leito</span>
                <strong>66 cm (ajustável de 48 a 75 cm)</strong>
              </li>
              <li>
                <span>Folga recomendada p/ cuidador</span>
                <strong>+60 cm nas laterais</strong>
              </li>
            </ul>

            {isLocalhost && (
              <p className="ar-dialog-local-note">
                Você está em <code>localhost</code>. Para testar no celular agora, acesse pelo IP da
                rede Wi-Fi ou quando publicar no domínio oficial.
              </p>
            )}

            <div className="ar-dialog-files">
              <a
                className="ar-dialog-chip"
                rel="ar"
                href={`${model.usdz}#allowsContentScaling=0`}
              >
                Arquivo iPhone (.usdz)
              </a>
              <a className="ar-dialog-chip" href={model.glb} download>
                Arquivo Android / 3D (.glb)
              </a>
              <button type="button" className="ar-dialog-chip" onClick={copyLink}>
                {copied ? 'Link copiado ✓' : 'Copiar link AR'}
              </button>
            </div>
          </div>
        </div>

        <div className="ar-dialog-foot">
          <p>A escala fica travada em 100% real para você conferir portas e circulação.</p>
          <button
            type="button"
            className="yr3-button"
            onClick={() => {
              dialogRef.current?.close()
              onQuote?.()
            }}
          >
            Coube no quarto? Pedir cotação →
          </button>
        </div>
      </div>
    </dialog>
  )
}
