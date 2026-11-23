import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildHospitalBed } from './buildHospitalBed.js'
import { buildCozyBedroom } from './buildCozyBedroom.js'
import { buildOverlays3d } from './buildOverlays3d.js'
import { REST_POSE } from './specs.js'

const DEFAULT_CAMERA_POS = new THREE.Vector3(2.74, 1.56, 2.66)
const DEFAULT_TARGET = new THREE.Vector3(-0.04, 0.72, -0.08)
const DEMO_CYCLE_SEC = 12

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (t) => t * t * (3 - 2 * t)
const windowEase = (t, start, end) => smoothstep(clamp01((t - start) / (end - start)))

/**
 * Roteiro continuo e fluido da demonstracao automatica (0..1 -> {back, legs, lift}).
 * Roda em 60/120fps dentro do proprio loop WebGL (zero re-render do React!).
 */
function sampleDemoPose(t) {
  const down = windowEase(t, 0.78, 0.96)
  const backUp = windowEase(t, 0.04, 0.28)
  const legsUp = windowEase(t, 0.24, 0.5)
  const liftUp = windowEase(t, 0.46, 0.72)

  return {
    back: backUp * 0.8 * (1 - down),
    legs: legsUp * 0.72 * (1 - down),
    lift: 0.42 + liftUp * 0.56 * (1 - down),
  }
}

/**
 * Palco WebGL 3D interativo da cama hospitalar Grupo YR dentro de um quarto
 * residencial aconchegante. Carregado dinamicamente apenas no navegador.
 */
export default function HospitalBedCanvas({
  pose = REST_POSE,
  auto = true,
  mode = 'eletrica',
  showPneumatic = false,
  railsDown = false,
  showDimensions = false,
  showCaregiverZone = false,
  resetSignal = 0,
  onLivePose,
  onInteract,
  onReady,
  onWebGLError,
}) {
  const hostRef = useRef(null)
  const onLivePoseRef = useRef(onLivePose)
  onLivePoseRef.current = onLivePose

  const stateRef = useRef({
    auto,
    demoTime: DEMO_CYCLE_SEC * 0.16,
    targetPose: { ...pose },
    currentPose: { ...pose },
    targetDrop: railsDown ? 1 : 0,
    currentDrop: railsDown ? 1 : 0,
    mode,
    showPneumatic,
    showDimensions,
    showCaregiverZone,
  })
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const apiRef = useRef(null)

  useEffect(() => {
    stateRef.current.auto = auto
  }, [auto])

  // Sincroniza pose manual/preset sem recriar o contexto WebGL
  useEffect(() => {
    if (!stateRef.current.auto) {
      stateRef.current.targetPose = { ...pose }
    }
  }, [pose])

  useEffect(() => {
    stateRef.current.targetDrop = railsDown ? 1 : 0
  }, [railsDown])

  useEffect(() => {
    stateRef.current.mode = mode
    apiRef.current?.bed.setMode(mode)
  }, [mode])

  useEffect(() => {
    stateRef.current.showPneumatic = showPneumatic
    apiRef.current?.bed.setPneumatic(showPneumatic)
  }, [showPneumatic])

  useEffect(() => {
    stateRef.current.showDimensions = showDimensions
    stateRef.current.showCaregiverZone = showCaregiverZone
    apiRef.current?.overlays.setOptions({ showDimensions, showCaregiverZone })
  }, [showDimensions, showCaregiverZone])

  // Botao de centralizar camera de volta ao angulo ideal do quarto
  useEffect(() => {
    if (!resetSignal || !cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.copy(DEFAULT_CAMERA_POS)
    controlsRef.current.target.copy(DEFAULT_TARGET)
    controlsRef.current.update()
  }, [resetSignal])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return undefined

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch (error) {
      onWebGLError?.(error)
      return undefined
    }

    // Limita pixelRatio a 1.5 para nitidez HiDPI mantendo 60fps folgados em GPUs integradas
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'herobed-webgl'
    renderer.domElement.setAttribute(
      'aria-label',
      'Visualização 3D interativa da cama hospitalar Grupo YR em um quarto residencial',
    )
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xdcd1c2)
    scene.fog = new THREE.Fog(0xdcd1c2, 5.8, 10.5)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.34

    const width = Math.max(container.clientWidth, 320)
    const height = Math.max(container.clientHeight, 300)
    // near = 0.25 aumenta em 2.5x a precisao do depth buffer (elimina piscamentos!)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.25, 28)
    camera.position.copy(DEFAULT_CAMERA_POS)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.enablePan = false
    controls.minDistance = 1.65
    controls.maxDistance = 5.0
    controls.minPolarAngle = 0.24
    controls.maxPolarAngle = Math.PI / 2 - 0.055
    controls.target.copy(DEFAULT_TARGET)
    controls.update()
    controlsRef.current = controls

    const handleControlStart = () => onInteract?.()
    controls.addEventListener('start', handleControlStart)

    // Iluminacao cinematografica com contraste quente/frio e zero shadow-acne
    const hemi = new THREE.HemisphereLight(0xf6f8fc, 0x9c8266, 0.62)
    scene.add(hemi)

    const sunLight = new THREE.DirectionalLight(0xffe9c7, 2.05)
    sunLight.position.set(1.5, 3.3, -2.8)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(1024, 1024)
    sunLight.shadow.radius = 2.8
    sunLight.shadow.camera.near = 0.5
    sunLight.shadow.camera.far = 11
    sunLight.shadow.camera.left = -2.9
    sunLight.shadow.camera.right = 2.9
    sunLight.shadow.camera.top = 2.9
    sunLight.shadow.camera.bottom = -2.9
    sunLight.shadow.bias = -0.0002
    sunLight.shadow.normalBias = 0.03
    scene.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0xeef5ff, 0.56)
    fillLight.position.set(2.7, 2.2, 2.8)
    scene.add(fillLight)

    // Brilho ambar quente vindo do painel horizontal de LED atras da cabeceira
    const headLedGlow = new THREE.PointLight(0xffc978, 1.45, 4.2, 1.7)
    headLedGlow.position.set(-1.05, 1.56, 0.12)
    scene.add(headLedGlow)

    // Monta quarto + cama real + guias 3D
    const bedroom = buildCozyBedroom()
    scene.add(bedroom.room)

    const bed = buildHospitalBed({
      mode: stateRef.current.mode,
      pose: stateRef.current.currentPose,
      showPneumatic: stateRef.current.showPneumatic,
      railsDown: stateRef.current.currentDrop,
    })
    scene.add(bed.root)

    const overlays = buildOverlays3d()
    overlays.setOptions({
      showDimensions: stateRef.current.showDimensions,
      showCaregiverZone: stateRef.current.showCaregiverZone,
    })
    scene.add(overlays.group)

    apiRef.current = { bed, overlays }

    const resize = () => {
      const w = Math.max(container.clientWidth, 260)
      const h = Math.max(container.clientHeight, 240)
      const aspect = w / h
      camera.aspect = aspect
      // Abre levemente o campo de visao em telas estreitas/celular para manter cama + quarto inteiros
      camera.fov = aspect < 1.25 ? Math.min(48, 38 + (1.25 - aspect) * 28) : 38
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()

    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null
    resizeObserver?.observe(container)

    const prefersReducedMotion = Boolean(
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    )

    let frameId = 0
    let visible = true
    let notifiedReady = false
    let lastNow = performance.now()

    const tick = (now) => {
      frameId = 0
      if (!visible || document.hidden) return

      // Delta time limitado a 50ms para evitar saltos ao trocar de aba
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000))
      lastNow = now

      const st = stateRef.current
      if (st.auto && !prefersReducedMotion) {
        st.demoTime = (st.demoTime + dt) % DEMO_CYCLE_SEC
        const sampled = sampleDemoPose(st.demoTime / DEMO_CYCLE_SEC)
        st.targetPose.back = sampled.back
        st.targetPose.legs = sampled.legs
        st.targetPose.lift = sampled.lift
      }

      // Amortecimento exponencial independente de FPS (fluido em 60Hz, 120Hz ou 144Hz)
      const rate = st.auto ? 7.5 : 16
      const smooth = 1 - Math.exp(-rate * dt)
      st.currentPose.back += (st.targetPose.back - st.currentPose.back) * smooth
      st.currentPose.legs += (st.targetPose.legs - st.currentPose.legs) * smooth
      st.currentPose.lift += (st.targetPose.lift - st.currentPose.lift) * smooth
      st.currentDrop += (st.targetDrop - st.currentDrop) * smooth

      const { mattressTopY } = bed.setPose({
        ...st.currentPose,
        railsDown: st.currentDrop,
      })
      bedroom.updateBedShadow(st.currentPose.lift)
      overlays.updateHeight(mattressTopY)

      // Atualiza sliders e pill de altura direto via DOM refs (0 re-renders do React!)
      onLivePoseRef.current?.(st.currentPose, Math.round(mattressTopY * 100))

      controls.update()
      bedroom.updateVisibility(camera)
      renderer.render(scene, camera)

      if (!notifiedReady) {
        notifiedReady = true
        onReady?.()
      }

      frameId = requestAnimationFrame(tick)
    }

    const start = () => {
      if (visible && !document.hidden && !frameId) {
        lastNow = performance.now()
        frameId = requestAnimationFrame(tick)
      }
    }
    const stop = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
        frameId = 0
      }
    }

    const intersectionObserver =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) start()
            else stop()
          })
        : null
    intersectionObserver?.observe(container)

    const handleVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
      intersectionObserver?.disconnect()
      resizeObserver?.disconnect()
      controls.removeEventListener('start', handleControlStart)
      controls.dispose()
      pmrem.dispose()
      envTex.dispose()

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of mats) {
            mat.map?.dispose()
            mat.roughnessMap?.dispose()
            mat.dispose()
          }
        }
      })

      renderer.dispose()
      renderer.domElement.remove()
      apiRef.current = null
      controlsRef.current = null
      cameraRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="herobed-canvas-host" ref={hostRef} />
}
