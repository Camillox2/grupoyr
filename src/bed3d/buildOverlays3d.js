import * as THREE from 'three'
import { BED_SPECS } from './specs.js'

/**
 * Sobreposicoes arquitetonicas em 3D:
 * 1) Cotas de medidas reais (1,96 m interno / 2,10 m total, 0,89 m / 0,99 m, altura ao vivo em cm)
 * 2) Area livre recomendada de circulacao do cuidador no piso (+60 cm nas laterais e peseira)
 */

function makeLabelTexture(text, subtext = '', accent = '#102a4c') {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 144
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, 512, 144)

  // Pilula branca com sombra suave e borda nitida
  const r = 34
  const x = 14
  const y = 14
  const w = 484
  const h = 116
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (subtext) {
    ctx.font = '800 40px Manrope, Segoe UI, sans-serif'
    ctx.fillText(text, 256, 54)
    ctx.font = '600 26px Manrope, Segoe UI, sans-serif'
    ctx.fillStyle = '#4e637a'
    ctx.fillText(subtext, 256, 98)
  } else {
    ctx.font = '800 44px Manrope, Segoe UI, sans-serif'
    ctx.fillText(text, 256, 74)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createDimensionSprite(text, subtext, scaleX = 0.62) {
  const map = makeLabelTexture(text, subtext)
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(scaleX, scaleX * (144 / 512), 1)
  sprite.renderOrder = 10
  return sprite
}

function createBracketLine(points, color = 0x1d5fae) {
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  return new THREE.LineSegments(geo, mat)
}

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

  // Linha de comprimento (1,96 m interno)
  dimensionsGroup.add(
    createBracketLine([
      new THREE.Vector3(-halfL, 0.025, frontZ),
      new THREE.Vector3(halfL, 0.025, frontZ),
      new THREE.Vector3(-halfL, 0.025, frontZ - tick),
      new THREE.Vector3(-halfL, 0.025, frontZ + tick),
      new THREE.Vector3(halfL, 0.025, frontZ - tick),
      new THREE.Vector3(halfL, 0.025, frontZ + tick),
    ]),
  )
  const lengthLabel = createDimensionSprite('1,96 m interno', '2,10 m total', 0.64)
  lengthLabel.position.set(-0.04, 0.22, frontZ)
  dimensionsGroup.add(lengthLabel)

  // Linha de largura (0,89 m interno) acima da peseira para nunca cortar na borda
  const widthY = 1.04
  dimensionsGroup.add(
    createBracketLine([
      new THREE.Vector3(halfL + 0.06, widthY, -halfW),
      new THREE.Vector3(halfL + 0.06, widthY, halfW),
      new THREE.Vector3(halfL + 0.06, widthY - tick, -halfW),
      new THREE.Vector3(halfL + 0.06, widthY + tick, -halfW),
      new THREE.Vector3(halfL + 0.06, widthY - tick, halfW),
      new THREE.Vector3(halfL + 0.06, widthY + tick, halfW),
    ]),
  )
  const widthLabel = createDimensionSprite('0,89 m interno', '0,99 m total', 0.58)
  widthLabel.position.set(halfL + 0.08, widthY + 0.14, 0)
  dimensionsGroup.add(widthLabel)

  // Linha vertical de altura (atualiza ao vivo com o slider, sempre visivel acima da barra)
  const heightX = BED_SPECS.externalLength / 2 + 0.16
  const heightZ = BED_SPECS.externalWidth / 2 + 0.04
  const heightLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(heightX, 0, heightZ),
    new THREE.Vector3(heightX, BED_SPECS.defaultHeight, heightZ),
    new THREE.Vector3(heightX - 0.04, 0, heightZ),
    new THREE.Vector3(heightX + 0.04, 0, heightZ),
    new THREE.Vector3(heightX - 0.04, BED_SPECS.defaultHeight, heightZ),
    new THREE.Vector3(heightX + 0.04, BED_SPECS.defaultHeight, heightZ),
  ])
  const heightLine = new THREE.LineSegments(
    heightLineGeo,
    new THREE.LineBasicMaterial({ color: 0x1a6b5c }),
  )
  dimensionsGroup.add(heightLine)

  const heightLabel = createDimensionSprite('Altura: 66 cm', '48 a 75 cm', 0.54)
  heightLabel.position.set(heightX + 0.02, BED_SPECS.defaultHeight + 0.14, heightZ)
  dimensionsGroup.add(heightLabel)

  let lastCm = Math.round(BED_SPECS.defaultHeight * 100)

  function updateHeight(meters) {
    const pos = heightLineGeo.attributes.position
    pos.setY(1, meters)
    pos.setY(4, meters)
    pos.setY(5, meters)
    pos.needsUpdate = true

    heightLabel.position.y = Math.max(0.54, meters + 0.14)
    const cm = Math.round(meters * 100)
    if (cm !== lastCm) {
      lastCm = cm
      const prevMap = heightLabel.material.map
      heightLabel.material.map = makeLabelTexture(`Altura: ${cm} cm`, '48 a 75 cm', '#1a6b5c')
      heightLabel.material.needsUpdate = true
      prevMap?.dispose()
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

  return { group, setOptions, updateHeight }
}
