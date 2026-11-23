import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { gsap, prefersReducedMotion } from '../motion.js'
import { buildDioramaHouse } from './buildDioramaHouse.js'
import { REST_POSE } from '../../bed3d/specs.js'

/**
 * Palco WebGL interativo do Ato 2 (A casa em miniatura).
 * Carregado sob demanda via React.lazy somente quando o Ato 2 se aproxima.
 *
 * - Versão simplificada no celular (pixelRatio <= 1.25, sombras leves, sem PMREM pesado).
 * - Arraste horizontal com 1 dedo gira suavemente a maquete; rolagem vertical
 *   permanece 100% nativa (touch-action: pan-y) e NUNCA trava.
 * - Transições de câmera com GSAP ao entrar em cada cômodo ou voltar pra casa.
 */
export default function MiniatureHouseCanvas({
  activeRoom = null,
  deliveryProgress = 0,
  deliveryMode = false,
  bedMode = 'eletrica',
  bedPose = REST_POSE,
  showPneumatic = false,
  showDimensions = false,
  onSelectRoom,
  onLiveHeight,
  onReady,
  onWebGLError,
}) {
  const hostRef = useRef(null)
  const onSelectRoomRef = useRef(onSelectRoom)
  const onLiveHeightRef = useRef(onLiveHeight)
  onSelectRoomRef.current = onSelectRoom
  onLiveHeightRef.current = onLiveHeight

  const stateRef = useRef({
    activeRoom,
    deliveryProgress,
    deliveryMode,
    bedMode,
    targetPose: { ...bedPose },
    currentPose: { ...bedPose },
    showPneumatic,
    showDimensions,
    targetYaw: 0,
    currentYaw: 0,
  })
  const apiRef = useRef(null)
  const camRef = useRef({ camera: null, target: new THREE.Vector3(), tween: null })

  // Sincroniza props sem recriar contexto WebGL
  useEffect(() => {
    stateRef.current.bedMode = bedMode
    apiRef.current?.bed.setMode(bedMode)
  }, [bedMode])

  useEffect(() => {
    stateRef.current.targetPose = { ...bedPose }
  }, [bedPose])

  useEffect(() => {
    stateRef.current.showPneumatic = showPneumatic
    apiRef.current?.bed.setPneumatic(showPneumatic)
  }, [showPneumatic])

  useEffect(() => {
    stateRef.current.showDimensions = showDimensions
    apiRef.current?.overlays.setOptions({
      showDimensions: showDimensions && stateRef.current.activeRoom === 'quarto',
      showCaregiverZone: false,
    })
  }, [showDimensions, activeRoom])

  useEffect(() => {
    stateRef.current.deliveryProgress = deliveryProgress
    apiRef.current?.setDeliveryProgress(deliveryProgress)
  }, [deliveryProgress])

  function computeFramedCamera(api, camera, activeRm, delivMode) {
    const key = activeRm || (delivMode ? 'delivery' : 'overview')
    const preset = api.cameraPresets[key] || api.cameraPresets.overview
    const aspect = camera.aspect || 1
    const isPortrait = aspect < 0.85

    const nextTarget = preset.target.clone()
    let zoomFactor = 1.0

    if (!activeRm && !delivMode) {
      zoomFactor = isPortrait ? 1.56 : 1.04
      if (isPortrait) nextTarget.set(0.12, 0.15, 0.28)
    } else if (delivMode && !activeRm) {
      zoomFactor = isPortrait ? 1.48 : 1.04
      if (isPortrait) nextTarget.set(-0.55, 0.35, 1.15)
    } else {
      // Cômodo em foco:
      // - No retrato (412px), o painel fica na metade inferior -> abaixa target.y para subir o objeto no topo!
      // - No desktop (painel à direita), desloca levemente target para a direita para centralizar à esquerda.
      zoomFactor = isPortrait ? 1.54 : 1.12
      if (isPortrait) {
        nextTarget.y -= 0.44
      } else if (aspect > 1.2) {
        nextTarget.x += 0.32
      }
    }

    const offset = preset.pos.clone().sub(preset.target).multiplyScalar(zoomFactor)
    const nextPos = nextTarget.clone().add(offset)
    return { nextPos, nextTarget }
  }

  // Transição suave de câmera quando muda o cômodo ou entra na entrega
  useEffect(() => {
    stateRef.current.activeRoom = activeRoom
    stateRef.current.deliveryMode = deliveryMode
    const api = apiRef.current
    const { camera, target } = camRef.current
    if (!api || !camera) return

    const { nextPos, nextTarget } = computeFramedCamera(api, camera, activeRoom, deliveryMode)

    // Reseta giro manual ao focar um cômodo para o enquadramento ficar exato
    stateRef.current.targetYaw = 0

    camRef.current.tween?.kill()
    const dur = prefersReducedMotion() ? 0.01 : 0.78
    const tl = gsap.timeline({ defaults: { duration: dur, ease: 'power3.inOut' } })
    tl.to(camera.position, { x: nextPos.x, y: nextPos.y, z: nextPos.z }, 0)
      .to(target, { x: nextTarget.x, y: nextTarget.y, z: nextTarget.z }, 0)
    camRef.current.tween = tl
  }, [activeRoom, deliveryMode])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return undefined

    const isMobile = window.innerWidth < 768
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch (err) {
      onWebGLError?.(err)
      return undefined
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'v2-diorama-webgl'
    renderer.domElement.style.touchAction = 'pan-y'
    renderer.domElement.setAttribute(
      'aria-label',
      'Maquete 3D interativa de uma casa com quarto, banheiro e sala. Arraste na horizontal para girar.',
    )
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()

    // Iluminação suave de maquete arquitetônica
    const hemi = new THREE.HemisphereLight(0xfffbf4, 0x8da4a0, 1.05)
    scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.9)
    keyLight.position.set(5.5, 9.2, 4.8)
    keyLight.castShadow = true
    const shadowSize = isMobile ? 512 : 1024
    keyLight.shadow.mapSize.set(shadowSize, shadowSize)
    keyLight.shadow.camera.near = 1
    keyLight.shadow.camera.far = 22
    keyLight.shadow.camera.left = -6
    keyLight.shadow.camera.right = 6
    keyLight.shadow.camera.top = 6
    keyLight.shadow.camera.bottom = -6
    keyLight.shadow.bias = -0.0004
    keyLight.shadow.normalBias = 0.03
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xdbeefe, 0.65)
    fillLight.position.set(-5.5, 4.5, -3.5)
    scene.add(fillLight)

    // Maquete 3D
    const diorama = buildDioramaHouse({ simplified: isMobile })
    scene.add(diorama.root)
    apiRef.current = diorama

    // Aplica estado inicial
    diorama.bed.setMode(stateRef.current.bedMode)
    diorama.bed.setPneumatic(stateRef.current.showPneumatic)
    diorama.overlays.setOptions({
      showDimensions: stateRef.current.showDimensions && stateRef.current.activeRoom === 'quarto',
      showCaregiverZone: false,
    })
    diorama.setDeliveryProgress(stateRef.current.deliveryProgress)

    const width = Math.max(container.clientWidth, 300)
    const height = Math.max(container.clientHeight, 320)
    const camera = new THREE.PerspectiveCamera(width / height < 0.85 ? 42 : 34, width / height, 0.2, 45)
    const initFramed = computeFramedCamera(diorama, camera, stateRef.current.activeRoom, stateRef.current.deliveryMode)
    const target = initFramed.nextTarget.clone()
    camera.position.copy(initFramed.nextPos)
    camera.lookAt(target)
    camRef.current = { camera, target, tween: null }

    // Arraste horizontal leve (1 dedo no mobile, mouse no desktop) — rolagem vertical 100% livre
    let dragging = false
    let startX = 0
    let startY = 0
    let lastX = 0
    let lockedHorizontal = false

    const onDown = (e) => {
      if (e.button && e.button !== 0) return
      dragging = true
      lockedHorizontal = false
      startX = lastX = e.clientX
      startY = e.clientY
    }
    const onMove = (e) => {
      if (!dragging) return
      const dxTotal = e.clientX - startX
      const dyTotal = e.clientY - startY
      if (!lockedHorizontal) {
        if (Math.abs(dyTotal) > Math.abs(dxTotal) && Math.abs(dyTotal) > 8) {
          // Usuário está rolando verticalmente: solta imediatamente
          dragging = false
          return
        }
        if (Math.abs(dxTotal) > 6) lockedHorizontal = true
        else return
      }
      const dx = e.clientX - lastX
      lastX = e.clientX
      const limit = stateRef.current.activeRoom ? 0.32 : 0.58
      stateRef.current.targetYaw = THREE.MathUtils.clamp(
        stateRef.current.targetYaw + dx * 0.0045,
        -limit,
        limit,
      )
    }
    const onUp = () => {
      dragging = false
      lockedHorizontal = false
    }

    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })

    // Camada HTML de hotspots pulsando sobre os cômodos
    const hotspotLayer = document.createElement('div')
    hotspotLayer.className = 'v2-hotspots-layer'
    container.appendChild(hotspotLayer)

    const hotspotItems = diorama.hotspots.map((hs) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `v2-hotspot${hs.id === 'sala' ? ' is-soon' : ''}`
      btn.dataset.hotspotRoom = hs.id
      btn.style.visibility = 'hidden'
      btn.setAttribute('aria-label', `Explorar ${hs.label}: ${hs.sub}`)
      btn.innerHTML = `<span class="v2-hotspot__dot" aria-hidden="true"></span><span class="v2-hotspot__tag"><strong>${hs.label}</strong><small>${hs.sub}</small></span>`
      btn.addEventListener('click', () => onSelectRoomRef.current?.(hs.id))
      hotspotLayer.appendChild(btn)
      return { hs, btn }
    })

    // Camada HTML dos rótulos de medidas reais (reaproveitados do buildOverlays3d)
    const dimLayer = document.createElement('div')
    dimLayer.className = 'v2-dim-layer'
    dimLayer.setAttribute('aria-hidden', 'true')
    container.appendChild(dimLayer)

    const dimItems = diorama.overlays.labels.map((lb) => {
      const el = document.createElement('div')
      el.className = `v2-dim-label is-${lb.tone}`
      el.innerHTML = '<strong></strong><small></small>'
      dimLayer.appendChild(el)
      return { lb, el, strong: el.firstChild, small: el.lastChild }
    })

    const projV = new THREE.Vector3()
    const resize = () => {
      const w = Math.max(container.clientWidth, 280)
      const h = Math.max(container.clientHeight, 300)
      const aspect = w / h
      camera.aspect = aspect
      camera.fov = aspect < 0.85 ? 42 : 34
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()

    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null
    ro?.observe(container)

    let rafId = 0
    let visible = true
    let notified = false
    let lastTime = performance.now()
    let lastCm = -1
    const reduced = prefersReducedMotion()

    const tick = (now) => {
      rafId = 0
      if (!visible || document.hidden) return
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now

      const st = stateRef.current
      const k = 1 - Math.exp(-10 * dt)
      st.currentYaw += (st.targetYaw - st.currentYaw) * k
      // Leve respiração arquitetônica apenas na vista geral (sem reduced-motion)
      const idleBreath = !st.activeRoom && !st.deliveryMode && !reduced ? Math.sin(now * 0.00055) * 0.035 : 0
      diorama.root.rotation.y = st.currentYaw + idleBreath

      // Interpola pose da cama suavemente
      const pk = 1 - Math.exp(-14 * dt)
      st.currentPose.back += (st.targetPose.back - st.currentPose.back) * pk
      st.currentPose.legs += (st.targetPose.legs - st.currentPose.legs) * pk
      st.currentPose.lift += (st.targetPose.lift - st.currentPose.lift) * pk

      const { mattressTopY } = diorama.bed.setPose({ ...st.currentPose, railsDown: 0 })
      diorama.overlays.updateHeight(mattressTopY)
      const cm = Math.round(mattressTopY * 100)
      if (cm !== lastCm) {
        lastCm = cm
        onLiveHeightRef.current?.(cm)
      }

      camera.lookAt(target)
      renderer.render(scene, camera)

      // Projeta hotspots (visíveis apenas na vista geral fora da entrega)
      const showHotspots = !st.activeRoom && !st.deliveryMode
      hotspotLayer.style.opacity = showHotspots ? '1' : '0'
      hotspotLayer.style.pointerEvents = showHotspots ? '' : 'none'
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (showHotspots && cw > 0 && ch > 0) {
        diorama.root.updateMatrixWorld()
        for (const item of hotspotItems) {
          projV.copy(item.hs.anchor)
          diorama.root.localToWorld(projV)
          projV.project(camera)
          if (projV.z > 1) {
            item.btn.style.visibility = 'hidden'
            continue
          }
          item.btn.style.visibility = ''
          const x = Math.min(cw - 64, Math.max(64, (projV.x * 0.5 + 0.5) * cw))
          const y = Math.min(ch - 96, Math.max(88, (-projV.y * 0.5 + 0.5) * ch))
          item.btn.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
        }
      }

      // Projeta rótulos das medidas 3D quando ativos no Quarto
      const showDims = diorama.overlays.isDimensionsVisible() && st.activeRoom === 'quarto'
      dimLayer.style.display = showDims ? '' : 'none'
      if (showDims && cw > 0 && ch > 0) {
        diorama.bedAnchor.updateMatrixWorld()
        for (const item of dimItems) {
          if (item.lb.dirty || !item.strong.textContent) {
            item.strong.textContent = item.lb.main
            item.small.textContent = item.lb.sub
            item.lb.dirty = false
          }
          projV.copy(item.lb.anchor)
          diorama.bedAnchor.localToWorld(projV)
          projV.project(camera)
          if (projV.z > 1) {
            item.el.style.visibility = 'hidden'
            continue
          }
          item.el.style.visibility = ''
          const x = Math.min(cw - 76, Math.max(76, (projV.x * 0.5 + 0.5) * cw))
          const y = Math.min(ch - 260, Math.max(74, (-projV.y * 0.5 + 0.5) * ch))
          item.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`
        }
      }

      if (!notified) {
        notified = true
        onReady?.()
      }

      rafId = requestAnimationFrame(tick)
    }

    const start = () => {
      if (visible && !document.hidden && !rafId) {
        lastTime = performance.now()
        rafId = requestAnimationFrame(tick)
      }
    }
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) start()
            else stop()
          })
        : null
    io?.observe(container)

    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      stop()
      camRef.current.tween?.kill()
      document.removeEventListener('visibilitychange', onVis)
      io?.disconnect()
      ro?.disconnect()
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mats) {
            m.map?.dispose()
            m.dispose()
          }
        }
      })

      renderer.dispose()
      dom.remove()
      hotspotLayer.remove()
      dimLayer.remove()
      apiRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="v2-diorama-host" ref={hostRef} />
}
