import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger, prefersReducedMotion } from '../motion.js'
import { markItem, markRoom } from '../explorationStore.js'
import { setFabHidden } from '../ui/WhatsAppFab.jsx'
import WaButton from '../ui/WaButton.jsx'
import { waLink, WA_MESSAGES } from '../whatsapp.js'
import { openWhatsAppContact } from '../../whatsappContact.js'
import { AR_MODELS, CLINICAL_PRESETS, liftToHeightMeters, REST_POSE } from '../../bed3d/specs.js'
import { ROOM_INFO, ROOM_ORDER } from './roomData.js'

// Three.js, diorama 3D e modal AR são carregados SOB DEMANDA.
const MiniatureHouseCanvas = lazy(() => import('./MiniatureHouseCanvas.jsx'))
const ArModal = lazy(() => import('../../bed3d/ArModal.jsx'))

function detectArPlatform() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/** Planta baixa SVG arquitetônica usada enquanto o 3D carrega (ou se WebGL falhar). */
function FloorplanFallback({ onSelectRoom }) {
  return (
    <div className="v2-floorplan" role="region" aria-label="Planta interativa da casa em miniatura">
      <svg viewBox="0 0 640 420" className="v2-floorplan__svg" aria-hidden="true">
        <rect x="28" y="28" width="584" height="364" rx="22" fill="#ece6da" stroke="#071d35" strokeWidth="4" />
        {/* Quarto */}
        <rect x="44" y="44" width="292" height="332" rx="12" fill="#e5d0b3" />
        <rect x="92" y="138" width="186" height="94" rx="12" fill="#17695a" stroke="#071d35" strokeWidth="3" />
        <rect x="96" y="148" width="38" height="74" rx="8" fill="#f7f2ea" />
        {/* Banheiro */}
        <rect x="350" y="44" width="246" height="162" rx="12" fill="#d9eae6" />
        <rect x="488" y="64" width="88" height="88" rx="10" fill="#edf6f4" stroke="#0f766e" strokeWidth="2.5" strokeDasharray="6 5" />
        {/* Sala */}
        <rect x="350" y="218" width="246" height="158" rx="12" fill="#e8dcc8" />
        <rect x="404" y="246" width="132" height="44" rx="10" fill="#18385c" />
        <circle cx="470" cy="332" r="24" fill="#6b4f3a" opacity=".7" />
      </svg>
      <div className="v2-floorplan__btns">
        {ROOM_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className="v2-hotspot is-static"
            data-hotspot-room={id}
            onClick={() => onSelectRoom(id)}
          >
            <span className="v2-hotspot__dot" aria-hidden="true" />
            <span className="v2-hotspot__tag">
              <strong>{ROOM_INFO[id].name}</strong>
              <small>{ROOM_INFO[id].badge}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Ato2() {
  const sectionRef = useRef(null)
  const deliveryTriggerRef = useRef(null)
  const iosArLinkRef = useRef(null)
  const modelViewerRef = useRef(null)
  const deliveryTweenRef = useRef(null)

  const [shouldLoad3D, setShouldLoad3D] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)

  const [activeRoom, setActiveRoom] = useState(null)
  const [bedMode, setBedMode] = useState('eletrica')
  const [bedPose, setBedPose] = useState(REST_POSE)
  const [liveHeightCm, setLiveHeightCm] = useState(() => Math.round(liftToHeightMeters(REST_POSE.lift) * 100))
  const [showDimensions, setShowDimensions] = useState(false)
  const [showPneumatic, setShowPneumatic] = useState(false)

  const [deliveryProgress, setDeliveryProgress] = useState(0)
  const [deliveryMode, setDeliveryMode] = useState(false)

  const [arModalOpen, setArModalOpen] = useState(false)
  const [androidAr, setAndroidAr] = useState(false)
  const [arSessionActive, setArSessionActive] = useState(false)

  const currentModel = AR_MODELS[bedMode] || AR_MODELS.eletrica

  // Carregamento sob demanda do Three.js quando o Ato 2 se aproxima da viewport
  useEffect(() => {
    const el = sectionRef.current
    if (!el || shouldLoad3D) return undefined
    if (!('IntersectionObserver' in window)) {
      setShouldLoad3D(true)
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad3D(true)
          io.disconnect()
        }
      },
      { rootMargin: '550px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shouldLoad3D])

  // Android AR: carrega <model-viewer> (290 KiB) SOMENTE quando o usuário abre o Quarto
  useEffect(() => {
    if (activeRoom !== 'quarto') return
    if (detectArPlatform() !== 'android') return
    setAndroidAr(true)
    if (window.customElements?.get('model-viewer')) return
    if (document.querySelector('script[data-model-viewer]')) return
    const s = document.createElement('script')
    s.type = 'module'
    s.src = '/vendor/model-viewer-4.4.0.min.js'
    s.dataset.modelViewer = '1'
    document.head.appendChild(s)
  }, [activeRoom])

  useEffect(() => {
    const mv = modelViewerRef.current
    if (!androidAr || !mv) return undefined
    const onStatus = (e) => {
      const status = e.detail?.status
      if (status === 'session-started' || status === 'object-placed') setArSessionActive(true)
      if (status === 'not-presenting') setArSessionActive(false)
      if (status === 'failed') {
        setArSessionActive(false)
        setArModalOpen(true)
      }
    }
    mv.addEventListener('ar-status', onStatus)
    return () => mv.removeEventListener('ar-status', onStatus)
  }, [androidAr])

  // Esconde o FAB do WhatsApp durante o Ato 2 em tela cheia (regra do brief)
  useLayoutEffect(() => {
    let hiddenByScroll = false
    const st = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top 30%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (self.isActive !== hiddenByScroll) {
          hiddenByScroll = self.isActive
          setFabHidden(hiddenByScroll)
        }
      },
    })
    return () => {
      st.kill()
      if (hiddenByScroll) setFabHidden(false)
    }
  }, [])

  // Animação de zoom-out na entrada + etapa 7 (caminhão YR e montagem das peças ao rolar)
  useLayoutEffect(() => {
    const mm = gsap.matchMedia(sectionRef)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        '.a2-shell',
        { scale: 1.08, opacity: 0.55 },
        {
          scale: 1,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 95%',
            end: 'top 20%',
            scrub: 0.5,
          },
        },
      )

      // Etapa 7 pelo scroll: quando chega na segunda metade do Ato 2 sem painel aberto,
      // o caminhão da YR entra e monta a cama no quarto!
      ScrollTrigger.create({
        trigger: deliveryTriggerRef.current,
        start: 'top 80%',
        end: 'bottom 92%',
        scrub: 0.4,
        onUpdate: (self) => {
          // Não atropela se o usuário estiver dentro de um cômodo ou rodando replay manual
          if (deliveryTweenRef.current?.isActive()) return
          const p = self.progress
          setDeliveryMode(p > 0.04)
          setDeliveryProgress(p)
        },
      })
    })
    return () => mm.revert()
  }, [])

  const selectRoom = useCallback((roomId) => {
    deliveryTweenRef.current?.kill()
    setDeliveryMode(false)
    setDeliveryProgress(0)
    setActiveRoom(roomId)
    markRoom(roomId)
    if (roomId === 'quarto') {
      markItem(bedMode === 'manual' ? 'Cama manual 3 movimentos' : 'Cama elétrica luxo')
    } else if (roomId === 'banheiro') {
      markItem('Cadeira de banho')
    }
  }, [bedMode])

  const backToHouse = useCallback(() => {
    setActiveRoom(null)
    setShowDimensions(false)
  }, [])

  const switchBedMode = (nextMode) => {
    setBedMode(nextMode)
    markItem(nextMode === 'manual' ? 'Cama manual 3 movimentos' : 'Cama elétrica luxo')
  }

  const togglePneumatic = () => {
    setShowPneumatic((prev) => {
      const next = !prev
      if (next) markItem('Colchão pneumático (compra)')
      return next
    })
  }

  const playDeliveryDemo = () => {
    setActiveRoom(null)
    setShowDimensions(false)
    setDeliveryMode(true)
    deliveryTweenRef.current?.kill()
    if (prefersReducedMotion()) {
      setDeliveryProgress(1)
      return
    }
    const obj = { p: 0.01 }
    deliveryTweenRef.current = gsap.to(obj, {
      p: 1,
      duration: 3.4,
      ease: 'power1.inOut',
      onUpdate: () => setDeliveryProgress(obj.p),
    })
  }

  const launchAR = () => {
    const platform = detectArPlatform()
    if (platform === 'ios' && iosArLinkRef.current) {
      iosArLinkRef.current.click()
      return
    }
    if (platform === 'android' && typeof window !== 'undefined') {
      const mv = modelViewerRef.current
      if (mv && window.customElements?.get('model-viewer') && mv.canActivateAR) {
        mv.activateAR().catch(() => setArModalOpen(true))
        return
      }
      const origin = window.location.origin
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      if (!isLocal) {
        const glbUrl = encodeURIComponent(`${origin}${currentModel.glb}`)
        const title = encodeURIComponent(currentModel.title)
        const fallback = encodeURIComponent(`${origin}${window.location.pathname}?ar=${bedMode}`)
        window.location.href = `intent://arvr.google.com/scene-viewer/1.0?file=${glbUrl}&mode=ar_preferred&resizable=false&title=${title}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`
        return
      }
    }
    setArModalOpen(true)
  }

  const info = activeRoom ? ROOM_INFO[activeRoom] : null

  return (
    <section
      id="ato-2"
      ref={sectionRef}
      className="v2-act v2-act--2 a2-section"
      data-bg="#dfe6e2"
      data-fg="#0b1e33"
      aria-labelledby="a2-title"
    >
      <div className="a2-stage">
        <div className="a2-shell">
          {/* Cabeçalho discreto do diorama */}
          <div className={`a2-top${activeRoom ? ' is-compact' : ''}`}>
            {!activeRoom ? (
              <>
                <p className="v2-eyebrow a2-eyebrow">A casa em miniatura</p>
                <h2 id="a2-title" className="a2-title">
                  {deliveryMode
                    ? 'A YR entrega e monta direto no quarto.'
                    : 'Toque em cada cômodo para explorar.'}
                </h2>
                <p className="a2-hint">
                  {deliveryMode
                    ? deliveryProgress > 0.85
                      ? 'Cama montada e pronta para receber seu familiar.'
                      : 'As peças chegam no caminhão da YR e ganham lugar no quarto.'
                    : 'Arraste na horizontal para girar · Role para continuar'}
                </p>
              </>
            ) : (
              <div className="a2-room-bar">
                <button
                  type="button"
                  className="a2-back-btn"
                  data-act2-back="1"
                  onClick={backToHouse}
                >
                  <span aria-hidden="true">←</span> Voltar pra casa
                </button>
                <span className="a2-room-pill">
                  {info.name} · <em>{info.badge}</em>
                </span>
              </div>
            )}
          </div>

          {/* Palco 3D carregado sob demanda (ou planta interativa como fallback) */}
          <div className="a2-viewport">
            {(!sceneReady || webglFailed) && <FloorplanFallback onSelectRoom={selectRoom} />}
            {shouldLoad3D && !webglFailed && (
              <Suspense fallback={null}>
                <MiniatureHouseCanvas
                  activeRoom={activeRoom}
                  deliveryProgress={deliveryProgress}
                  deliveryMode={deliveryMode && !activeRoom}
                  bedMode={bedMode}
                  bedPose={bedPose}
                  showPneumatic={showPneumatic}
                  showDimensions={showDimensions}
                  onSelectRoom={selectRoom}
                  onLiveHeight={setLiveHeightCm}
                  onReady={() => setSceneReady(true)}
                  onWebGLError={() => setWebglFailed(true)}
                />
              </Suspense>
            )}
          </div>

          {/* Barra rápida inferior (vista geral): acesso fácil no polegar em 412px */}
          {!activeRoom && (
            <div className="a2-dock" role="toolbar" aria-label="Cômodos da casa">
              <div className="a2-dock__rooms">
                {ROOM_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`a2-chip${id === 'sala' ? ' is-muted' : ''}`}
                    onClick={() => selectRoom(id)}
                  >
                    <span className="a2-chip__dot" aria-hidden="true" />
                    {ROOM_INFO[id].name}
                    {id === 'sala' && <small>em breve</small>}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`a2-delivery-btn${deliveryMode ? ' is-active' : ''}`}
                data-act2-delivery="1"
                onClick={playDeliveryDemo}
              >
                {deliveryMode ? '↻ Rever entrega' : 'Ver entrega e montagem'}
              </button>
            </div>
          )}

          {/* Painel do cômodo selecionado */}
          {info && (
            <aside className="a2-panel" aria-label={`Detalhes do cômodo ${info.name}`}>
              <div className="a2-panel__head">
                <div>
                  <span className="a2-panel__badge">{info.badge}</span>
                  <h3>{info.equipmentTitle}</h3>
                </div>
                {info.id === 'quarto' && (
                  <span className="a2-height-tag" aria-live="polite">
                    Altura {liveHeightCm} cm
                  </span>
                )}
              </div>

              <dl className="a2-panel__facts">
                <div>
                  <dt>O que é</dt>
                  <dd>{info.whatIs}</dd>
                </div>
                <div>
                  <dt>Pra que serve</dt>
                  <dd>{info.purpose}</dd>
                </div>
                <div>
                  <dt>Ajuda quem cuida</dt>
                  <dd>{info.caregiverHelp}</dd>
                </div>
              </dl>

              {/* Controles interativos exclusivos do Quarto (reaproveitando cama 3D + medidas + AR) */}
              {info.id === 'quarto' && (
                <div className="a2-bed-controls">
                  <div className="a2-bed-row">
                    <div className="a2-seg" role="group" aria-label="Tipo de cama hospitalar">
                      <button
                        type="button"
                        aria-pressed={bedMode === 'eletrica'}
                        className={bedMode === 'eletrica' ? 'is-active' : ''}
                        onClick={() => switchBedMode('eletrica')}
                      >
                        Elétrica
                      </button>
                      <button
                        type="button"
                        aria-pressed={bedMode === 'manual'}
                        className={bedMode === 'manual' ? 'is-active' : ''}
                        onClick={() => switchBedMode('manual')}
                      >
                        Manual
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`a2-toggle${showDimensions ? ' is-active' : ''}`}
                      data-bed-action="dimensions"
                      aria-pressed={showDimensions}
                      onClick={() => setShowDimensions((v) => !v)}
                    >
                      Medidas
                    </button>

                    <button
                      type="button"
                      className={`a2-toggle${showPneumatic ? ' is-active' : ''}`}
                      aria-pressed={showPneumatic}
                      onClick={togglePneumatic}
                    >
                      + Pneumático
                    </button>
                  </div>

                  <div className="a2-sliders">
                    <label className="a2-slider">
                      <span>Encosto</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(bedPose.back * 100)}
                        onChange={(e) =>
                          setBedPose((p) => ({ ...p, back: Number(e.target.value) / 100 }))
                        }
                      />
                    </label>
                    <label className="a2-slider">
                      <span>Altura</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(bedPose.lift * 100)}
                        onChange={(e) =>
                          setBedPose((p) => ({ ...p, lift: Number(e.target.value) / 100 }))
                        }
                      />
                    </label>
                  </div>

                  <div className="a2-presets" role="group" aria-label="Posições prontas">
                    {CLINICAL_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="a2-preset"
                        onClick={() => setBedPose({ ...preset.pose })}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="a2-panel__actions">
                    <button
                      type="button"
                      className="a2-ar-btn"
                      onClick={launchAR}
                    >
                      Ver no meu quarto (AR)
                    </button>
                    <button
                      type="button"
                      className="a2-back-inline"
                      onClick={backToHouse}
                    >
                      Voltar pra casa
                    </button>
                  </div>
                </div>
              )}

              {info.id === 'banheiro' && (
                <div className="a2-panel__actions">
                  <WaButton
                    message="Olá! Vi a cadeira de banho na casa em miniatura e quero saber como funciona compra ou locação."
                    className="a2-panel__wa"
                  >
                    Consultar cadeira de banho
                  </WaButton>
                </div>
              )}

              {info.id === 'sala' && (
                <div className="a2-panel__actions">
                  <WaButton
                    message={WA_MESSAGES.fab}
                    className="a2-panel__wa"
                  >
                    Tirar dúvida com a YR
                  </WaButton>
                </div>
              )}

              <p className="a2-panel__note">{info.specsNote}</p>
            </aside>
          )}
        </div>
      </div>

      {/* Trilha de rolagem dedicada à etapa 7 (entrega do caminhão + montagem das peças) */}
      <div ref={deliveryTriggerRef} className="a2-delivery-track" aria-hidden="true" />

      {/* AR nativo Android (<model-viewer>) e iOS (Quick Look .usdz) reaproveitados */}
      {androidAr && (
        <model-viewer
          ref={modelViewerRef}
          className={`a2-ar-viewer${arSessionActive ? ' is-presenting' : ''}`}
          src={currentModel.glb}
          ios-src={currentModel.usdz}
          alt={currentModel.title}
          ar={true}
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          loading="lazy"
          reveal="auto"
          shadow-intensity="1"
          interaction-prompt="none"
          inert={arSessionActive ? undefined : ''}
        >
          <span slot="ar-button" hidden />
        </model-viewer>
      )}
      <a
        ref={iosArLinkRef}
        className="v2-sr-only"
        rel="ar"
        href={`${currentModel.usdz}#allowsContentScaling=0`}
        aria-hidden="true"
        tabIndex={-1}
      >
        <img src="/products/cama-yr-02.jpg" alt="" width="1" height="1" />
      </a>

      {arModalOpen && (
        <Suspense fallback={null}>
          <ArModal
            open={arModalOpen}
            onClose={() => setArModalOpen(false)}
            mode={bedMode}
            onQuote={() => {
              openWhatsAppContact(
                waLink(
                  `Olá! Vi a ${currentModel.label.toLowerCase()} em AR no meu quarto e gostaria de pedir uma cotação.`,
                ),
              )
            }}
          />
        </Suspense>
      )}
    </section>
  )
}
