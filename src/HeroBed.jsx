import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { imageSources } from './responsiveImages.js'
import ArModal, { detectArPlatform } from './bed3d/ArModal.jsx'
import {
  AR_MODELS,
  BED_SPECS,
  CLINICAL_PRESETS,
  liftToHeightMeters,
  REST_POSE,
} from './bed3d/specs.js'

const HospitalBedCanvas = lazy(() => import('./bed3d/HospitalBedCanvas.jsx'))

/**
 * Hero da home: cama hospitalar 3D real em um quarto residencial aconchegante,
 * articulando a 60fps sem re-renders do React na demonstracao automatica +
 * Realidade Aumentada (AR) em escala 1:1.
 */

const SLIDER_STEPS = 1000

const ICONS = {
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18M12 18 5 8" />
    </svg>
  ),
  legs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h9l4-6 5 2" />
    </svg>
  ),
  lift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h16M12 21v-8M8.5 16.5 12 13l3.5 3.5M4 5h16" />
    </svg>
  ),
  ar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="m12 7 4.5 2.6v5.2L12 17.4l-4.5-2.6V9.6L12 7Z" />
      <path d="M12 12.2 16.5 9.6M12 12.2v5.2M12 12.2 7.5 9.6" />
    </svg>
  ),
}

function Slider({ label, hint, inputRef, defaultValue, onChange, onDragStart, onDragEnd, icon }) {
  const initialPct = `${(defaultValue * 100).toFixed(1)}%`
  return (
    <label className="herobed-slider">
      <span className="herobed-slider-icon" aria-hidden="true">{icon}</span>
      <span className="herobed-slider-copy">
        <strong>{label}</strong>
        <em>{hint}</em>
      </span>
      <input
        ref={inputRef}
        type="range"
        min="0"
        max={SLIDER_STEPS}
        defaultValue={Math.round(defaultValue * SLIDER_STEPS)}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onBlur={onDragEnd}
        onInput={(event) => {
          const v = Number(event.target.value) / SLIDER_STEPS
          event.target.style.setProperty('--fill', `${(v * 100).toFixed(2)}%`)
          onChange(v)
        }}
        aria-label={label}
        style={{ '--fill': initialPct }}
      />
    </label>
  )
}

function BedStage3D({ onContact }) {
  const [pose, setPose] = useState(REST_POSE)
  const [activePreset, setActivePreset] = useState(null)
  const [auto, setAuto] = useState(true)
  const [bedMode, setBedMode] = useState('eletrica')
  const [showDimensions, setShowDimensions] = useState(false)
  const [showCaregiverZone, setShowCaregiverZone] = useState(false)
  const [railsDown, setRailsDown] = useState(false)
  const [showPneumatic, setShowPneumatic] = useState(false)
  const [clientMounted, setClientMounted] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)
  const [hasOrbited, setHasOrbited] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [arModalOpen, setArModalOpen] = useState(false)
  const [arPromptHighlight, setArPromptHighlight] = useState(false)

  const iosArLinkRef = useRef(null)
  const livePoseRef = useRef({ ...REST_POSE })
  const draggingKeyRef = useRef(null)
  const backInputRef = useRef(null)
  const legsInputRef = useRef(null)
  const liftInputRef = useRef(null)
  const heightPillRef = useRef(null)
  const lastHeightCmRef = useRef(Math.round(liftToHeightMeters(REST_POSE.lift) * 100))

  const currentModel = AR_MODELS[bedMode] || AR_MODELS.eletrica

  // Monta o motor 3D apenas no cliente (mantem SSR/prerender instantaneo)
  useEffect(() => {
    setClientMounted(true)
    const params = new URLSearchParams(window.location.search)
    const arParam = params.get('ar')
    if (arParam === 'manual' || arParam === 'eletrica') {
      setBedMode(arParam)
      setArPromptHighlight(true)
    }
  }, [])

  /**
   * Atualiza os 3 sliders e o badge de altura direto no DOM a 60fps
   * (zero re-renders do React -> animacao completamente lisa!).
   */
  const syncSliderDom = useCallback((inputEl, value) => {
    if (!inputEl) return
    const nextVal = String(Math.round(value * SLIDER_STEPS))
    if (inputEl.value !== nextVal) inputEl.value = nextVal
    inputEl.style.setProperty('--fill', `${(value * 100).toFixed(2)}%`)
  }, [])

  const handleLivePose = useCallback(
    (livePose, heightCm) => {
      livePoseRef.current.back = livePose.back
      livePoseRef.current.legs = livePose.legs
      livePoseRef.current.lift = livePose.lift

      if (draggingKeyRef.current !== 'back') syncSliderDom(backInputRef.current, livePose.back)
      if (draggingKeyRef.current !== 'legs') syncSliderDom(legsInputRef.current, livePose.legs)
      if (draggingKeyRef.current !== 'lift') syncSliderDom(liftInputRef.current, livePose.lift)

      if (heightPillRef.current && heightCm !== lastHeightCmRef.current) {
        lastHeightCmRef.current = heightCm
        heightPillRef.current.textContent = `Altura ${heightCm} cm`
      }
    },
    [syncSliderDom],
  )

  const drive = (key) => (value) => {
    setAuto(false)
    setActivePreset(null)
    // Parte exatamente da pose visivel atual (sem pulo ao assumir o controle!)
    const next = { ...livePoseRef.current, [key]: value }
    livePoseRef.current = next
    setPose(next)
  }

  const applyPreset = (preset) => {
    setAuto(false)
    setActivePreset(preset.id)
    setPose({ ...preset.pose })
  }

  const toggleAuto = () => {
    setActivePreset(null)
    setAuto((currentlyAuto) => {
      if (currentlyAuto) {
        // Ao pausar, fixa na pose exata onde a cama esta naquele milissegundo
        setPose({ ...livePoseRef.current })
      }
      return !currentlyAuto
    })
  }

  const handleOrbitInteract = useCallback(() => {
    setHasOrbited(true)
  }, [])

  const handleSceneReady = useCallback(() => {
    setSceneReady(true)
  }, [])

  const handleWebGLError = useCallback(() => {
    setWebglFailed(true)
  }, [])

  const launchAR = () => {
    setArPromptHighlight(false)
    const platform = detectArPlatform()
    if (platform === 'ios' && iosArLinkRef.current) {
      iosArLinkRef.current.click()
      return
    }
    if (platform === 'android' && typeof window !== 'undefined') {
      const origin = window.location.origin
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      if (!isLocal) {
        const glbUrl = encodeURIComponent(`${origin}${currentModel.glb}`)
        const title = encodeURIComponent(currentModel.title)
        const fallback = encodeURIComponent(window.location.href)
        window.location.href = `intent://arvr.google.com/scene-viewer/1.0?file=${glbUrl}&mode=ar_preferred&resizable=false&title=${title}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`
        return
      }
    }
    setArModalOpen(true)
  }

  const posterSrc = bedMode === 'manual' ? '/products/cama-manual-yr-04.jpg' : '/products/cama-yr-02.jpg'
  const initialHeightCm = Math.round(liftToHeightMeters(REST_POSE.lift) * 100)

  return (
    <div className="herobed-play">
      <div className={`herobed-scene ${sceneReady ? 'is-3d-ready' : ''}`}>
        {/* Poster imediato para SSR/LCP rapido e fallback sem WebGL */}
        <img
          className="herobed-poster"
          src={posterSrc}
          {...imageSources(posterSrc, '(max-width: 900px) calc(100vw - 36px), 600px')}
          width="1280"
          height="960"
          fetchPriority="high"
          alt="Cama hospitalar articulada Grupo YR Hospitalar"
        />

        {/* Motor 3D em quarto residencial carregado sob demanda */}
        {clientMounted && !webglFailed && (
          <Suspense fallback={null}>
            <HospitalBedCanvas
              pose={pose}
              auto={auto}
              mode={bedMode}
              showPneumatic={showPneumatic}
              railsDown={railsDown}
              showDimensions={showDimensions}
              showCaregiverZone={showCaregiverZone}
              resetSignal={resetSignal}
              onLivePose={handleLivePose}
              onInteract={handleOrbitInteract}
              onReady={handleSceneReady}
              onWebGLError={handleWebGLError}
            />
          </Suspense>
        )}

        {/* Canto superior esquerdo: dica 360° ou botao centralizar */}
        <div className="herobed-badge-left">
          {hasOrbited ? (
            <button
              type="button"
              className="herobed-hud-pill"
              onClick={() => {
                setResetSignal((n) => n + 1)
                setHasOrbited(false)
              }}
            >
              ↻ Centralizar visão
            </button>
          ) : (
            <span className="herobed-hud-pill herobed-hud-pill--static">
              360° · Arraste para girar
            </span>
          )}
        </div>

        {/* Canto superior direito: Botao AR em escala real 1:1 */}
        <button
          type="button"
          className={`herobed-ar-btn ${arPromptHighlight ? 'is-pulsing' : ''}`}
          onClick={launchAR}
          aria-label="Ver cama hospitalar em tamanho real no seu quarto com Realidade Aumentada"
        >
          {ICONS.ar}
          <span>
            <strong>AR</strong>
            <small>Ver no quarto</small>
          </span>
        </button>

        {/* Link nativo oculto para Apple AR Quick Look (iOS exige <a rel="ar"> com <img>) */}
        <a
          ref={iosArLinkRef}
          className="sr-only"
          rel="ar"
          href={`${currentModel.usdz}#allowsContentScaling=0`}
          aria-hidden="true"
          tabIndex={-1}
        >
          <img src="/products/cama-yr-02.jpg" alt="" width="1" height="1" />
        </a>
      </div>

      {/* Barra de opcoes do 3D: flutuante no desktop e encaixada abaixo do 3D no celular */}
      <div className="herobed-stage-bar" role="toolbar" aria-label="Opções do modelo 3D">
        <div className="herobed-mode-switch" role="group" aria-label="Modelo da cama">
          <button
            type="button"
            aria-pressed={bedMode === 'eletrica'}
            className={bedMode === 'eletrica' ? 'is-active' : ''}
            onClick={() => setBedMode('eletrica')}
          >
            Elétrica
          </button>
          <button
            type="button"
            aria-pressed={bedMode === 'manual'}
            className={bedMode === 'manual' ? 'is-active' : ''}
            onClick={() => setBedMode('manual')}
          >
            Manual
          </button>
        </div>

        <button
          type="button"
          className={`herobed-chip ${showDimensions ? 'is-active' : ''}`}
          aria-pressed={showDimensions}
          onClick={() => setShowDimensions((v) => !v)}
        >
          Medidas
        </button>

        <button
          type="button"
          className={`herobed-chip ${showCaregiverZone ? 'is-active' : ''}`}
          aria-pressed={showCaregiverZone}
          onClick={() => setShowCaregiverZone((v) => !v)}
        >
          Espaço cuidador
        </button>

        <button
          type="button"
          className={`herobed-chip ${railsDown ? 'is-active' : ''}`}
          aria-pressed={railsDown}
          onClick={() => setRailsDown((v) => !v)}
        >
          {railsDown ? 'Subir grade' : 'Abaixar grade'}
        </button>

        <button
          type="button"
          className={`herobed-chip ${showPneumatic ? 'is-active' : ''}`}
          aria-pressed={showPneumatic}
          onClick={() => setShowPneumatic((v) => !v)}
        >
          + Pneumático
        </button>
      </div>

      {/* Controle tatil integrado logo abaixo do quarto 3D */}
      <div className="herobed-remote">
        <div className="herobed-remote-head">
          <div className="herobed-remote-title">
            <strong>Mexa na cama em 3D</strong>
            <span className="herobed-height-pill" ref={heightPillRef} aria-live="polite">
              Altura {initialHeightCm} cm
            </span>
          </div>
          <button type="button" onClick={toggleAuto} aria-pressed={auto}>
            {auto ? 'Pausar' : 'Demonstração'}
          </button>
        </div>

        <div className="herobed-presets" role="group" aria-label="Posições prontas da cama">
          {CLINICAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activePreset === preset.id}
              className={activePreset === preset.id ? 'is-active' : ''}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <Slider
          label="Encosto"
          hint="para comer, ler, respirar melhor"
          inputRef={backInputRef}
          defaultValue={REST_POSE.back}
          onChange={drive('back')}
          onDragStart={() => { draggingKeyRef.current = 'back' }}
          onDragEnd={() => { draggingKeyRef.current = null }}
          icon={ICONS.back}
        />
        <Slider
          label="Pernas"
          hint="alivia a lombar e o inchaço"
          inputRef={legsInputRef}
          defaultValue={REST_POSE.legs}
          onChange={drive('legs')}
          onDragStart={() => { draggingKeyRef.current = 'legs' }}
          onDragEnd={() => { draggingKeyRef.current = null }}
          icon={ICONS.legs}
        />
        <Slider
          label="Altura"
          hint="poupa a coluna de quem cuida"
          inputRef={liftInputRef}
          defaultValue={REST_POSE.lift}
          onChange={drive('lift')}
          onDragStart={() => { draggingKeyRef.current = 'lift' }}
          onDragEnd={() => { draggingKeyRef.current = null }}
          icon={ICONS.lift}
        />

        <p className="herobed-note">
          Leito interno {BED_SPECS.internalLength.toFixed(2).replace('.', ',')} m ×{' '}
          {BED_SPECS.internalWidth.toFixed(2).replace('.', ',')} m · altura padrão 66 cm (ajustável).
          Confirme o modelo exato na cotação.
        </p>
      </div>

      <ArModal
        open={arModalOpen}
        onClose={() => setArModalOpen(false)}
        mode={bedMode}
        onQuote={() => onContact?.('Orientação')}
      />
    </div>
  )
}

export default function HeroBed({ onContact }) {
  return (
    <section className="herobed" id="inicio">
      <div className="herobed-inner">
        <div className="herobed-copy">
          <p className="herobed-eyebrow">
            <span className="herobed-dot" aria-hidden="true" />
            Locação e venda · Curitiba e região
          </p>
          <h1>
            Cama hospitalar em casa,{' '}
            <span className="herobed-mark">
              entregue e montada.
              <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 9 C 60 2, 120 13, 180 6 S 270 4, 297 8" />
              </svg>
            </span>
          </h1>
          <p className="herobed-lede">
            Alugue ou compre cama hospitalar, colchão pneumático e cadeira de banho. A equipe leva,
            monta no quarto e explica o uso. Teste a cama em 3D ou projete em tamanho real no seu
            quarto pelo botão AR.
          </p>
          <div className="herobed-actions">
            <button className="yr3-button herobed-cta" onClick={() => onContact?.('Orientação')}>
              Pedir cotação <span aria-hidden="true">→</span>
            </button>
            <a className="yr3-button yr3-button--soft" href="#produtos">Ver equipamentos</a>
          </div>
          <ul className="herobed-proof">
            <li>Entrega e montagem</li>
            <li>Compra ou locação</li>
            <li>Retirada no fim do uso</li>
          </ul>
        </div>
        <BedStage3D onContact={onContact} />
      </div>
    </section>
  )
}
