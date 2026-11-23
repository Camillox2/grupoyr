import * as THREE from 'three'
import { buildHospitalBed } from '../../bed3d/buildHospitalBed.js'
import { buildOverlays3d } from '../../bed3d/buildOverlays3d.js'
import { REST_POSE } from '../../bed3d/specs.js'

/**
 * Maquete 3D isométrica (diorama arquitetônico) da casa em miniatura — Ato 2.
 *
 * - Escala real 1:1 (1 unidade = 1 metro) para reaproveitar diretamente o
 *   modelo real da cama hospitalar (buildHospitalBed) e as cotas reais
 *   (buildOverlays3d) sem duplicar geometria nem alterar os arquivos da home.
 * - Três cômodos legíveis em cutaway: Quarto (cama hospitalar + colchão
 *   pneumático), Banheiro (cadeira de banho em alumínio) e Sala (em breve).
 * - Caminhão da YR na entrada + peças da cama que voam em arco até o quarto
 *   e se montam na etapa 7.
 */

function makeTileTexture(base, line, cells = 8) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = line
  ctx.lineWidth = 2
  const step = 256 / cells
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(256, i * step)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function makeWoodTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#cfa982'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(130,86,48,0.08)' : 'rgba(255,244,228,0.06)'
    ctx.fillRect(0, i * 32, 256, 30)
    ctx.fillStyle = 'rgba(105,68,38,0.16)'
    ctx.fillRect(0, i * 32 + 30, 256, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}

function makeTruckBadgeTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  // Fundo branco limpo do baú
  ctx.fillStyle = '#f8fafb'
  ctx.fillRect(0, 0, 512, 256)
  // Faixa inferior da marca (azul-marinho + verde-água)
  ctx.fillStyle = '#071d35'
  ctx.fillRect(0, 188, 512, 68)
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 174, 512, 16)
  // Emblema YR
  ctx.fillStyle = '#071d35'
  ctx.font = '800 88px Manrope, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('YR', 150, 128)
  ctx.fillStyle = '#0f766e'
  ctx.font = '700 32px Manrope, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('HOSPITALAR', 236, 108)
  ctx.fillStyle = '#405267'
  ctx.font = '600 22px Manrope, sans-serif'
  ctx.fillText('Entrega e montagem', 236, 142)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Cadeira de banho em alumínio (modelo simplificado fiel ao item real do catálogo). */
function buildShowerChair(simplified) {
  const g = new THREE.Group()
  g.name = 'CadeiraDeBanho'
  const seg = simplified ? 8 : 14

  const aluMat = new THREE.MeshStandardMaterial({ color: 0xd7dfe6, metalness: 0.65, roughness: 0.28 })
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xf4f7f8, roughness: 0.35, metalness: 0.05 })
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.55 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x16293d, roughness: 0.7 })

  const tube = (r, h) => new THREE.CylinderGeometry(r, r, h, seg)

  // 4 pernas + rodízios com trava
  const legPos = [
    [-0.22, -0.21],
    [0.22, -0.21],
    [-0.22, 0.21],
    [0.22, 0.21],
  ]
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(tube(0.014, 0.48), aluMat)
    leg.position.set(lx, 0.29, lz)
    leg.castShadow = !simplified
    g.add(leg)

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.024, seg), wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(lx, 0.042, lz)
    g.add(wheel)

    // Trava do rodízio em destaque verde-água
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.048), gripMat)
    brake.position.set(lx, 0.072, lz + 0.03)
    g.add(brake)
  }

  // Travessas laterais da base
  for (const side of [-0.22, 0.22]) {
    const bar = new THREE.Mesh(tube(0.012, 0.44), aluMat)
    bar.rotation.x = Math.PI / 2
    bar.position.set(side, 0.22, 0)
    g.add(bar)
  }
  const backCross = new THREE.Mesh(tube(0.012, 0.44), aluMat)
  backCross.rotation.z = Math.PI / 2
  backCross.position.set(0, 0.22, -0.21)
  g.add(backCross)

  // Assento sanitário (formato em U / vazado)
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.16), seatMat)
  seatBack.position.set(0, 0.52, -0.14)
  seatBack.castShadow = true
  g.add(seatBack)
  for (const sx of [-0.155, 0.155]) {
    const sidePad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.3), seatMat)
    sidePad.position.set(sx, 0.52, 0.08)
    sidePad.castShadow = true
    g.add(sidePad)
  }

  // Apoios de braço + manoplas
  for (const side of [-0.24, 0.24]) {
    const post = new THREE.Mesh(tube(0.013, 0.22), aluMat)
    post.position.set(side, 0.62, 0.15)
    g.add(post)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.36), gripMat)
    arm.position.set(side, 0.72, 0.0)
    arm.castShadow = !simplified
    g.add(arm)
  }

  // Encosto e hastes traseiras
  for (const side of [-0.22, 0.22]) {
    const upright = new THREE.Mesh(tube(0.014, 0.44), aluMat)
    upright.position.set(side, 0.72, -0.21)
    g.add(upright)
  }
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.04), seatMat)
  backrest.position.set(0, 0.82, -0.21)
  backrest.castShadow = true
  g.add(backrest)

  // Apoio de pés frontal rebatível
  const footBar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.018, 0.11), wheelMat)
  footBar.position.set(0, 0.14, 0.28)
  g.add(footBar)

  return g
}

/** Caminhão miniatura da YR que entra na cena na etapa 7. */
function buildYrTruck(simplified) {
  const truck = new THREE.Group()
  truck.name = 'CaminhaoYR'
  const seg = simplified ? 10 : 16

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf7fafb, roughness: 0.38, metalness: 0.05 })
  const badgeMat = new THREE.MeshStandardMaterial({ map: makeTruckBadgeTexture(), roughness: 0.42 })
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x071d35, roughness: 0.4, metalness: 0.15 })
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.4 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0e6, roughness: 0.15, metalness: 0.3 })
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161d26, roughness: 0.85 })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.6, roughness: 0.3 })
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd57a, emissiveIntensity: 0.9 })

  // Chassi
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.14, 0.96), navyMat)
  chassis.position.set(0, 0.26, 0)
  truck.add(chassis)

  // Baú (frente + teto + laterais com logo YR + traseira aberta com portas)
  const cargoTop = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.08, 1.02), bodyMat)
  cargoTop.position.set(-0.34, 1.24, 0)
  cargoTop.castShadow = true
  truck.add(cargoTop)

  const cargoFloor = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 1.0), navyMat)
  cargoFloor.position.set(-0.34, 0.36, 0)
  truck.add(cargoFloor)

  const cargoFront = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 1.0), bodyMat)
  cargoFront.position.set(0.41, 0.8, 0)
  truck.add(cargoFront)

  // Laterais com textura do logo YR
  const sideGeo = new THREE.PlaneGeometry(1.56, 0.88)
  const sideFront = new THREE.Mesh(sideGeo, badgeMat)
  sideFront.position.set(-0.34, 0.8, 0.51)
  sideFront.castShadow = true
  truck.add(sideFront)
  const sideBack = new THREE.Mesh(sideGeo, badgeMat)
  sideBack.rotation.y = Math.PI
  sideBack.position.set(-0.34, 0.8, -0.51)
  truck.add(sideBack)

  // Portas traseiras articuladas (abrem para as peças saírem)
  const leftDoorPivot = new THREE.Group()
  leftDoorPivot.position.set(-1.12, 0.8, -0.5)
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.49), bodyMat)
  leftDoor.position.set(0, 0, 0.245)
  leftDoorPivot.add(leftDoor)
  truck.add(leftDoorPivot)

  const rightDoorPivot = new THREE.Group()
  rightDoorPivot.position.set(-1.12, 0.8, 0.5)
  const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.49), bodyMat)
  rightDoor.position.set(0, 0, -0.245)
  rightDoorPivot.add(rightDoor)
  truck.add(rightDoorPivot)

  // Cabine frontal (+X = frente do caminhão)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.78, 0.94), navyMat)
  cab.position.set(0.84, 0.72, 0)
  cab.castShadow = true
  truck.add(cab)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.96), tealMat)
  stripe.position.set(0.84, 0.46, 0)
  truck.add(stripe)

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.8), glassMat)
  windshield.position.set(1.21, 0.84, 0)
  truck.add(windshield)

  for (const z of [-0.32, 0.32]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.16), lampMat)
    head.position.set(1.22, 0.46, z)
    truck.add(head)
  }

  // 4 rodas rotacionáveis
  const wheels = []
  const wPositions = [
    [-0.68, 0.2, 0.48],
    [-0.68, 0.2, -0.48],
    [0.82, 0.2, 0.48],
    [0.82, 0.2, -0.48],
  ]
  for (const [wx, wy, wz] of wPositions) {
    const wg = new THREE.Group()
    wg.position.set(wx, wy, wz)
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, seg), tireMat)
    tire.rotation.x = Math.PI / 2
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.15, seg), rimMat)
    rim.rotation.x = Math.PI / 2
    wg.add(tire, rim)
    truck.add(wg)
    wheels.push(wg)
  }

  return {
    root: truck,
    wheels,
    setDoorOpen(t) {
      const a = Math.min(1, Math.max(0, t)) * 1.95
      leftDoorPivot.rotation.y = a
      rightDoorPivot.rotation.y = -a
    },
    spinWheels(angle) {
      for (const w of wheels) w.rotation.z = angle
    },
  }
}

/** Peças estilizadas da cama que voam do caminhão até o quarto e se encaixam. */
function buildFlyingBedPieces(bedPos) {
  const group = new THREE.Group()
  group.name = 'PecasVoando'

  const steelMat = new THREE.MeshStandardMaterial({ color: 0xe6edf2, roughness: 0.35, metalness: 0.4 })
  const absMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.32 })
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x071d35, roughness: 0.4 })
  const mattMat = new THREE.MeshStandardMaterial({ color: 0x17695a, roughness: 0.65 })
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd9e4ea, roughness: 0.3, metalness: 0.5 })

  const specs = [
    // 0: Chassi inferior
    {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.12, 0.82), steelMat),
      end: new THREE.Vector3(bedPos.x, 0.22, bedPos.z),
      win: [0.0, 0.38],
      arcH: 1.95,
    },
    // 1: Estrado + cabeceira ABS
    {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.94), absMat),
      end: new THREE.Vector3(bedPos.x - 0.98, 0.72, bedPos.z),
      win: [0.14, 0.54],
      arcH: 2.35,
    },
    // 2: Peseira ABS com detalhe azul-marinho
    {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.94), navyMat),
      end: new THREE.Vector3(bedPos.x + 0.98, 0.68, bedPos.z),
      win: [0.24, 0.64],
      arcH: 2.25,
    },
    // 3: Colchão verde-esmeralda YR
    {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.86), mattMat),
      end: new THREE.Vector3(bedPos.x, 0.62, bedPos.z),
      win: [0.34, 0.78],
      arcH: 2.65,
    },
    // 4: Grades laterais de proteção
    {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.28, 0.06), railMat),
      end: new THREE.Vector3(bedPos.x, 0.76, bedPos.z + 0.48),
      win: [0.48, 0.9],
      arcH: 2.4,
    },
  ]

  for (const s of specs) {
    s.mesh.visible = false
    group.add(s.mesh)
  }

  return { group, specs }
}

/**
 * Constrói a maquete completa e devolve API de controle em 60fps.
 */
export function buildDioramaHouse({ simplified = false } = {}) {
  const root = new THREE.Group()
  root.name = 'CasaEmMiniaturaYR'

  // Materiais arquitetônicos da marca (areia quente + azul-marinho + verde-água)
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.82 })
  const navyTrimMat = new THREE.MeshStandardMaterial({ color: 0x071d35, roughness: 0.45, metalness: 0.12 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf7f2ea, roughness: 0.78 })
  const wallCutMat = new THREE.MeshStandardMaterial({ color: 0x16314f, roughness: 0.55 })
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x739f8c, roughness: 0.9 })
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xd0d6d4, roughness: 0.88 })
  const woodMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.68 })
  const bathTileMat = new THREE.MeshStandardMaterial({ map: makeTileTexture('#e3efec', '#c5dbd6', 8), roughness: 0.45 })
  const livingFloorMat = new THREE.MeshStandardMaterial({ map: makeTileTexture('#e2d2bc', '#d1bea4', 6), roughness: 0.75 })
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.68 })
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 })
  const softNavyMat = new THREE.MeshStandardMaterial({ color: 0x18385c, roughness: 0.72 })
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xf4ece0, roughness: 0.82 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdaf0f5,
    transparent: true,
    opacity: 0.34,
    roughness: 0.12,
    metalness: 0.05,
  })

  // =========================================================================
  // 1. BASE ESCULTURAL DA MAQUETE + CALÇADA/ENTRADA PARA O CAMINHÃO
  // =========================================================================
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.24, 5.2), plinthMat)
  plinth.position.set(0, -0.12, 0.25)
  plinth.receiveShadow = true
  root.add(plinth)

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(7.32, 0.1, 5.32), navyTrimMat)
  skirt.position.set(0, -0.25, 0.25)
  root.add(skirt)

  // Faixa de jardim frontal + calçada da entrada do caminhão
  const garden = new THREE.Mesh(new THREE.BoxGeometry(7.08, 0.03, 0.78), grassMat)
  garden.position.set(0, 0.015, 2.38)
  garden.receiveShadow = true
  root.add(garden)

  const driveway = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.06, 1.48), roadMat)
  driveway.position.set(0, -0.19, 3.55)
  driveway.receiveShadow = true
  root.add(driveway)

  // Árvores minimalistas estilo maquete de arquitetura
  const treePositions = [
    [-3.15, 2.42, 0.42],
    [3.12, 2.4, 0.36],
    [2.52, 2.48, 0.28],
  ]
  const treeSeg = simplified ? 7 : 12
  for (const [tx, tz, tr] of treePositions) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.42, treeSeg), woodDarkMat)
    trunk.position.set(tx, 0.21, tz)
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(tr, simplified ? 0 : 1), tealMat)
    crown.position.set(tx, 0.56 + tr * 0.4, tz)
    crown.castShadow = !simplified
    root.add(trunk, crown)
  }

  // =========================================================================
  // 2. PISOS DOS 3 CÔMODOS
  // =========================================================================
  // Quarto (esquerda): x -3.2 .. +0.25, z -2.2 .. +1.95
  const bedroomFloor = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 4.15), woodMat)
  bedroomFloor.rotation.x = -Math.PI / 2
  bedroomFloor.position.set(-1.475, 0.008, -0.125)
  bedroomFloor.receiveShadow = true
  root.add(bedroomFloor)

  // Banheiro (direita fundo): x +0.25 .. +3.2, z -2.2 .. -0.05
  const bathFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 2.15), bathTileMat)
  bathFloor.rotation.x = -Math.PI / 2
  bathFloor.position.set(1.725, 0.009, -1.125)
  bathFloor.receiveShadow = true
  root.add(bathFloor)

  // Sala (direita frente): x +0.25 .. +3.2, z -0.05 .. +1.95
  const livingFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 2.0), livingFloorMat)
  livingFloor.rotation.x = -Math.PI / 2
  livingFloor.position.set(1.725, 0.008, 0.95)
  livingFloor.receiveShadow = true
  root.add(livingFloor)

  // =========================================================================
  // 3. PAREDES EM CUTAWAY (frente e direita rebaixadas para leitura isométrica)
  // =========================================================================
  const addWall = (w, h, d, x, y, z, mat = wallMat, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    m.castShadow = cast
    m.receiveShadow = true
    root.add(m)
    // Friso azul-marinho no topo do corte arquitetônico
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.035, d + 0.01), wallCutMat)
    cap.position.set(x, y + h / 2 + 0.018, z)
    root.add(cap)
    return m
  }

  // Parede traseira principal (com recorte de janela no quarto)
  addWall(1.05, 2.05, 0.14, -2.75, 1.025, -2.25)
  addWall(1.45, 0.72, 0.14, -1.5, 0.36, -2.25) // peitoril janela quarto
  addWall(1.45, 0.35, 0.14, -1.5, 1.875, -2.25) // verga janela quarto
  addWall(4.02, 2.05, 0.14, 1.24, 1.025, -2.25)

  // Vidro + moldura da janela do quarto
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.98), glassMat)
  winGlass.position.set(-1.5, 1.21, -2.25)
  root.add(winGlass)
  const winFrameH = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.05, 0.16), navyTrimMat)
  winFrameH.position.set(-1.5, 1.21, -2.25)
  const winFrameV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.16), navyTrimMat)
  winFrameV.position.set(-1.5, 1.21, -2.25)
  root.add(winFrameH, winFrameV)

  // Parede lateral esquerda (atrás da cabeceira da cama)
  addWall(0.14, 2.05, 4.34, -3.27, 1.025, -0.15)

  // Divisória interna Quarto | Banheiro-Sala (com vão de passagem na frente)
  addWall(0.12, 1.68, 2.7, 0.25, 0.84, -0.9)

  // Divisória interna Banheiro | Sala (meia altura baixa para deixar a cadeira de banho visível)
  addWall(2.9, 0.88, 0.11, 1.74, 0.44, -0.05)

  // Paredes frontais e direita em corte baixo (0.26m)
  addWall(6.58, 0.26, 0.12, -0.02, 0.13, 1.98, wallMat, false)
  addWall(0.12, 0.26, 4.24, 3.24, 0.13, -0.14, wallMat, false)

  // =========================================================================
  // 4. QUARTO — CAMA HOSPITALAR REAL 3D + MEDIDAS 3D + MÓVEIS ACOLHEDORES
  // =========================================================================
  const bedPos = new THREE.Vector3(-1.52, 0.01, -0.35)
  const bedAnchor = new THREE.Group()
  bedAnchor.position.copy(bedPos)
  root.add(bedAnchor)

  const bed = buildHospitalBed({
    mode: 'eletrica',
    pose: REST_POSE,
    showPneumatic: false,
    railsDown: 0,
  })
  bedAnchor.add(bed.root)

  const overlays = buildOverlays3d()
  overlays.setOptions({ showDimensions: false, showCaregiverZone: false })
  bedAnchor.add(overlays.group)

  // Tapete aconchegante sob a cama
  const bedRug = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 0.016, 1.72),
    new THREE.MeshStandardMaterial({ color: 0xefe7d8, roughness: 0.95 }),
  )
  bedRug.position.set(-1.52, 0.014, -0.35)
  bedRug.receiveShadow = true
  root.add(bedRug)

  // Criado-mudo + abajur acolhedor (acende mais quente quando a cama se monta!)
  const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.44), woodDarkMat)
  nightstand.position.set(-2.92, 0.26, -1.55)
  nightstand.castShadow = !simplified
  root.add(nightstand)

  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.22, 8), navyTrimMat)
  lampStem.position.set(-2.92, 0.62, -1.55)
  const lampShadeMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d4,
    emissive: 0xffc66e,
    emissiveIntensity: 0.45,
    roughness: 0.5,
  })
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 12, 1, true), lampShadeMat)
  lampShade.position.set(-2.92, 0.78, -1.55)
  root.add(lampStem, lampShade)

  // Quadro na parede esquerda acima da cabeceira
  const artFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.54, 0.78), navyTrimMat)
  artFrame.position.set(-3.18, 1.48, -0.35)
  const artCanvas = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.68), tealMat)
  artCanvas.position.set(-3.17, 1.48, -0.35)
  root.add(artFrame, artCanvas)

  // Luz cálida interna do quarto (ganha brilho na montagem da cama)
  const bedroomWarmLight = new THREE.PointLight(0xffcf87, simplified ? 0.55 : 0.9, 4.5, 1.6)
  bedroomWarmLight.position.set(-2.2, 1.55, -0.6)
  root.add(bedroomWarmLight)

  // =========================================================================
  // 5. BANHEIRO — BOX DE VIDRO + BARRA DE APOIO + CADEIRA DE BANHO REAL
  // =========================================================================
  // Box de vidro no canto fundo-direito do banheiro
  const showerGlass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.65, 1.18), glassMat)
  showerGlass.position.set(1.65, 0.84, -1.58)
  root.add(showerGlass)
  const showerBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8e0e6, metalness: 0.75, roughness: 0.2 }),
  )
  showerBar.rotation.z = Math.PI / 2
  showerBar.position.set(2.45, 0.92, -2.14)
  root.add(showerBar)

  // Pia + espelho na parede divisória do banheiro
  const vanity = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.84), creamMat)
  vanity.position.set(0.56, 0.36, -1.35)
  vanity.castShadow = !simplified
  const mirror = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.62, 0.64),
    new THREE.MeshStandardMaterial({ color: 0xcbe3ea, metalness: 0.6, roughness: 0.15 }),
  )
  mirror.position.set(0.33, 1.22, -1.35)
  root.add(vanity, mirror)

  // Vaso sanitário estilizado
  const toiletBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.38, 10), creamMat)
  toiletBase.position.set(1.08, 0.19, -1.9)
  const toiletTank = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.16), creamMat)
  toiletTank.position.set(1.08, 0.56, -2.08)
  root.add(toiletBase, toiletTank)

  // Cadeira de banho (item real do catálogo YR!) em destaque no banheiro
  const showerChair = buildShowerChair(simplified)
  showerChair.position.set(2.22, 0.01, -1.12)
  showerChair.rotation.y = -0.58
  root.add(showerChair)

  // =========================================================================
  // 6. SALA (EM BREVE) — AMBIENTE ACOLHEDOR
  // =========================================================================
  const livingRug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.015, simplified ? 16 : 28),
    creamMat,
  )
  livingRug.position.set(1.75, 0.015, 0.98)
  livingRug.receiveShadow = true
  root.add(livingRug)

  // Sofá compacto azul-marinho
  const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.34, 0.68), softNavyMat)
  sofaSeat.position.set(1.75, 0.22, 0.42)
  sofaSeat.castShadow = !simplified
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.48, 0.18), softNavyMat)
  sofaBack.position.set(1.75, 0.52, 0.16)
  const sofaCushion = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.14), tealMat)
  sofaCushion.position.set(1.32, 0.48, 0.34)
  sofaCushion.rotation.y = 0.22
  root.add(sofaSeat, sofaBack, sofaCushion)

  // Mesinha de centro + vaso
  const coffeeTable = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), woodDarkMat)
  coffeeTable.position.set(1.75, 0.34, 1.24)
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.32, 8), navyTrimMat)
  tableLeg.position.set(1.75, 0.16, 1.24)
  root.add(coffeeTable, tableLeg)

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10), creamMat)
  pot.position.set(2.85, 0.12, 0.42)
  const plant = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), tealMat)
  plant.position.set(2.85, 0.42, 0.42)
  root.add(pot, plant)

  // =========================================================================
  // 7. CAMINHÃO YR + ANIMAÇÃO DAS PEÇAS DA CAMA VOANDO ATÉ O QUARTO
  // =========================================================================
  const truck = buildYrTruck(simplified)
  truck.root.position.set(-7.5, -0.15, 3.55)
  truck.root.visible = false
  root.add(truck.root)

  const flying = buildFlyingBedPieces(bedPos)
  root.add(flying.group)

  const smoothstep = (x) => {
    const t = Math.min(1, Math.max(0, x))
    return t * t * (3 - 2 * t)
  }

  const truckOrigin = new THREE.Vector3(-1.45, 0.65, 3.55)

  /**
   * Atualiza o estado da entrega/montagem (progress: 0 = inativo/cama normal,
   * 0.01..0.34 = caminhão entra e estaciona, 0.34..0.88 = peças voam em arco
   * até o quarto, 0.88..1.0 = cama real se acende montada).
   */
  function setDeliveryProgress(p) {
    const t = Math.min(1, Math.max(0, p))
    if (t <= 0.005) {
      truck.root.visible = false
      flying.group.visible = false
      bed.root.visible = true
      bed.root.scale.setScalar(1)
      lampShadeMat.emissiveIntensity = 0.45
      bedroomWarmLight.intensity = simplified ? 0.55 : 0.9
      return
    }

    truck.root.visible = true
    // Fase 1: caminhão dirige de x = -6.8 até x = +0.25 (enquadra o logo YR inteiro no celular)
    const driveT = smoothstep(t / 0.34)
    const truckX = THREE.MathUtils.lerp(-6.8, 0.25, driveT)
    truck.root.position.set(truckX, -0.15, 3.55)
    truck.spinWheels(-driveT * Math.PI * 5.6)

    // Portas traseiras abrem logo ao estacionar
    const doorT = smoothstep((t - 0.28) / 0.12)
    truck.setDoorOpen(doorT)

    // Fase 2: peças voam em arco do baú aberto até o quarto
    const flyPhase = (t - 0.34) / 0.54
    const assemblyComplete = t >= 0.86

    if (!assemblyComplete) {
      // Cama real fica escondida enquanto as peças ainda não pousaram
      bed.root.visible = false
      flying.group.visible = flyPhase > 0
      truckOrigin.set(truckX - 1.05, 0.62, 3.55)

      for (const spec of flying.specs) {
        const localT = smoothstep((flyPhase - spec.win[0]) / (spec.win[1] - spec.win[0]))
        spec.mesh.visible = localT > 0.01
        if (!spec.mesh.visible) continue
        spec.mesh.position.lerpVectors(truckOrigin, spec.end, localT)
        // Arco parabólico gracioso acima da parede baixa
        spec.mesh.position.y += Math.sin(localT * Math.PI) * spec.arcH
        spec.mesh.rotation.set(
          Math.sin(localT * Math.PI) * 0.45,
          (1 - localT) * Math.PI * 0.8,
          Math.sin(localT * Math.PI) * -0.25,
        )
        const sc = 0.55 + 0.45 * localT
        spec.mesh.scale.setScalar(sc)
      }
      lampShadeMat.emissiveIntensity = 0.35
      bedroomWarmLight.intensity = simplified ? 0.45 : 0.75
    } else {
      // Fase 3: snap suave na cama hospitalar real 3D + luz cálida no quarto!
      flying.group.visible = false
      bed.root.visible = true
      const pop = smoothstep((t - 0.86) / 0.14)
      bed.root.scale.setScalar(0.92 + 0.08 * pop)
      lampShadeMat.emissiveIntensity = 0.45 + 1.15 * pop
      bedroomWarmLight.intensity = (simplified ? 0.55 : 0.9) + 0.75 * pop
    }
  }

  // Pontos de interesse (hotspots) em coordenadas locais da maquete
  const hotspots = [
    { id: 'quarto', label: 'Quarto', sub: 'Cama hospitalar', anchor: new THREE.Vector3(-1.52, 1.15, -0.35) },
    { id: 'banheiro', label: 'Banheiro', sub: 'Cadeira de banho', anchor: new THREE.Vector3(2.05, 1.02, -1.12) },
    { id: 'sala', label: 'Sala', sub: 'Em breve', anchor: new THREE.Vector3(1.75, 0.82, 0.92) },
  ]

  // Vistas de câmera em coordenadas locais da maquete (alinhadas ao target)
  const cameraPresets = {
    overview: {
      pos: new THREE.Vector3(5.6, 5.7, 6.5),
      target: new THREE.Vector3(0.0, 0.35, 0.25),
    },
    quarto: {
      pos: new THREE.Vector3(0.15, 1.85, 2.25),
      target: new THREE.Vector3(-1.52, 0.68, -0.35),
    },
    banheiro: {
      pos: new THREE.Vector3(3.95, 2.85, 0.15),
      target: new THREE.Vector3(2.05, 0.48, -1.18),
    },
    sala: {
      pos: new THREE.Vector3(3.65, 2.2, 3.15),
      target: new THREE.Vector3(1.72, 0.42, 0.85),
    },
    delivery: {
      pos: new THREE.Vector3(4.1, 4.45, 7.35),
      target: new THREE.Vector3(-0.45, 0.52, 1.1),
    },
  }

  return {
    root,
    bed,
    bedAnchor,
    overlays,
    hotspots,
    cameraPresets,
    setDeliveryProgress,
  }
}
