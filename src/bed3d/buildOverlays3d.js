import * as THREE from 'three'
import { BED_SPECS } from './specs.js'

/**
 * Sobreposicoes arquitetonicas em 3D:
 * 1) Cotas de medidas reais (1,96 m interno / 2,10 m total, 0,89 m / 0,99 m, altura ao vivo em cm)
 * 2) Area livre recomendada de circulacao do cuidador no piso (+60 cm nas laterais e peseira)
 */

function makeCaregiverFloorTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 768
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, 1024, 768)

  // Area azul translucida no piso
  ctx.fillStyle = 'rgba(29, 95, 174, 0.12)'
  ctx.beginPath()
  ctx.roundRect(16, 16, 992, 736, 36)
  ctx.fill()

  // Borda tracejada tecnica
  ctx.strokeStyle = 'rgba(29, 95, 174, 0.72)'
  ctx.lineWidth = 8
  ctx.setLineDash([24, 16])
  ctx.beginPath()
  ctx.roundRect(16, 16, 992, 736, 36)
  ctx.stroke()
  ctx.setLineDash([])

  // Faixa de texto frontal legivel
  ctx.fillStyle = 'rgba(16, 42, 76, 0.88)'
  ctx.font = '700 32px Manrope, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ESPAÇO LIVRE RECOMENDADO P/ CUIDADOR (+60 CM)', 512, 712)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function buildOverlays3d() {
  const group = new THREE.Group()
  group.name = 'GuiasDeMedidas'

  // =========================================================================
  // 1. COTAS ARQUITETONICAS 3D
  // =========================================================================
  const dimensionsGroup = new THREE.Group()
  dimensionsGroup.visible = false
  group.add(dimensionsGroup)

  const halfL = BED_SPECS.internalLength / 2 // 0.98
  const halfW = BED_SPECS.internalWidth / 2 // 0.445
  const frontZ = BED_SPECS.externalWidth / 2 + 0.24
  const footX = BED_SPECS.externalLength / 2 + 0.24
  const tick = 0.055

  // Cotas em "tubos" 3D grossos (linhas WebGL tem 1px no celular e somem na cena).
  // Contorno branco + nucleo azul vivo, sempre por cima (depthTest off), com tracos nas pontas.
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x0b5cff, depthTest: false, transparent: true })
  const heightMat = new THREE.MeshBasicMaterial({ color: 0x0b8f6f, depthTest: false, transparent: true })
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1)
  const up = new THREE.Vector3(0, 1, 0)

  function addSegment(parent, a, b, mat, r = 0.009) {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())
    const outline = new THREE.Mesh(unitCyl, outlineMat)
    outline.position.copy(mid)
    outline.quaternion.copy(quat)
    outline.scale.set(r * 1.9, len + r * 2, r * 1.9)
    outline.renderOrder = 10
    const core = new THREE.Mesh(unitCyl, mat)
    core.position.copy(mid)
    core.quaternion.copy(quat)
    core.scale.set(r, len, r)
    core.renderOrder = 11
    parent.add(outline, core)
    return { outline, core }
  }

  function addDimension(a, b, tickDir, mat) {
    const g = new THREE.Group()
    addSegment(g, a, b, mat)
    for (const p of [a, b]) {
      addSegment(g, p.clone().addScaledVector(tickDir, -tick), p.clone().addScaledVector(tickDir, tick), mat)
    }
    dimensionsGroup.add(g)
    return g
  }

  // Comprimento (1,96 m interno) no piso, a frente da cama
  addDimension(
    new THREE.Vector3(-halfL, 0.03, frontZ),
    new THREE.Vector3(halfL, 0.03, frontZ),
    new THREE.Vector3(0, 0, 1),
    lineMat,
  )
  // Largura (0,89 m interno) acima da peseira
  const widthY = 1.04
  addDimension(
    new THREE.Vector3(halfL + 0.06, widthY, -halfW),
    new THREE.Vector3(halfL + 0.06, widthY, halfW),
    new THREE.Vector3(0, 1, 0),
    lineMat,
  )

  // Altura (ao vivo): segmento vertical unitario escalado + tracos
  const heightX = BED_SPECS.externalLength / 2 + 0.16
  const heightZ = BED_SPECS.externalWidth / 2 + 0.04
  const heightGroup = new THREE.Group()
  dimensionsGroup.add(heightGroup)
  const hSeg = addSegment(heightGroup, new THREE.Vector3(heightX, 0, heightZ), new THREE.Vector3(heightX, 1, heightZ), heightMat)
  addSegment(heightGroup, new THREE.Vector3(heightX - tick, 0.004, heightZ), new THREE.Vector3(heightX + tick, 0.004, heightZ), heightMat)
  const topTick = new THREE.Group()
  addSegment(topTick, new THREE.Vector3(heightX - tick, 0, heightZ), new THREE.Vector3(heightX + tick, 0, heightZ), heightMat)
  heightGroup.add(topTick)

  // Rotulos em HTML (tamanho fixo em px, alto contraste) ancorados em pontos 3D.
  // O HospitalBedCanvas projeta as ancoras e posiciona os rotulos dentro da tela.
  const labels = [
    {
      id: 'comprimento',
      anchor: new THREE.Vector3(0, 0.03, frontZ),
      main: '1,96 m',
      sub: 'interno · 2,10 m total',
      tone: 'blue',
    },
    {
      id: 'largura',
      anchor: new THREE.Vector3(halfL + 0.06, widthY, 0),
      main: '0,89 m',
      sub: 'interno · 0,99 m total',
      tone: 'blue',
    },
    {
      id: 'altura',
      anchor: new THREE.Vector3(heightX, BED_SPECS.defaultHeight, heightZ),
      main: `Altura ${Math.round(BED_SPECS.defaultHeight * 100)} cm`,
      sub: 'ajuste de 48 a 75 cm',
      tone: 'green',
      dirty: true,
    },
  ]
  const heightLabel = labels[2]

  let lastCm = Math.round(BED_SPECS.defaultHeight * 100)

  function updateHeight(meters) {
    const m = Math.max(0.001, meters)
    hSeg.core.scale.y = m
    hSeg.core.position.y = m / 2
    hSeg.outline.scale.y = m + 0.018
    hSeg.outline.position.y = m / 2
    topTick.position.y = m
    heightLabel.anchor.y = m
    const cm = Math.round(meters * 100)
    if (cm !== lastCm) {
      lastCm = cm
      heightLabel.main = `Altura ${cm} cm`
      heightLabel.dirty = true
    }
  }

  // =========================================================================
  // 2. ZONA DE CIRCULACAO DO CUIDADOR NO PISO (+60 cm)
  // =========================================================================
  const margin = BED_SPECS.caregiverMargin
  // Cabeceira encostada na parede: +60 cm nas duas laterais e na peseira
  const zoneL = BED_SPECS.externalLength + margin + 0.14
  const zoneW = BED_SPECS.externalWidth + margin * 2
  const caregiverZone = new THREE.Mesh(
    new THREE.PlaneGeometry(zoneL, zoneW),
    new THREE.MeshBasicMaterial({
      map: makeCaregiverFloorTexture(),
      transparent: true,
      depthWrite: false,
    }),
  )
  caregiverZone.rotation.x = -Math.PI / 2
  caregiverZone.position.set(margin / 2, 0.024, 0)
  caregiverZone.visible = false
  group.add(caregiverZone)

  function setOptions({ showDimensions = false, showCaregiverZone = false } = {}) {
    dimensionsGroup.visible = Boolean(showDimensions)
    caregiverZone.visible = Boolean(showCaregiverZone)
  }

  return {
    group,
    setOptions,
    updateHeight,
    labels,
    isDimensionsVisible: () => dimensionsGroup.visible,
  }
}
