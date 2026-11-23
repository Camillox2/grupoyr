import * as THREE from 'three'
import { BED_SPECS, liftToHeightMeters, REST_POSE } from './specs.js'

/**
 * Constroi a cama hospitalar 3D do Grupo YR em escala real (1 unidade = 1 metro),
 * fiel as fotos reais public/products/cama-yr-01..05.jpg e cama-manual-yr-04.jpg.
 *
 * - Zero Z-fighting: travessas encaixam dentro das longarinas com folga geometrica real.
 * - Textura procedural de courvin/capa impermeavel hospitalar (no navegador) +
 *   travesseiro macio branco opcional (ativo no quarto 3D para visual acolhedor).
 * - Compativel com Node.js para exportacao 1:1 de modelos AR (.glb / .usdz).
 */

const UP_AXIS = new THREE.Vector3(0, 1, 0)
const TMP_DIR = new THREE.Vector3()
const TMP_MID = new THREE.Vector3()

function placeBarBetween(mesh, a, b) {
  TMP_DIR.subVectors(b, a)
  const len = TMP_DIR.length()
  if (len < 1e-4) return
  TMP_MID.addVectors(a, b).multiplyScalar(0.5)
  mesh.position.copy(TMP_MID)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(UP_AXIS, TMP_DIR.normalize())
}

function roundedRectPath(x, y, w, h, r) {
  const path = new THREE.Path()
  const rad = Math.min(r, w / 2, h / 2)
  path.moveTo(x + rad, y)
  path.lineTo(x + w - rad, y)
  path.quadraticCurveTo(x + w, y, x + w, y + rad)
  path.lineTo(x + w, y + h - rad)
  path.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  path.lineTo(x + rad, y + h)
  path.quadraticCurveTo(x, y + h, x, y + h - rad)
  path.lineTo(x, y + rad)
  path.quadraticCurveTo(x, y, x + rad, y)
  return path
}

/** Micro-textura sutil de courvin hospitalar verde-esmeralda (so no navegador). */
function createMattressTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  const grad = ctx.createLinearGradient(0, 0, 512, 512)
  grad.addColorStop(0, '#1c7060')
  grad.addColorStop(0.5, '#186456')
  grad.addColorStop(1, '#14584c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Granulacao delicada de courvin impermeavel + costura sutil
  for (let i = 0; i < 6500; i += 1) {
    const x = (i * 73 + (i % 19) * 11) % 512
    const y = (i * 151 + (i % 23) * 7) % 512
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,20,16,0.045)'
    ctx.fillRect(x, y, 2, 2)
  }

  // Costura discreta nas bordas
  ctx.strokeStyle = 'rgba(10, 46, 39, 0.35)'
  ctx.lineWidth = 3
  ctx.setLineDash([8, 6])
  ctx.strokeRect(18, 18, 476, 476)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** Textura sutil de algodao macio para o travesseiro branco. */
function createPillowTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  const g = ctx.createRadialGradient(128, 120, 20, 128, 128, 145)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.75, '#f6f3ee')
  g.addColorStop(1, '#e8e2d8')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)

  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(190,180,165,0.06)' : 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, y, 256, 1)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Cria a geometria moldada em ABS da cabeceira/peseira com os recortes reais das fotos. */
function createBoardGeometry(width, height, depth) {
  const hw = width / 2
  const shape = new THREE.Shape()

  shape.moveTo(-hw + 0.025, 0)
  shape.lineTo(hw - 0.025, 0)
  shape.quadraticCurveTo(hw, 0, hw, 0.03)
  shape.lineTo(hw, height - 0.1)
  shape.quadraticCurveTo(hw, height - 0.015, hw - 0.11, height - 0.01)
  shape.quadraticCurveTo(0, height + 0.035, -hw + 0.11, height - 0.01)
  shape.quadraticCurveTo(-hw, height - 0.015, -hw, height - 0.1)
  shape.lineTo(-hw, 0.03)
  shape.quadraticCurveTo(-hw, 0, -hw + 0.025, 0)

  const sideTop = height - 0.06
  const sideBottom = height * 0.44
  for (const dir of [-1, 1]) {
    const hole = new THREE.Path()
    const outerX = dir * (hw - 0.055)
    const innerX = dir * (hw - 0.2)
    if (dir < 0) {
      hole.moveTo(outerX + 0.01, sideBottom + 0.02)
      hole.lineTo(innerX - 0.01, sideBottom - 0.01)
      hole.quadraticCurveTo(innerX + 0.01, sideBottom - 0.01, innerX + 0.01, sideBottom + 0.02)
      hole.lineTo(innerX + 0.01, sideTop - 0.025)
      hole.quadraticCurveTo(innerX + 0.01, sideTop, innerX - 0.02, sideTop)
      hole.lineTo(outerX + 0.025, sideTop - 0.025)
      hole.quadraticCurveTo(outerX, sideTop - 0.035, outerX, sideTop - 0.06)
      hole.lineTo(outerX, sideBottom + 0.04)
      hole.quadraticCurveTo(outerX, sideBottom + 0.02, outerX + 0.01, sideBottom + 0.02)
    } else {
      hole.moveTo(innerX - 0.01, sideBottom + 0.02)
      hole.lineTo(innerX - 0.01, sideTop - 0.025)
      hole.quadraticCurveTo(innerX - 0.01, sideTop, innerX + 0.02, sideTop)
      hole.lineTo(outerX - 0.025, sideTop - 0.025)
      hole.quadraticCurveTo(outerX, sideTop - 0.035, outerX, sideTop - 0.06)
      hole.lineTo(outerX, sideBottom + 0.04)
      hole.quadraticCurveTo(outerX, sideBottom + 0.02, outerX - 0.01, sideBottom + 0.02)
      hole.lineTo(innerX + 0.01, sideBottom - 0.01)
      hole.quadraticCurveTo(innerX - 0.01, sideBottom - 0.01, innerX - 0.01, sideBottom + 0.02)
    }
    shape.holes.push(hole)
  }

  const slotW = width * 0.42
  shape.holes.push(roundedRectPath(-slotW / 2, height * 0.67, slotW, height * 0.145, 0.024))
  shape.holes.push(roundedRectPath(-slotW / 2, height * 0.46, slotW, height * 0.13, 0.024))

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 8,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateY(Math.PI / 2)
  geo.computeVertexNormals()
  return geo
}

/** Cria uma grade lateral bipartida em ABS (estilo cama-yr-01.jpg / cama-yr-02.jpg). */
function createSideRailGeometry(length = 0.64, height = 0.31, depth = 0.026) {
  const hl = length / 2
  const shape = new THREE.Shape()

  shape.moveTo(-hl + 0.07, 0)
  shape.lineTo(hl - 0.07, 0)
  shape.quadraticCurveTo(hl, 0, hl, 0.075)
  shape.lineTo(hl - 0.01, height - 0.095)
  shape.quadraticCurveTo(hl - 0.02, height - 0.02, hl - 0.11, height - 0.015)
  shape.quadraticCurveTo(0, height + 0.032, -hl + 0.11, height - 0.015)
  shape.quadraticCurveTo(-hl + 0.02, height - 0.02, -hl + 0.01, height - 0.095)
  shape.lineTo(-hl, 0.075)
  shape.quadraticCurveTo(-hl, 0, -hl + 0.07, 0)

  shape.holes.push(roundedRectPath(-length * 0.18, height * 0.56, length * 0.36, height * 0.21, 0.022))
  shape.holes.push(roundedRectPath(-hl + 0.045, height * 0.25, 0.085, height * 0.44, 0.028))
  shape.holes.push(roundedRectPath(hl - 0.13, height * 0.25, 0.085, height * 0.44, 0.028))

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 8,
  })
  geo.translate(0, 0, -depth / 2)
  geo.computeVertexNormals()
  return geo
}

/** Cria um segmento de colchao hospitalar com bordas macias arredondadas. */
function createMattressSegmentGeometry(length, width, thickness) {
  const r = 0.026
  const shape = new THREE.Shape()
  const hl = length / 2
  const ht = thickness / 2
  shape.moveTo(-hl + r, -ht)
  shape.lineTo(hl - r, -ht)
  shape.quadraticCurveTo(hl, -ht, hl, -ht + r)
  shape.lineTo(hl, ht - r)
  shape.quadraticCurveTo(hl, ht, hl - r, ht)
  shape.lineTo(-hl + r, ht)
  shape.quadraticCurveTo(-hl, ht, -hl, ht - r)
  shape.lineTo(-hl, -ht + r)
  shape.quadraticCurveTo(-hl, -ht, -hl + r, -ht)

  const innerW = Math.max(0.05, width - 0.032)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 6,
  })
  geo.translate(0, ht, -innerW / 2)
  geo.computeVertexNormals()
  return geo
}

/** Travesseiro fofo com forma organica macia para deixar a cama acolhedora no quarto. */
function createSoftPillow(material) {
  const geo = new THREE.SphereGeometry(1, 24, 18)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)
    // Achata em formato de travesseiro retangular macio com cantos cheios
    const sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.72)
    x = sq(x) * 0.21
    z = sq(z) * 0.31
    y = y * 0.068 * (1 - 0.22 * (x * x + z * z))
    pos.setXYZ(i, x, y, z)
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Constroi um rodizio hospitalar com garfo metalico, roda emborrachada e pedal de freio. */
function createCastor(materials, mirrorBrake = 1) {
  const group = new THREE.Group()
  const wheelR = 0.052
  const wheelW = 0.032

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 24),
    materials.rubber,
  )
  tire.rotation.x = Math.PI / 2
  tire.position.y = wheelR
  tire.castShadow = true
  group.add(tire)

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelR * 0.48, wheelR * 0.48, wheelW + 0.006, 18),
    materials.absLight,
  )
  hub.rotation.x = Math.PI / 2
  hub.position.y = wheelR
  group.add(hub)

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.072, 0.006), materials.chrome)
    leg.position.set(-0.008, 0.084, side * (wheelW / 2 + 0.006))
    leg.rotation.z = 0.22
    leg.castShadow = true
    group.add(leg)
  }

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.032, 16), materials.chrome)
  stem.position.set(-0.016, 0.121, 0)
  group.add(stem)

  // Chapa parafusada logo abaixo da base (0.132..0.139 m — sem sobrepor o tubo em 0.140 m!)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.007, 0.062), materials.chrome)
  plate.position.set(-0.016, 0.1355, 0)
  group.add(plate)

  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.008, 0.024), materials.darkSteel)
  brake.position.set(0.032 * mirrorBrake, 0.105, 0)
  brake.rotation.z = -0.25 * mirrorBrake
  group.add(brake)

  return group
}

function createSideRailAssembly(sideRailGeo, materials, sideSign) {
  const group = new THREE.Group()

  const railMesh = new THREE.Mesh(sideRailGeo, materials.abs)
  railMesh.position.set(0, 0.11, sideSign * 0.02)
  railMesh.castShadow = true
  railMesh.receiveShadow = true
  group.add(railMesh)

  for (const hx of [-0.18, 0.18]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.011), materials.whiteSteel)
    arm.position.set(hx, 0.055, sideSign * 0.006)
    arm.castShadow = true
    group.add(arm)

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.038, 0.028), materials.absDark)
    bracket.position.set(hx, -0.02, 0)
    group.add(bracket)
  }

  const latch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.026, 16),
    materials.redLatch,
  )
  latch.rotation.x = Math.PI / 2
  latch.position.set(0.18, -0.02, sideSign * 0.024)
  group.add(latch)

  return group
}

function createManualCranks(materials) {
  const group = new THREE.Group()
  const cranks = []
  const zs = [-0.24, 0, 0.24]

  for (const zPos of zs) {
    const pivot = new THREE.Group()
    pivot.position.set(0, 0, zPos)

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.048, 14),
      materials.darkSteel,
    )
    collar.rotation.z = Math.PI / 2
    pivot.add(collar)

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.09, 12),
      materials.chrome,
    )
    shaft.rotation.z = Math.PI / 2
    shaft.position.x = 0.055
    pivot.add(shaft)

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, 0.15, 12),
      materials.chrome,
    )
    arm.position.set(0.105, -0.065, 0)
    arm.rotation.z = 0.26
    pivot.add(arm)

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.012, 0.088, 14),
      materials.rubber,
    )
    grip.rotation.z = Math.PI / 2
    grip.position.set(0.165, -0.132, 0)
    grip.castShadow = true
    pivot.add(grip)

    group.add(pivot)
    cranks.push(pivot)
  }

  return { group, cranks }
}

function createHandRemote(materials) {
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.165, 0.024), materials.absLight)
  body.castShadow = true
  group.add(body)

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.115, 0.005), materials.darkSteel)
  face.position.set(0, 0.008, 0.013)
  group.add(face)

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.006), materials.buttonBlue)
      btn.position.set(-0.013 + col * 0.026, 0.036 - row * 0.032, 0.016)
      group.add(btn)
    }
  }

  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 16, Math.PI), materials.absDark)
  hook.position.set(0, 0.088, -0.01)
  hook.rotation.y = Math.PI / 2
  group.add(hook)

  return group
}

function createPneumaticStrip(length, width, materials) {
  const group = new THREE.Group()
  const cellRadius = 0.024
  const count = Math.max(3, Math.round(length / (cellRadius * 2.08)))
  const step = length / count
  const cylGeo = new THREE.CylinderGeometry(cellRadius, cellRadius, width - 0.04, 14)
  cylGeo.rotateX(Math.PI / 2)

  for (let i = 0; i < count; i += 1) {
    const cell = new THREE.Mesh(cylGeo, materials.pneumatic)
    cell.position.set(-length / 2 + step * (i + 0.5), cellRadius * 0.9, 0)
    cell.scale.set(1, 0.85, 1)
    cell.receiveShadow = true
    group.add(cell)
  }
  return group
}

export function buildHospitalBed({
  mode = 'eletrica',
  pose = REST_POSE,
  showPneumatic = false,
  showPillow = false,
  railsDown = 0,
} = {}) {
  const root = new THREE.Group()
  root.name = 'CamaHospitalarGrupoYR'

  const mattressTex = createMattressTexture()
  // Travesseiro removido por padrao (pedido do cliente): nao gera textura/malha sem necessidade
  const pillowTex = showPillow ? createPillowTexture() : null

  const materials = {
    whiteSteel: new THREE.MeshStandardMaterial({
      color: 0xf4f6f9,
      roughness: 0.3,
      metalness: 0.24,
    }),
    steelShadow: new THREE.MeshStandardMaterial({
      color: 0xd8e0e8,
      roughness: 0.38,
      metalness: 0.32,
    }),
    abs: new THREE.MeshStandardMaterial({
      color: 0xc9cfd6,
      roughness: 0.34,
      metalness: 0.05,
    }),
    absLight: new THREE.MeshStandardMaterial({
      color: 0xe0e4ea,
      roughness: 0.34,
      metalness: 0.04,
    }),
    absDark: new THREE.MeshStandardMaterial({
      color: 0x87929e,
      roughness: 0.46,
      metalness: 0.16,
    }),
    mattress: new THREE.MeshStandardMaterial({
      color: mattressTex ? 0xffffff : 0x186657,
      map: mattressTex || null,
      roughness: 0.52,
      metalness: 0.04,
    }),
    pillow: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: pillowTex || null,
      roughness: 0.88,
      metalness: 0.0,
    }),
    pneumatic: new THREE.MeshStandardMaterial({
      color: 0x7ab9e3,
      roughness: 0.28,
      metalness: 0.04,
    }),
    compressor: new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.3,
      metalness: 0.08,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xd0d8e0,
      roughness: 0.18,
      metalness: 0.88,
    }),
    darkSteel: new THREE.MeshStandardMaterial({
      color: 0x353e49,
      roughness: 0.44,
      metalness: 0.5,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x22272d,
      roughness: 0.8,
      metalness: 0.06,
    }),
    redLatch: new THREE.MeshStandardMaterial({
      color: 0xd12828,
      roughness: 0.32,
      metalness: 0.08,
    }),
    buttonBlue: new THREE.MeshStandardMaterial({
      color: 0x2b74c9,
      roughness: 0.38,
      metalness: 0.06,
    }),
  }

  // =========================================================================
  // 1. BASE INFERIOR + 4 RODIZIOS (ZERO Z-FIGHTING: travessas internas menores)
  // =========================================================================
  const baseGroup = new THREE.Group()
  baseGroup.name = 'BaseComRodizios'
  root.add(baseGroup)

  const baseW = 0.78
  const baseL = 1.54
  const tubeS = 0.042
  const baseY = 0.161 // base inferior em 0.140 m, logo acima da chapa do rodizio (0.139 m)

  const lowerLongGeo = new THREE.BoxGeometry(baseL, tubeS, tubeS)
  // Travessas ficam estritamente ENTRE as faces internas das longarinas e 4mm mais baixas (zero coplanaridade!)
  const lowerInnerW = baseW - tubeS * 2 - 0.002
  const lowerCrossGeo = new THREE.BoxGeometry(0.038, tubeS - 0.004, lowerInnerW)

  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(lowerLongGeo, materials.whiteSteel)
    rail.position.set(0, baseY, sz * (baseW / 2 - tubeS / 2))
    rail.castShadow = true
    rail.receiveShadow = true
    baseGroup.add(rail)
  }
  for (const sx of [-baseL / 2 + 0.026, 0, baseL / 2 - 0.026]) {
    const cross = new THREE.Mesh(lowerCrossGeo, materials.whiteSteel)
    cross.position.set(sx, baseY, 0)
    cross.castShadow = true
    cross.receiveShadow = true
    baseGroup.add(cross)
  }

  // Ponteiras pretas encaixadas rentes nas extremidades (sem sobreposicao)
  const capGeo = new THREE.BoxGeometry(0.01, tubeS + 0.002, tubeS + 0.002)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, materials.rubber)
      cap.position.set(sx * (baseL / 2 + 0.006), baseY, sz * (baseW / 2 - tubeS / 2))
      baseGroup.add(cap)
    }
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const castor = createCastor(materials, sx)
      castor.position.set(sx * (baseL / 2 - 0.05), 0, sz * (baseW / 2 - 0.03))
      baseGroup.add(castor)
    }
  }

  // =========================================================================
  // 2. MECANISMO DE ELEVACAO PANTOGRAFICA + ATUADOR ELETRICO
  // =========================================================================
  const liftGroup = new THREE.Group()
  liftGroup.name = 'MecanismoElevacao'
  root.add(liftGroup)

  const unitBarGeo = new THREE.BoxGeometry(0.032, 1, 0.03)
  const unitTubeGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 16)
  const unitRodGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 14)

  const liftArms = []
  for (const sz of [-1, 1]) {
    // Deslocado levemente para dentro das longarinas (zero Z-fighting nas juntas!)
    const zPos = sz * (baseW / 2 - tubeS - 0.018)
    const headArm = new THREE.Mesh(unitBarGeo, materials.whiteSteel)
    headArm.castShadow = true
    liftGroup.add(headArm)

    const footArm = new THREE.Mesh(unitBarGeo, materials.whiteSteel)
    footArm.castShadow = true
    liftGroup.add(footArm)

    const midStrut = new THREE.Mesh(unitBarGeo, materials.steelShadow)
    midStrut.castShadow = true
    liftGroup.add(midStrut)

    liftArms.push({ zPos, headArm, footArm, midStrut })
  }

  const electricMechanism = new THREE.Group()
  electricMechanism.name = 'AtuadorEletrico'
  liftGroup.add(electricMechanism)

  const motorBody = new THREE.Mesh(unitTubeGeo, materials.absDark)
  motorBody.castShadow = true
  electricMechanism.add(motorBody)

  const motorRod = new THREE.Mesh(unitRodGeo, materials.chrome)
  electricMechanism.add(motorRod)

  const motorBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.072, 0.14), materials.darkSteel)
  motorBox.castShadow = true
  electricMechanism.add(motorBox)

  // =========================================================================
  // 3. QUADRO SUPERIOR + CABECEIRA E PESEIRA EM ABS (ZERO Z-FIGHTING)
  // =========================================================================
  const upperGroup = new THREE.Group()
  upperGroup.name = 'QuadroSuperior'
  root.add(upperGroup)

  const frameL = BED_SPECS.internalLength + 0.02 // 1.98 m
  const frameW = BED_SPECS.internalWidth // 0.89 m
  const topS = 0.044

  const topLongGeo = new THREE.BoxGeometry(frameL, topS, topS)
  const topInnerW = frameW - topS * 2 - 0.002
  const topCrossGeo = new THREE.BoxGeometry(0.04, topS - 0.004, topInnerW)

  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(topLongGeo, materials.whiteSteel)
    rail.position.set(0, 0, sz * (frameW / 2 - topS / 2))
    rail.castShadow = true
    rail.receiveShadow = true
    upperGroup.add(rail)

    for (const bx of [-0.82, -0.35, 0.35, 0.82]) {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.006, 10),
        materials.darkSteel,
      )
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(bx, 0, sz * (frameW / 2 + 0.003))
      upperGroup.add(bolt)
    }
  }
  for (const sx of [-frameL / 2 + 0.026, -0.22, 0.06, frameL / 2 - 0.026]) {
    const cross = new THREE.Mesh(topCrossGeo, materials.whiteSteel)
    cross.position.set(sx, 0, 0)
    cross.castShadow = true
    upperGroup.add(cross)
  }

  const topCapGeo = new THREE.BoxGeometry(0.01, topS + 0.002, topS + 0.002)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cap = new THREE.Mesh(topCapGeo, materials.rubber)
      cap.position.set(sx * (frameL / 2 + 0.006), 0, sz * (frameW / 2 - topS / 2))
      upperGroup.add(cap)
    }
  }

  const headboard = new THREE.Mesh(
    createBoardGeometry(frameW + 0.05, 0.51, 0.042),
    materials.abs,
  )
  headboard.position.set(-frameL / 2 - 0.036, -0.04, 0)
  headboard.castShadow = true
  headboard.receiveShadow = true
  upperGroup.add(headboard)

  const footboard = new THREE.Mesh(
    createBoardGeometry(frameW + 0.05, 0.43, 0.042),
    materials.abs,
  )
  footboard.position.set(frameL / 2 + 0.036, -0.04, 0)
  footboard.castShadow = true
  footboard.receiveShadow = true
  upperGroup.add(footboard)

  const ribGeo = new THREE.BoxGeometry(0.06, 0.015, 0.012)
  for (const bx of [-frameL / 2 - 0.036, frameL / 2 + 0.036]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const rib = new THREE.Mesh(ribGeo, materials.absDark)
        rib.position.set(bx, 0.01 + i * 0.038, sz * ((frameW + 0.05) / 2 + 0.008))
        upperGroup.add(rib)
      }
    }
  }

  const manualCranks = createManualCranks(materials)
  manualCranks.group.position.set(frameL / 2 + 0.022, -0.055, 0)
  upperGroup.add(manualCranks.group)

  const handRemote = createHandRemote(materials)
  handRemote.position.set(-0.08, 0.14, frameW / 2 + 0.076)
  handRemote.rotation.z = -0.08
  upperGroup.add(handRemote)

  // =========================================================================
  // 4. ESTRADO ARTICULADO DE 4 SECOES + COLCHAO VERDE + TRAVESSEIRO MACIO
  // =========================================================================
  const deckY = 0.025
  const mattT = BED_SPECS.mattressThickness
  const mattW = BED_SPECS.internalWidth - 0.02
  const deckW = BED_SPECS.internalWidth - 0.04

  const L_BACK = 0.76
  const L_SEAT = 0.28
  const L_THIGH = 0.4
  const L_CALF = 0.52

  const pneumaticStrips = []

  // --- Assento fixo ---
  const seatGroup = new THREE.Group()
  seatGroup.position.set(-0.08, deckY, 0)
  upperGroup.add(seatGroup)

  const seatDeck = new THREE.Mesh(
    new THREE.BoxGeometry(L_SEAT - 0.014, 0.016, deckW),
    materials.whiteSteel,
  )
  seatDeck.position.y = 0.008
  seatDeck.castShadow = true
  seatDeck.receiveShadow = true
  seatGroup.add(seatDeck)

  const seatMattress = new THREE.Mesh(
    createMattressSegmentGeometry(L_SEAT - 0.008, mattW, mattT),
    materials.mattress,
  )
  seatMattress.position.y = 0.018
  seatMattress.castShadow = true
  seatMattress.receiveShadow = true
  seatGroup.add(seatMattress)

  const seatPneumatic = createPneumaticStrip(L_SEAT - 0.01, mattW, materials)
  seatPneumatic.position.y = 0.018 + mattT + 0.003
  seatGroup.add(seatPneumatic)
  pneumaticStrips.push(seatPneumatic)

  // --- Encosto ---
  const backPivot = new THREE.Group()
  backPivot.name = 'ArticulacaoEncosto'
  backPivot.position.set(-0.22, deckY, 0)
  upperGroup.add(backPivot)

  const backDeck = new THREE.Mesh(
    new THREE.BoxGeometry(L_BACK - 0.014, 0.016, deckW),
    materials.whiteSteel,
  )
  backDeck.position.set(-L_BACK / 2, 0.008, 0)
  backDeck.castShadow = true
  backDeck.receiveShadow = true
  backPivot.add(backDeck)

  const backSubRailGeo = new THREE.BoxGeometry(L_BACK - 0.1, 0.02, 0.022)
  for (const sz of [-1, 1]) {
    const sub = new THREE.Mesh(backSubRailGeo, materials.steelShadow)
    sub.position.set(-L_BACK / 2, -0.012, sz * (deckW / 2 - 0.065))
    backPivot.add(sub)
  }

  const backMattress = new THREE.Mesh(
    createMattressSegmentGeometry(L_BACK - 0.014, mattW, mattT),
    materials.mattress,
  )
  backMattress.position.set(-L_BACK / 2, 0.018, 0)
  backMattress.castShadow = true
  backMattress.receiveShadow = true
  backPivot.add(backMattress)

  // Travesseiro opcional (desligado por padrao: a cama aparece limpa, sem almofada branca)
  const pillow = showPillow ? createSoftPillow(materials.pillow) : null
  if (pillow) {
    pillow.position.set(-L_BACK + 0.25, 0.018 + mattT + 0.056, 0)
    backPivot.add(pillow)
  }

  const backPneumatic = createPneumaticStrip(L_BACK - 0.03, mattW, materials)
  backPneumatic.position.set(-L_BACK / 2, 0.018 + mattT + 0.003, 0)
  backPivot.add(backPneumatic)
  pneumaticStrips.push(backPneumatic)

  // --- Coxa ---
  const thighPivot = new THREE.Group()
  thighPivot.name = 'ArticulacaoCoxa'
  thighPivot.position.set(0.06, deckY, 0)
  upperGroup.add(thighPivot)

  const thighDeck = new THREE.Mesh(
    new THREE.BoxGeometry(L_THIGH - 0.014, 0.016, deckW),
    materials.whiteSteel,
  )
  thighDeck.position.set(L_THIGH / 2, 0.008, 0)
  thighDeck.castShadow = true
  thighDeck.receiveShadow = true
  thighPivot.add(thighDeck)

  const thighMattress = new THREE.Mesh(
    createMattressSegmentGeometry(L_THIGH - 0.01, mattW, mattT),
    materials.mattress,
  )
  thighMattress.position.set(L_THIGH / 2, 0.018, 0)
  thighMattress.castShadow = true
  thighMattress.receiveShadow = true
  thighPivot.add(thighMattress)

  const thighPneumatic = createPneumaticStrip(L_THIGH - 0.015, mattW, materials)
  thighPneumatic.position.set(L_THIGH / 2, 0.018 + mattT + 0.003, 0)
  thighPivot.add(thighPneumatic)
  pneumaticStrips.push(thighPneumatic)

  // --- Panturrilha ---
  const calfPivot = new THREE.Group()
  calfPivot.name = 'ArticulacaoPanturrilha'
  calfPivot.position.set(L_THIGH, 0, 0)
  thighPivot.add(calfPivot)

  const calfDeck = new THREE.Mesh(
    new THREE.BoxGeometry(L_CALF - 0.014, 0.016, deckW),
    materials.whiteSteel,
  )
  calfDeck.position.set(L_CALF / 2, 0.008, 0)
  calfDeck.castShadow = true
  calfDeck.receiveShadow = true
  calfPivot.add(calfDeck)

  const calfMattress = new THREE.Mesh(
    createMattressSegmentGeometry(L_CALF - 0.014, mattW, mattT),
    materials.mattress,
  )
  calfMattress.position.set(L_CALF / 2, 0.018, 0)
  calfMattress.castShadow = true
  calfMattress.receiveShadow = true
  calfPivot.add(calfMattress)

  const calfPneumatic = createPneumaticStrip(L_CALF - 0.03, mattW, materials)
  calfPneumatic.position.set(L_CALF / 2, 0.018 + mattT + 0.003, 0)
  calfPivot.add(calfPneumatic)
  pneumaticStrips.push(calfPneumatic)

  // Compressor do colchao pneumatico
  const compressorGroup = new THREE.Group()
  compressorGroup.name = 'CompressorPneumatico'
  const compBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.24), materials.compressor)
  compBody.castShadow = true
  compressorGroup.add(compBody)
  const compDial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.014, 16),
    materials.buttonBlue,
  )
  compDial.rotation.z = Math.PI / 2
  compDial.position.set(0.057, 0.01, 0.04)
  compressorGroup.add(compDial)
  const compPower = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.026, 0.016), materials.mattress)
  compPower.position.set(0.057, 0.01, -0.05)
  compressorGroup.add(compPower)
  compressorGroup.position.set(frameL / 2 + 0.115, 0.14, 0)
  upperGroup.add(compressorGroup)
  pneumaticStrips.push(compressorGroup)

  // =========================================================================
  // 5. 4 GRADES LATERAIS BIPARTIDAS EM ABS COM TRAVA VERMELHA
  // =========================================================================
  const sideRailGeo = createSideRailGeometry(0.64, 0.305, 0.026)

  const headRailFront = createSideRailAssembly(sideRailGeo, materials, 1)
  headRailFront.position.set(-0.37, 0.015, frameW / 2 + 0.024)
  backPivot.add(headRailFront)

  const headRailBack = createSideRailAssembly(sideRailGeo, materials, -1)
  headRailBack.position.set(-0.37, 0.015, -(frameW / 2 + 0.024))
  backPivot.add(headRailBack)

  const footRailFront = createSideRailAssembly(sideRailGeo, materials, 1)
  footRailFront.position.set(0.41, 0.04, frameW / 2 + 0.024)
  upperGroup.add(footRailFront)

  const footRailBack = createSideRailAssembly(sideRailGeo, materials, -1)
  footRailBack.position.set(0.41, 0.04, -(frameW / 2 + 0.024))
  upperGroup.add(footRailBack)

  const backPushStruts = [-0.24, 0.24].map((zPos) => {
    const strut = new THREE.Mesh(unitRodGeo, materials.whiteSteel)
    upperGroup.add(strut)
    return { zPos, strut }
  })
  const calfSupportStruts = [-0.24, 0.24].map((zPos) => {
    const strut = new THREE.Mesh(unitRodGeo, materials.whiteSteel)
    upperGroup.add(strut)
    return { zPos, strut }
  })

  const pA = new THREE.Vector3()
  const pB = new THREE.Vector3()
  const midAct = new THREE.Vector3()

  function setMode(nextMode) {
    const isElectric = nextMode !== 'manual'
    electricMechanism.visible = isElectric
    handRemote.visible = isElectric
    manualCranks.group.visible = !isElectric
  }

  function setPneumatic(enabled) {
    const on = Boolean(enabled)
    for (const strip of pneumaticStrips) strip.visible = on
    // Sobe levemente o travesseiro quando o colchao pneumatico entra por cima
    if (pillow) pillow.position.y = 0.018 + mattT + (on ? 0.098 : 0.056)
  }

  function setPose({ back = 0, legs = 0, lift = 0.667, railsDown: drop = 0 } = {}) {
    const clampedBack = Math.min(1, Math.max(0, back))
    const clampedLegs = Math.min(1, Math.max(0, legs))
    const clampedLift = Math.min(1, Math.max(0, lift))
    const clampedDrop = Math.min(1, Math.max(0, drop))

    const mattressTopY = liftToHeightMeters(clampedLift)
    const frameY = mattressTopY - (deckY + 0.018 + mattT)
    upperGroup.position.y = frameY

    for (const arm of liftArms) {
      pA.set(-0.6, baseY + 0.018, arm.zPos)
      pB.set(-0.24, frameY - 0.018, arm.zPos)
      placeBarBetween(arm.headArm, pA, pB)

      pA.set(0.6, baseY + 0.018, arm.zPos)
      pB.set(0.24, frameY - 0.018, arm.zPos)
      placeBarBetween(arm.footArm, pA, pB)

      pA.set(-0.22, baseY + 0.018, arm.zPos)
      pB.set(-0.22, frameY - 0.018, arm.zPos)
      placeBarBetween(arm.midStrut, pA, pB)
    }

    pA.set(0.36, baseY + 0.02, 0)
    pB.set(-0.08, frameY - 0.03, 0)
    midAct.lerpVectors(pA, pB, 0.52)
    placeBarBetween(motorBody, pA, midAct)
    placeBarBetween(motorRod, midAct, pB)
    motorBox.position.set(0.18, frameY - 0.068, 0)

    const backRad = clampedBack * 1.12
    const thighRad = clampedLegs * 0.56
    backPivot.rotation.z = -backRad
    thighPivot.rotation.z = thighRad
    calfPivot.rotation.z = -thighRad * 0.9

    const backAttachX = -0.22 - Math.cos(backRad) * 0.36
    const backAttachY = deckY + Math.sin(backRad) * 0.36
    for (const s of backPushStruts) {
      pA.set(-0.05, 0, s.zPos)
      pB.set(backAttachX, backAttachY, s.zPos)
      placeBarBetween(s.strut, pA, pB)
    }

    const kneeX = 0.06 + Math.cos(thighRad) * L_THIGH
    const kneeY = deckY + Math.sin(thighRad) * L_THIGH
    const calfAngle = thighRad - thighRad * 0.9
    const calfMidX = kneeX + Math.cos(calfAngle) * 0.24
    const calfMidY = kneeY + Math.sin(calfAngle) * 0.24
    for (const s of calfSupportStruts) {
      pA.set(0.62, 0, s.zPos)
      pB.set(calfMidX, calfMidY, s.zPos)
      placeBarBetween(s.strut, pA, pB)
    }

    headRailFront.position.y = 0.015 - clampedDrop * 0.255
    headRailFront.position.z = frameW / 2 + 0.024 + clampedDrop * 0.022
    footRailFront.position.y = 0.04 - clampedDrop * 0.265
    footRailFront.position.z = frameW / 2 + 0.024 + clampedDrop * 0.022

    if (manualCranks.cranks.length === 3) {
      manualCranks.cranks[0].rotation.x = clampedBack * Math.PI * 6
      manualCranks.cranks[1].rotation.x = clampedLegs * Math.PI * 6
      manualCranks.cranks[2].rotation.x = clampedLift * Math.PI * 6
    }

    return { mattressTopY, frameY }
  }

  setMode(mode)
  setPneumatic(showPneumatic)
  setPose({ ...pose, railsDown })

  return {
    root,
    setPose,
    setMode,
    setPneumatic,
  }
}
