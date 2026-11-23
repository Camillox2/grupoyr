import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Quarto residencial 3D de alto padrao inspirado diretamente na estetica real
 * da marca Grupo YR (`public/products/cena-cama-eletrica.webp`):
 *
 * - Paredes em paineis arquitetonicos fendi/taupe quente com frisos escuros e AO nos cantos
 * - Painel horizontal amadeirado em carvalho-nogueira recuado com fita de LED ambar quente
 * - Janela panoramica piso-teto com vista suave desfocada (jardim ensolarado + horizonte)
 *   e cortinas 3D em onda dupla (voal branco translucido + linho champagne prega wave)
 * - Piso em porcelanato travertino/areia acetinado com mapa de rugosidade + tapete bouclé
 *   com cantos suaves e sombra de contato (zero Z-fighting!)
 * - Poltrona organica curva em tecido fendi junto a janela + mesa de cabeceira moderna
 *   com abajur aceso + planta Ficus 3D real com folhas curvadas/nervuradas em vaso ceramico
 *   unico sobre suporte de nogueira (zero piscamento na base!).
 */

/** Textura de sombra de contato suave (AO) para assentar moveis e cama no piso. */
function makeSoftShadowTexture(roundness = 0.35, darkness = 0.38) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 256, 256)

  const g = ctx.createRadialGradient(128, 128, 128 * roundness * 0.4, 128, 128, 122)
  g.addColorStop(0, `rgba(38, 28, 20, ${darkness})`)
  g.addColorStop(0.55, `rgba(38, 28, 20, ${darkness * 0.48})`)
  g.addColorStop(1, 'rgba(38, 28, 20, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)

  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

/** Piso porcelanato acetinado areia/travertino quente (igual cena-cama-eletrica.webp). */
function makeTravertineFloorTextures() {
  const size = 1024
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = size
  colorCanvas.height = size
  const ctx = colorCanvas.getContext('2d')

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = size
  roughCanvas.height = size
  const rctx = roughCanvas.getContext('2d')

  // Base travertino quente acetinado
  ctx.fillStyle = '#d3c6b5'
  ctx.fillRect(0, 0, size, size)
  rctx.fillStyle = '#6c6c6c'
  rctx.fillRect(0, 0, size, size)

  const tiles = 2
  const tileS = size / tiles
  const tileTones = ['#d6c9b8', '#cfc1af', '#d3c5b4', '#d8cbb9']

  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      const x = tx * tileS
      const y = ty * tileS
      ctx.fillStyle = tileTones[(ty * tiles + tx) % tileTones.length]
      ctx.fillRect(x, y, tileS, tileS)

      // Veios sutis de pedra natural / travertino
      for (let v = 0; v < 42; v += 1) {
        const vy = y + ((v * 31 + tx * 53 + ty * 17) % tileS)
        ctx.strokeStyle =
          v % 2 === 0 ? 'rgba(255, 250, 242, 0.14)' : 'rgba(136, 118, 96, 0.08)'
        ctx.lineWidth = 4 + (v % 8)
        ctx.beginPath()
        ctx.moveTo(x, vy)
        ctx.bezierCurveTo(
          x + tileS * 0.35,
          vy + Math.sin(v + tx) * 14,
          x + tileS * 0.7,
          vy - Math.cos(v + ty) * 14,
          x + tileS,
          vy + 4,
        )
        ctx.stroke()

        rctx.strokeStyle = v % 2 === 0 ? '#5c5c5c' : '#828282'
        rctx.lineWidth = 5
        rctx.beginPath()
        rctx.moveTo(x, vy)
        rctx.lineTo(x + tileS, vy + 3)
        rctx.stroke()
      }

      // Rejunte super fino e sofisticado
      ctx.strokeStyle = 'rgba(130, 115, 98, 0.28)'
      ctx.lineWidth = 3
      ctx.strokeRect(x + 1.5, y + 1.5, tileS - 3, tileS - 3)
      rctx.strokeStyle = '#d4d4d4'
      rctx.lineWidth = 4
      rctx.strokeRect(x + 1.5, y + 1.5, tileS - 3, tileS - 3)
    }
  }

  const colorTex = new THREE.CanvasTexture(colorCanvas)
  colorTex.colorSpace = THREE.SRGBColorSpace
  colorTex.wrapS = THREE.RepeatWrapping
  colorTex.wrapT = THREE.RepeatWrapping
  colorTex.repeat.set(3.2, 3.2)
  colorTex.anisotropy = 8

  const roughTex = new THREE.CanvasTexture(roughCanvas)
  roughTex.wrapS = THREE.RepeatWrapping
  roughTex.wrapT = THREE.RepeatWrapping
  roughTex.repeat.set(3.2, 3.2)
  roughTex.anisotropy = 4

  return { colorTex, roughTex }
}

/** Madeira horizontal em nogueira-carvalho quente para o painel iluminado da cabeceira. */
function makeWalnutPanelTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  const baseGrad = ctx.createLinearGradient(0, 0, 0, 512)
  baseGrad.addColorStop(0, '#c69868')
  baseGrad.addColorStop(0.18, '#b28151')
  baseGrad.addColorStop(0.55, '#a37245')
  baseGrad.addColorStop(0.85, '#b68656')
  baseGrad.addColorStop(1, '#c99b6a')
  ctx.fillStyle = baseGrad
  ctx.fillRect(0, 0, 1024, 512)

  // Veios horizontais elegantes de folha de madeira natural
  for (let i = 0; i < 140; i += 1) {
    const y = (i / 140) * 512
    ctx.strokeStyle =
      i % 5 === 0
        ? 'rgba(72, 42, 18, 0.16)'
        : i % 2 === 0
          ? 'rgba(255, 224, 178, 0.09)'
          : 'rgba(92, 56, 26, 0.08)'
    ctx.lineWidth = 1.2 + (i % 3) * 0.9
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(
      340,
      y + Math.sin(i * 0.4) * 5,
      680,
      y - Math.cos(i * 0.35) * 5,
      1024,
      y + Math.sin(i * 0.2) * 3,
    )
    ctx.stroke()
  }

  // Halo quente sutil nas bordas superior e inferior simulando a fita de LED 2700K
  const topGlow = ctx.createLinearGradient(0, 0, 0, 110)
  topGlow.addColorStop(0, 'rgba(255, 232, 176, 0.55)')
  topGlow.addColorStop(1, 'rgba(255, 232, 176, 0)')
  ctx.fillStyle = topGlow
  ctx.fillRect(0, 0, 1024, 110)

  const botGlow = ctx.createLinearGradient(0, 512, 0, 415)
  botGlow.addColorStop(0, 'rgba(255, 224, 162, 0.42)')
  botGlow.addColorStop(1, 'rgba(255, 224, 162, 0)')
  ctx.fillStyle = botGlow
  ctx.fillRect(0, 415, 1024, 97)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Parede arquitetonica fendi/taupe quente com AO realista nos cantos e frisos limpos. */
function makeArchWallTexture(isHeadWall = true) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Degradê vertical suave simulando iluminacao global (teto + piso)
  const vg = ctx.createLinearGradient(0, 0, 0, 512)
  vg.addColorStop(0, '#c6b8a8')
  vg.addColorStop(0.14, '#d6cabd')
  vg.addColorStop(0.72, '#cfc2b3')
  vg.addColorStop(1, '#b9aa99')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, 1024, 512)

  // Sombra suave no canto onde as duas paredes se encontram (AO arquitetonica!)
  const cornerGrad = isHeadWall
    ? ctx.createLinearGradient(0, 0, 260, 0)
    : ctx.createLinearGradient(0, 0, 220, 0)
  cornerGrad.addColorStop(0, 'rgba(72, 58, 45, 0.24)')
  cornerGrad.addColorStop(1, 'rgba(72, 58, 45, 0)')
  ctx.fillStyle = cornerGrad
  ctx.fillRect(0, 0, 260, 512)

  // Textura fina de pintura fosca / linho mineral
  for (let i = 0; i < 6000; i += 1) {
    const x = (i * 137 + (i % 17) * 9) % 1024
    const y = (i * 89 + (i % 13) * 7) % 512
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(75,60,45,0.035)'
    ctx.fillRect(x, y, 2, 2)
  }

  // Frisos arquitetonicos minimalistas entre grandes placas (igual cena-cama-eletrica.webp!)
  if (isHeadWall) {
    ctx.strokeStyle = 'rgba(92, 78, 64, 0.24)'
    ctx.lineWidth = 2
    for (const fx of [220, 512, 804]) {
      ctx.beginPath()
      ctx.moveTo(fx, 0)
      ctx.lineTo(fx, 512)
      ctx.stroke()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Tapete bouclé minimalista creme-aveia com textura macia e borda sutil. */
function makeBoucleRugTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#e7dfd3'
  ctx.fillRect(0, 0, 512, 512)

  for (let y = 0; y < 512; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(154, 138, 118, 0.14)' : 'rgba(255, 252, 246, 0.18)'
    ctx.fillRect(0, y, 512, 2)
  }
  for (let x = 0; x < 512; x += 4) {
    ctx.fillStyle = 'rgba(145, 130, 112, 0.08)'
    ctx.fillRect(x, 0, 2, 512)
  }

  // Borda costurada discreta
  ctx.strokeStyle = 'rgba(155, 140, 120, 0.35)'
  ctx.lineWidth = 10
  ctx.strokeRect(14, 14, 484, 484)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Vista panoramica desfocada (efeito bokeh fotografico) pela janela piso-teto. */
function makePanoramicWindowViewTexture() {
  const W = 1024
  const H = 1312
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  let seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Ceu azul limpo de manha, clareando no horizonte
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#7fb6e6')
  sky.addColorStop(0.3, '#a9d0f0')
  sky.addColorStop(0.55, '#dcecf6')
  sky.addColorStop(0.7, '#eef3ea')
  sky.addColorStop(1, '#e3ead9')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Sol suave fora do quadro (brilho quente no canto superior direito)
  const sun = ctx.createRadialGradient(W * 0.86, H * 0.08, 10, W * 0.86, H * 0.08, W * 0.7)
  sun.addColorStop(0, 'rgba(255, 249, 226, 0.95)')
  sun.addColorStop(0.25, 'rgba(255, 246, 220, 0.45)')
  sun.addColorStop(1, 'rgba(255, 246, 220, 0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, W, H)

  // Nuvens fofas
  ctx.save()
  ctx.filter = 'blur(14px)'
  for (const [cx, cy, s] of [
    [210, 250, 1.1],
    [640, 170, 0.9],
    [470, 420, 0.75],
    [860, 360, 0.7],
  ]) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath()
      ctx.ellipse(cx + (i - 2.5) * 46 * s, cy + Math.sin(i * 1.9) * 14 * s, 70 * s, 38 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Morros distantes azulados + linha de arvores desfocada (profundidade atmosferica)
  ctx.save()
  ctx.filter = 'blur(6px)'
  ctx.fillStyle = '#b7c9cf'
  ctx.beginPath()
  ctx.moveTo(0, 860)
  for (let x = 0; x <= W; x += 32) ctx.lineTo(x, 800 - Math.sin(x / 170) * 40 - Math.sin(x / 61) * 12)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.filter = 'blur(4px)'
  for (let i = 0; i < 26; i += 1) {
    const x = i * 42 + rnd() * 20
    const y = 880 + rnd() * 30
    const r = 46 + rnd() * 36
    ctx.fillStyle = ['#7f9d78', '#8aa67f', '#728f6b'][i % 3]
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Gramado ensolarado + cerca viva
  const lawn = ctx.createLinearGradient(0, 940, 0, H)
  lawn.addColorStop(0, '#9dbb7c')
  lawn.addColorStop(1, '#7da35f')
  ctx.fillStyle = lawn
  ctx.fillRect(0, 950, W, H - 950)
  ctx.save()
  ctx.filter = 'blur(2px)'
  for (let x = -20; x < W + 40; x += 34) {
    ctx.fillStyle = x % 68 === 0 ? '#5d8448' : '#668f50'
    ctx.beginPath()
    ctx.arc(x, 1030 + Math.sin(x / 40) * 6, 40, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#5a7f45'
  ctx.fillRect(0, 1030, W, 70)
  ctx.restore()

  // Galhos de arvore em primeiro plano entrando pelo alto (nitidos) com folhagem
  const drawBranch = (x0, y0, x1, y1, width, depth) => {
    ctx.strokeStyle = '#4a3a2c'
    ctx.lineCap = 'round'
    ctx.lineWidth = width
    const mx = (x0 + x1) / 2 + (rnd() - 0.5) * 60
    const my = (y0 + y1) / 2 + (rnd() - 0.5) * 40
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(mx, my, x1, y1)
    ctx.stroke()
    if (depth > 0) {
      for (let k = 0; k < 2; k += 1) {
        const t = 0.45 + rnd() * 0.45
        const bx = x0 + (x1 - x0) * t
        const by = y0 + (y1 - y0) * t
        const ang = Math.atan2(y1 - y0, x1 - x0) + (k ? 0.7 : -0.7) * (0.6 + rnd() * 0.6)
        const len = Math.hypot(x1 - x0, y1 - y0) * (0.45 + rnd() * 0.2)
        drawBranch(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, width * 0.58, depth - 1)
      }
    }
    // Folhas ao longo das pontas
    if (depth <= 1) {
      for (let i = 0; i < 16; i += 1) {
        const t = rnd()
        const lx = x0 + (x1 - x0) * t + (rnd() - 0.5) * 50
        const ly = y0 + (y1 - y0) * t + (rnd() - 0.5) * 44
        const rot = rnd() * Math.PI * 2
        const s = 12 + rnd() * 10
        ctx.fillStyle = ['#3f6b35', '#4f7d3f', '#5d8f47', '#6fa154', '#36602f'][(rnd() * 5) | 0]
        ctx.beginPath()
        ctx.ellipse(lx, ly, s, s * 0.48, rot, 0, Math.PI * 2)
        ctx.fill()
        // Realce de luz na folha
        ctx.fillStyle = 'rgba(214, 240, 170, 0.22)'
        ctx.beginPath()
        ctx.ellipse(lx - 2, ly - 2, s * 0.55, s * 0.2, rot, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  drawBranch(W + 30, -40, 560, 260, 34, 3)
  drawBranch(-30, 120, 300, 300, 22, 2)
  drawBranch(W + 20, 420, 760, 560, 16, 2)

  // Neblina luminosa suave por cima de tudo
  const haze = ctx.createLinearGradient(0, 0, 0, H)
  haze.addColorStop(0, 'rgba(255, 252, 245, 0.08)')
  haze.addColorStop(0.6, 'rgba(255, 252, 245, 0.12)')
  haze.addColorStop(1, 'rgba(255, 252, 245, 0.04)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, W, H)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * Passaro 3D estilizado (bem-te-vi / sabia-laranjeira / cambacica), ~20 cm.
 * Frente em +X local. Retorna partes moveis (cabeca, asas, cauda) para animar.
 */
function createBird(palette, flying = false) {
  const group = new THREE.Group()
  const m = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough })
  const backMat = m(palette.back)
  const bellyMat = m(palette.belly)
  const headMat = m(palette.head)
  const wingMat = m(palette.wing)
  const beakMat = m(palette.beak, 0.4)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })

  // Corpo: costas + barriga (duas meias-elipsoides levemente sobrepostas em cores diferentes)
  const bodyGeo = new THREE.SphereGeometry(0.05, 16, 12)
  bodyGeo.scale(1.45, 0.95, 0.9)
  const body = new THREE.Mesh(bodyGeo, backMat)
  group.add(body)
  const bellyGeo = new THREE.SphereGeometry(0.047, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)
  bellyGeo.scale(1.38, 0.95, 0.92)
  const belly = new THREE.Mesh(bellyGeo, bellyMat)
  belly.position.set(0.008, -0.004, 0)
  belly.rotation.z = 0.25
  group.add(belly)
  // Peito colorido saltado para a frente
  const chestGeo = new THREE.SphereGeometry(0.036, 14, 10)
  chestGeo.scale(1.0, 1.05, 1.1)
  const chest = new THREE.Mesh(chestGeo, bellyMat)
  chest.position.set(0.045, 0.0, 0)
  group.add(chest)

  // Cabeca (grupo movel)
  const head = new THREE.Group()
  head.position.set(0.075, 0.04, 0)
  group.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), headMat)
  head.add(skull)
  if (palette.stripe) {
    // Sobrancelha branca larga do bem-te-vi
    const stripeGeo = new THREE.TorusGeometry(0.03, 0.0065, 6, 18, Math.PI * 1.1)
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(stripeGeo, m(palette.stripe))
      stripe.rotation.set(0, 0, Math.PI * 0.95)
      stripe.position.set(-0.004, 0.006, side * 0.012)
      stripe.scale.set(1, 0.65, 1)
      stripe.rotation.y = side * 0.35
      head.add(stripe)
    }
  }
  if (palette.throat) {
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), m(palette.throat))
    throat.position.set(0.016, -0.016, 0)
    head.add(throat)
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), eyeMat)
    eye.position.set(0.018, 0.008, side * 0.026)
    head.add(eye)
  }
  const beakGeo = new THREE.ConeGeometry(0.009, palette.beakLen || 0.034, 8)
  beakGeo.rotateZ(-Math.PI / 2)
  const beak = new THREE.Mesh(beakGeo, beakMat)
  beak.position.set(0.042, -0.002, 0)
  head.add(beak)

  // Cauda
  const tail = new THREE.Group()
  tail.position.set(-0.065, 0.006, 0)
  group.add(tail)
  const tailGeo = new THREE.BoxGeometry(0.08, 0.006, 0.04)
  tailGeo.translate(-0.04, 0, 0)
  const tailMesh = new THREE.Mesh(tailGeo, wingMat)
  tailMesh.rotation.z = flying ? 0.05 : 0.45
  tail.add(tailMesh)

  // Asas: dobradas no corpo quando pousado, abertas e batendo quando voando
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0.03, 0)
  wingShape.bezierCurveTo(0.03, 0.05, -0.02, 0.11, -0.07, 0.12)
  wingShape.bezierCurveTo(-0.06, 0.07, -0.05, 0.03, -0.045, 0)
  wingShape.lineTo(0.03, 0)
  const wingGeo = new THREE.ShapeGeometry(wingShape, 8)
  const wings = []
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(0.0, 0.03, side * 0.03)
    const wing = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: palette.wing, roughness: 0.75, side: THREE.DoubleSide }))
    // Asa no plano XZ apontando para fora (side)
    wing.rotation.x = side * -Math.PI / 2
    pivot.add(wing)
    if (!flying) {
      pivot.rotation.x = side * -1.35 // dobrada rente ao corpo
      pivot.rotation.z = -0.25
    }
    group.add(pivot)
    wings.push({ pivot, side })
  }

  // Patinhas (so pousado)
  if (!flying) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 5), m(0x4a3a2c))
      leg.position.set(0.01, -0.058, side * 0.014)
      group.add(leg)
    }
  }

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false
  })
  return { group, head, tail, wings }
}

const BIRD_PALETTES = {
  bemtevi: { back: 0x7a6248, belly: 0xf3cf2a, head: 0x1d1b1a, stripe: 0xf7f4ec, throat: 0xf7f4ec, wing: 0x6f5a43, beak: 0x1a1a1a, beakLen: 0.036 },
  sabia: { back: 0x8b7a66, belly: 0xd9813a, head: 0x857462, wing: 0x7a6a58, beak: 0xc9a23a, throat: 0xcbbca6, beakLen: 0.03 },
  cambacica: { back: 0x3c3f44, belly: 0xf2cc2f, head: 0x2a2c30, stripe: 0xf5f3ee, wing: 0x34373b, beak: 0x222222, beakLen: 0.026 },
}

/**
 * Exterior real atras da janela (a parede agora tem um vao de verdade):
 * - painel de fundo distante (ceu, jardim, arvores) com paralaxe natural
 * - galho 3D proximo com folhas entrando pelo alto
 * - passaros pousados no galho (olham em volta, mexem a cauda) + passaros voando
 */
function createOutdoorScene({ winCenterX, winCenterY, winW, winH, wallZ }) {
  const group = new THREE.Group()
  group.name = 'Exterior'

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 4.4),
    new THREE.MeshBasicMaterial({ map: makePanoramicWindowViewTexture(), fog: false }),
  )
  backdrop.position.set(winCenterX + 0.3, winCenterY + 0.3, wallZ - 1.6)
  group.add(backdrop)

  // Galho 3D proximo (entra pelo canto superior direito da janela)
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 })
  const zB = wallZ - 0.32
  const right = winCenterX + winW / 2
  const top = winCenterY + winH / 2
  const mainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(winCenterX + 0.55, 1.76, zB - 0.12),
    new THREE.Vector3(winCenterX + 0.1, 1.46, zB),
    new THREE.Vector3(winCenterX - 0.35, 1.36, zB + 0.04),
    new THREE.Vector3(winCenterX - 0.8, 1.42, zB + 0.02),
  ])
  const subCurve = new THREE.CatmullRomCurve3([
    mainCurve.getPoint(0.45),
    new THREE.Vector3(winCenterX - 0.15, 1.7, zB - 0.06),
    new THREE.Vector3(winCenterX - 0.35, 1.84, zB - 0.1),
  ])
  const lowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(right + 0.4, top - 0.2, zB - 0.2),
    new THREE.Vector3(right - 0.2, top - 0.32, zB - 0.15),
    new THREE.Vector3(right - 0.6, top - 0.3, zB - 0.12),
  ])
  const branchParts = [
    new THREE.TubeGeometry(mainCurve, 24, 0.022, 8, false),
    new THREE.TubeGeometry(subCurve, 12, 0.012, 6, false),
    new THREE.TubeGeometry(lowCurve, 14, 0.016, 7, false),
  ]
  const branchMesh = new THREE.Mesh(mergeGeometries(branchParts.map((g) => g.toNonIndexed()), false), barkMat)
  group.add(branchMesh)

  // Tufos de folhas ao longo dos galhos (uma unica malha com vertex colors)
  const leafGeo = new THREE.SphereGeometry(0.032, 6, 4)
  leafGeo.scale(1.6, 0.25, 0.8)
  const leafParts = []
  const tones = [0x3f6b35, 0x4f7d3f, 0x5d8f47, 0x6fa154, 0x36602f]
  const mtx = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  let seed = 23
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const addLeaves = (curve, count, from = 0.15) => {
    for (let i = 0; i < count; i += 1) {
      const p = curve.getPoint(from + rnd() * (1 - from))
      p.x += (rnd() - 0.5) * 0.16
      p.y += (rnd() - 0.3) * 0.14
      p.z += (rnd() - 0.5) * 0.14
      e.set(rnd() * 1.2 - 0.6, rnd() * Math.PI * 2, rnd() * 1.2 - 0.6)
      q.setFromEuler(e)
      const s = 0.8 + rnd() * 0.6
      mtx.compose(p, q, new THREE.Vector3(s, s, s))
      const g = paintGeometry(leafGeo.clone(), tones[(rnd() * tones.length) | 0])
      g.applyMatrix4(mtx)
      leafParts.push(g)
    }
  }
  addLeaves(mainCurve, 60, 0.05)
  addLeaves(subCurve, 26)
  addLeaves(lowCurve, 30)
  const foliage = new THREE.Mesh(
    mergeGeometries(leafParts, false),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
  )
  group.add(foliage)

  // Passaros pousados (olham para dentro do quarto, levemente de lado)
  const perched = []
  const perch = (palette, curve, t, yaw, scale = 1.25) => {
    const b = createBird(BIRD_PALETTES[palette], false)
    const p = curve.getPoint(t)
    b.group.position.set(p.x, p.y + 0.075 * scale, p.z)
    b.group.rotation.y = yaw
    b.group.scale.setScalar(scale)
    group.add(b.group)
    perched.push({ ...b, seed: perched.length * 1.7 + 0.4 })
  }
  perch('bemtevi', mainCurve, 0.5, -2.0, 1.55)
  perch('sabia', mainCurve, 0.82, -1.1, 1.5)
  perch('cambacica', subCurve, 0.75, -2.5, 1.3)

  // Passaros voando atravessando o ceu (atras do galho, na frente do fundo)
  const flyers = []
  const flyerDefs = [
    ['bemtevi', 0.16, 2.0, wallZ - 0.9, 0],
    ['sabia', 0.12, 1.78, wallZ - 1.15, 0.45],
    ['cambacica', 0.2, 2.2, wallZ - 0.7, 0.7],
  ]
  for (const [palette, speed, y, z, phase] of flyerDefs) {
    const b = createBird(BIRD_PALETTES[palette], true)
    b.group.scale.setScalar(1.45)
    group.add(b.group)
    flyers.push({ ...b, speed, y, z, phase })
  }
  const minX = winCenterX - winW / 2 - 0.8
  const maxX = winCenterX + winW / 2 + 0.8
  const span = maxX - minX

  function update(time) {
    for (const b of perched) {
      // Cabeca: olha em volta em pequenos "tiques" (como passaro de verdade)
      const step = Math.floor(time * 1.3 + b.seed * 3)
      const look = Math.sin(step * 12.9898 + b.seed) * 0.8
      b.head.rotation.y += (look - b.head.rotation.y) * 0.25
      b.head.rotation.z = Math.sin(time * 2.1 + b.seed) * 0.12
      b.tail.rotation.z = Math.max(0, Math.sin(time * 3 + b.seed * 5)) ** 8 * 0.35
      b.group.position.y += Math.sin(time * 5 + b.seed) * 0.00012
    }
    for (const f of flyers) {
      const u = ((time * f.speed) / span + f.phase) % 1
      f.group.position.set(minX + u * span, f.y + Math.sin(time * 1.4 + f.phase * 8) * 0.06, f.z)
      // Direcao de voo +X (corpo ja aponta +X); leve inclinacao
      f.group.rotation.z = Math.sin(time * 1.4 + f.phase * 8) * 0.12
      const flap = Math.sin(time * (14 + f.phase * 4))
      for (const w of f.wings) w.pivot.rotation.x = w.side * flap * 0.9
    }
  }
  update(0)
  return { group, update }
}

/** Relogio de parede minimalista (aro de nogueira, mostrador creme, ponteiros reais). */
function createWallClock(walnutMat) {
  const group = new THREE.Group()
  group.name = 'RelogioParede'
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 10, 40), walnutMat)
  group.add(rim)
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.146, 40),
    new THREE.MeshStandardMaterial({ color: 0xfbf7f0, roughness: 0.6 }),
  )
  face.position.z = -0.004
  group.add(face)
  const markMat = new THREE.MeshStandardMaterial({ color: 0x3b342e, roughness: 0.5 })
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2
    const big = i % 3 === 0
    const mark = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.008 : 0.005, big ? 0.026 : 0.014, 0.003), markMat)
    mark.position.set(Math.sin(a) * 0.122, Math.cos(a) * 0.122, 0.0)
    mark.rotation.z = -a
    group.add(mark)
  }
  const hand = (len, w, color) => {
    const g = new THREE.BoxGeometry(w, len, 0.003)
    g.translate(0, len / 2 - 0.012, 0)
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }))
  }
  const hour = hand(0.075, 0.009, 0x2e2925)
  const minute = hand(0.108, 0.006, 0x2e2925)
  const second = hand(0.118, 0.0025, 0xc0533a)
  hour.position.z = 0.003
  minute.position.z = 0.006
  second.position.z = 0.009
  group.add(hour, minute, second)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), markMat)
  cap.rotation.x = Math.PI / 2
  cap.position.z = 0.011
  group.add(cap)

  function update() {
    const d = new Date()
    const sec = d.getSeconds() + d.getMilliseconds() / 1000
    const min = d.getMinutes() + sec / 60
    const hr = (d.getHours() % 12) + min / 60
    second.rotation.z = -(sec / 60) * Math.PI * 2
    minute.rotation.z = -(min / 60) * Math.PI * 2
    hour.rotation.z = -(hr / 12) * Math.PI * 2
  }
  update()
  return { group, update }
}

/** Quadro com moldura de nogueira e arte botanica abstrata em tons terrosos. */
function createFramedArt(walnutMat, w = 0.56, h = 0.72) {
  const group = new THREE.Group()
  group.name = 'QuadroDecorativo'
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 330
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f3ede3'
  ctx.fillRect(0, 0, 256, 330)
  ctx.fillStyle = '#d9b99a'
  ctx.beginPath()
  ctx.arc(150, 120, 70, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9fb59a'
  ctx.beginPath()
  ctx.ellipse(95, 205, 62, 92, -0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#5f6f58'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(110, 300)
  ctx.quadraticCurveTo(100, 210, 70, 130)
  ctx.stroke()
  for (let i = 0; i < 6; i += 1) {
    const y = 270 - i * 24
    ctx.beginPath()
    ctx.moveTo(100 - i * 4, y)
    ctx.quadraticCurveTo(70 - i * 3, y - 10, 58 - i * 2, y - 26)
    ctx.stroke()
  }
  ctx.fillStyle = '#c98f6a'
  ctx.fillRect(170, 230, 46, 46)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), walnutMat)
  frame.castShadow = true
  group.add(frame)
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.05, h - 0.05),
    new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.85 }),
  )
  mat.position.z = 0.0155
  group.add(mat)
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - 0.14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }))
  art.position.z = 0.017
  group.add(art)
  return group
}

/** Suporte de soro (haste inox, base de 5 rodizios, ganchos) — discreto, home care. */
function createIvStand() {
  const group = new THREE.Group()
  group.name = 'SuporteSoro'
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.25, metalness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.6 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.78, 12), steel)
  pole.position.y = 0.95
  pole.castShadow = true
  group.add(pole)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 14), steel)
  hub.position.y = 0.075
  group.add(hub)
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.016, 0.024), steel)
    leg.position.set(Math.cos(a) * 0.125, 0.06, Math.sin(a) * 0.125)
    leg.rotation.y = -a
    leg.castShadow = true
    group.add(leg)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 12), dark)
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(Math.cos(a) * 0.235, 0.024, Math.sin(a) * 0.235)
    wheel.rotation.y = -a
    group.add(wheel)
  }
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI * 1.2), steel)
    hook.position.set(Math.cos(a) * 0.04, 1.82, Math.sin(a) * 0.04)
    hook.rotation.y = -a
    group.add(hook)
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), steel)
  top.position.y = 1.85
  group.add(top)
  return group
}

/** Cria cortina de tecido 3D com pregas wave continuas e caimento organico ate o chao. */
function createWaveCurtainMesh(width, height, material, pleats = 6.5, amp = 0.042) {
  const geo = new THREE.PlaneGeometry(width, height, 30, 10)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const u = (x + width / 2) / width // 0..1
    const v = (y + height / 2) / height // 0 (chao) .. 1 (teto)
    // Pregas suaves que abrem levemente perto do piso
    const flare = 1 + (1 - v) * 0.18
    const z = Math.sin(u * Math.PI * 2 * pleats) * amp * flare + Math.cos(u * Math.PI * 3) * 0.012
    pos.setZ(i, z)
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  return mesh
}

/** Poltrona organica curva em tecido fendi (inspirada em cena-cama-eletrica.webp). */
function createSculptedArmchair(walnutMat, shadowTex) {
  const group = new THREE.Group()
  group.name = 'PoltronaAcompanhante'

  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0xa69b8e, // fendi-taupe sofisticado
    roughness: 0.9,
    metalness: 0.0,
  })
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xb4a99c,
    roughness: 0.92,
  })
  // Almofada da poltrona em verde-salvia (nada de almofada branca na cena)
  const pillowMat = new THREE.MeshStandardMaterial({
    color: 0x9aa98f,
    roughness: 0.9,
  })

  // Sombra de contato suave sob a poltrona (elevada 3mm do piso, zero Z-fighting)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  group.add(shadow)

  // 4 pernas conicas em madeira escura
  const legGeo = new THREE.CylinderGeometry(0.017, 0.011, 0.25, 14)
  for (const [lx, lz, rx, rz] of [
    [-0.24, -0.22, -0.1, 0.1],
    [0.24, -0.22, -0.1, -0.1],
    [-0.24, 0.22, 0.1, 0.1],
    [0.24, 0.22, 0.1, -0.1],
  ]) {
    const leg = new THREE.Mesh(legGeo, walnutMat)
    leg.position.set(lx, 0.125, lz)
    leg.rotation.set(rx, 0, rz)
    leg.castShadow = true
    group.add(leg)
  }

  // Base curva envolvente + assento arredondado
  const seatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.32, 0.11, 28), fabricMat)
  seatBase.scale.set(1.06, 1, 0.98)
  seatBase.position.set(0, 0.29, 0.02)
  seatBase.castShadow = true
  seatBase.receiveShadow = true
  group.add(seatBase)

  const seatCushion = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.11, 26), cushionMat)
  seatCushion.scale.set(1.02, 1, 0.96)
  seatCushion.position.set(0, 0.39, 0.04)
  seatCushion.castShadow = true
  seatCushion.receiveShadow = true
  group.add(seatCushion)

  // Concha curva organica formando encosto + bracos continuos (tub chair!)
  const shellGeo = new THREE.CylinderGeometry(0.37, 0.34, 0.44, 30, 6, true, Math.PI * 0.62, Math.PI * 1.76)
  const sp = shellGeo.attributes.position
  for (let i = 0; i < sp.count; i += 1) {
    const x = sp.getX(i)
    const y = sp.getY(i)
    const z = sp.getZ(i)
    // Abaixa suavemente as pontas frontais virando bracos ergonomicos
    if (y > 0) {
      const frontFactor = Math.max(0, (z + 0.06) / 0.42)
      sp.setY(i, y - frontFactor * 0.17)
    }
    sp.setX(i, x * 1.06)
  }
  shellGeo.computeVertexNormals()

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xa69b8e,
    roughness: 0.9,
    side: THREE.DoubleSide,
  })
  const shell = new THREE.Mesh(shellGeo, shellMat)
  shell.position.set(0, 0.54, 0.01)
  shell.castShadow = true
  shell.receiveShadow = true
  group.add(shell)

  // Borda superior acolchoada (tubo organico macio no contorno da poltrona)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.355, 0.044, 12, 28, Math.PI * 1.32),
    fabricMat,
  )
  rim.rotation.x = Math.PI / 2
  rim.rotation.z = Math.PI * 0.84
  rim.scale.set(1.06, 0.98, 1)
  rim.position.set(0, 0.72, -0.02)
  rim.castShadow = true
  group.add(rim)

  // Almofada clara aconchegante apoiada no encosto
  const pillowGeo = new THREE.SphereGeometry(1, 20, 16)
  const pp = pillowGeo.attributes.position
  for (let i = 0; i < pp.count; i += 1) {
    const sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.72)
    pp.setXYZ(i, sq(pp.getX(i)) * 0.19, sq(pp.getY(i)) * 0.15, pp.getZ(i) * 0.055)
  }
  pillowGeo.computeVertexNormals()
  const pillow = new THREE.Mesh(pillowGeo, pillowMat)
  pillow.position.set(0.02, 0.54, -0.15)
  pillow.rotation.set(-0.22, -0.12, 0.08)
  pillow.castShadow = true
  group.add(pillow)

  return group
}

/** Mesa de cabeceira contemporanea branca/nogueira com abajur aceso, jarra e livros. */
function createModernNightstand(walnutMat, creamMat, brassMat, shadowTex) {
  const group = new THREE.Group()
  group.name = 'MesaCabeceira'

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.64),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  group.add(shadow)

  // Base slim em metal bronze/dourado escovado
  const legGeo = new THREE.CylinderGeometry(0.01, 0.008, 0.16, 12)
  for (const lx of [-0.15, 0.15]) {
    for (const lz of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(legGeo, brassMat)
      leg.position.set(lx, 0.08, lz)
      leg.castShadow = true
      group.add(leg)
    }
  }

  // Corpo minimalista fosco creme-quente + tampo fino de nogueira
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.38), creamMat)
  body.position.y = 0.34
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.022, 0.41), walnutMat)
  top.position.y = 0.531
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  // Friso horizontal entre as 2 gavetas + puxadores sutis
  const groove = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.008, 0.36),
    new THREE.MeshStandardMaterial({ color: 0xb5a898, roughness: 0.7 }),
  )
  groove.position.set(0.191, 0.34, 0)
  group.add(groove)

  for (const gy of [0.25, 0.43]) {
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.09), brassMat)
    pull.position.set(0.196, gy, 0)
    group.add(pull)
  }

  // Abajur escultural em ceramica organica + cupula de linho com luz quente ambar
  const lampGroup = new THREE.Group()
  lampGroup.position.set(-0.03, 0.542, -0.05)

  const ceramicMat = new THREE.MeshStandardMaterial({
    color: 0xd8cec1,
    roughness: 0.48,
    metalness: 0.02,
  })
  const lampBase = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, 0),
        new THREE.Vector2(0.055, 0),
        new THREE.Vector2(0.072, 0.05),
        new THREE.Vector2(0.068, 0.11),
        new THREE.Vector2(0.036, 0.175),
        new THREE.Vector2(0.018, 0.21),
      ],
      24,
    ),
    ceramicMat,
  )
  lampBase.castShadow = true
  lampGroup.add(lampBase)

  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xfff5e4,
    emissive: 0xffc875,
    emissiveIntensity: 0.85,
    roughness: 0.82,
    side: THREE.DoubleSide,
  })
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.135, 0.17, 26, 1, true),
    shadeMat,
  )
  shade.position.y = 0.295
  lampGroup.add(shade)

  const lampGlow = new THREE.PointLight(0xffcb80, 1.35, 3.8, 1.7)
  lampGlow.position.set(0, 0.27, 0)
  lampGroup.add(lampGlow)

  group.add(lampGroup)

  // Livros + moringa de vidro elegante
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.022, 0.115),
    new THREE.MeshStandardMaterial({ color: 0x5c6f65, roughness: 0.72 }),
  )
  book.position.set(0.07, 0.553, 0.1)
  book.rotation.y = 0.16
  book.castShadow = true
  group.add(book)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xe6f2f5,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
  })
  const carafe = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.032, 0),
        new THREE.Vector2(0.038, 0.045),
        new THREE.Vector2(0.022, 0.105),
        new THREE.Vector2(0.026, 0.13),
      ],
      16,
    ),
    glassMat,
  )
  carafe.position.set(0.09, 0.542, -0.09)
  group.add(carafe)

  return group
}

/**
 * Folha de Ficus Lyrata em geometria real (ShapeGeometry), sem textura com alpha:
 * nada de alphaTest serrilhado nem bordas "piscando" com a camera em movimento.
 * Pivo na base do peciolo, folha crescendo em +Y, curvatura em Z.
 */
function createFiddleLeafGeometry() {
  const s = new THREE.Shape()
  // Silhueta de violino tipica do Ficus Lyrata (larga no topo, cintura no meio)
  s.moveTo(0, 0)
  s.bezierCurveTo(0.03, 0.02, 0.05, 0.06, 0.046, 0.1)
  s.bezierCurveTo(0.042, 0.13, 0.072, 0.17, 0.07, 0.21)
  s.bezierCurveTo(0.068, 0.25, 0.03, 0.27, 0, 0.262)
  s.bezierCurveTo(-0.03, 0.27, -0.068, 0.25, -0.07, 0.21)
  s.bezierCurveTo(-0.072, 0.17, -0.042, 0.13, -0.046, 0.1)
  s.bezierCurveTo(-0.05, 0.06, -0.03, 0.02, 0, 0)
  const geo = new THREE.ShapeGeometry(s, 10)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const v = Math.min(1, Math.max(0, pos.getY(i) / 0.262)) // clamp: evita NaN em Math.pow
    const u = x / 0.07
    // Caimento ao longo do comprimento + dobra em V suave na nervura central + ondulacao
    const droop = -Math.pow(v, 1.7) * 0.06
    const fold = Math.abs(u) * 0.018 * Math.sin(v * Math.PI)
    const wave = Math.sin(v * Math.PI * 4 + u * 2) * 0.0035 * Math.abs(u)
    pos.setZ(i, droop + fold + wave)
  }
  geo.computeVertexNormals()
  return geo
}

/** Pinta a geometria com uma cor solida (vertex colors) para mesclar tudo em 1 draw call. */
function paintGeometry(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const c = new THREE.Color(color)
  const arr = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r
    arr[i + 1] = c.g
    arr[i + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  // Mantem apenas atributos comuns para o merge
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key)
  }
  return g
}

/**
 * Planta Ficus Lyrata escultural:
 * - Vaso em ceramica fosca torneada (LatheGeometry) sobre suporte de nogueira
 * - Tronco e galhos organicos (TubeGeometry) + ~46 folhas reais com variacao de tom
 * - Todas as folhas mescladas em UMA malha opaca (1 draw call, sem transparencia,
 *   sem z-fighting e sem geometria com NaN -> fim do piscamento)
 */
function createDesignerPlant(walnutMat, shadowTex) {
  const group = new THREE.Group()
  group.name = 'PlantaDesigner'

  // Sombra de contato suave no piso
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.003
  shadow.renderOrder = -1
  group.add(shadow)

  // Vaso alto em ceramica fosca off-white com aro superior (cilindro unico torneado)
  const potMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.62, metalness: 0.0 })
  const potGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.118, 0.0),
      new THREE.Vector2(0.13, 0.012),
      new THREE.Vector2(0.15, 0.08),
      new THREE.Vector2(0.168, 0.22),
      new THREE.Vector2(0.176, 0.36),
      new THREE.Vector2(0.18, 0.43),
      new THREE.Vector2(0.172, 0.442),
      new THREE.Vector2(0.162, 0.436),
      new THREE.Vector2(0.158, 0.41),
    ],
    40,
  )
  const pot = new THREE.Mesh(potGeo, potMat)
  pot.castShadow = true
  pot.receiveShadow = true
  group.add(pot)

  // Base de nogueira discreta sob o vaso (prato), levemente acima do piso
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.142, 0.022, 36), walnutMat)
  saucer.position.y = 0.011
  saucer.receiveShadow = true
  group.add(saucer)
  pot.position.y = 0.022

  // Terra com leve volume (domo achatado), bem abaixo do aro: nada coplanar
  const soilGeo = new THREE.SphereGeometry(0.156, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  soilGeo.scale(1, 0.12, 1)
  const soil = new THREE.Mesh(soilGeo, new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 1 }))
  soil.position.y = 0.022 + 0.395
  group.add(soil)

  // Tronco + galhos
  const baseY = 0.022 + 0.4
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x6a5240, roughness: 0.9 })
  const branches = [
    { pts: [[0, 0, 0], [0.01, 0.35, 0], [-0.02, 0.7, 0.02], [0.0, 1.02, 0.01]], r: 0.014, leaves: 16 },
    { pts: [[0, 0.3, 0], [0.09, 0.48, -0.04], [0.17, 0.66, -0.06], [0.2, 0.8, -0.03]], r: 0.009, leaves: 9 },
    { pts: [[0, 0.24, 0], [-0.1, 0.4, 0.05], [-0.18, 0.56, 0.1], [-0.2, 0.68, 0.12]], r: 0.009, leaves: 8 },
    { pts: [[0, 0.46, 0], [0.04, 0.6, 0.11], [0.07, 0.76, 0.18], [0.06, 0.88, 0.2]], r: 0.008, leaves: 7 },
    { pts: [[0, 0.52, 0], [-0.06, 0.66, -0.1], [-0.1, 0.8, -0.16], [-0.09, 0.9, -0.17]], r: 0.008, leaves: 6 },
  ]

  const leafBase = createFiddleLeafGeometry()
  const leafParts = []
  const stemParts = []
  const tones = [0x2f5a35, 0x376a3d, 0x2a4f30, 0x3f7444, 0x325f38, 0x46804b]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const sc = new THREE.Vector3()
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  branches.forEach((b, bIdx) => {
    const curve = new THREE.CatmullRomCurve3(b.pts.map(([x, y, z]) => new THREE.Vector3(x, y + baseY, z)))
    stemParts.push(paintGeometry(new THREE.TubeGeometry(curve, 16, b.r, 7, false), 0x6a5240))
    for (let i = 0; i < b.leaves; i += 1) {
      const t = 0.3 + (i / Math.max(1, b.leaves - 1)) * 0.7
      const p = curve.getPoint(t)
      const tangent = curve.getTangent(t)
      // Filotaxia espiral (angulo aureo) com folhas inclinadas para fora e para cima
      const yaw = i * 2.39996 + bIdx * 1.1 + rnd() * 0.3
      const tilt = 0.55 + (1 - t) * 0.55 + rnd() * 0.2
      e.set(tilt, yaw, (rnd() - 0.5) * 0.35, 'YXZ')
      q.setFromEuler(e)
      const s = (0.78 + (1 - t) * 0.42 + rnd() * 0.12) * (bIdx === 0 ? 1.05 : 0.92)
      sc.set(s, s, s)
      // Pequeno afastamento ao longo do tangente evita folhas nascendo no mesmo ponto
      p.addScaledVector(tangent, 0.004 * i)
      m.compose(p, q, sc)
      const g = paintGeometry(leafBase.clone(), tones[(i + bIdx * 2) % tones.length])
      g.applyMatrix4(m)
      leafParts.push(g)
    }
  })

  const leaves = new THREE.Mesh(
    mergeGeometries(leafParts, false),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.8,
    }),
  )
  leaves.castShadow = true
  leaves.name = 'FolhasFicus'
  group.add(leaves)

  const stems = new THREE.Mesh(mergeGeometries(stemParts, false), stemMat)
  stems.material.vertexColors = true
  stems.castShadow = true
  group.add(stems)

  leafBase.dispose()
  return group
}

/** Textura sutil para o painel frontal do split (brilho vertical + linha de display). */
function makeSplitFrontTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.55, '#f6f7f8')
  g.addColorStop(1, '#e7e9ec')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 128)
  // Leve reflexo horizontal
  const sheen = ctx.createLinearGradient(0, 18, 0, 46)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.65)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 18, 512, 28)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Ar-condicionado split hi-wall moderno, montado na parede (frente para +X local).
 * Corpo com perfil arredondado (ExtrudeGeometry chanfrada), painel frontal, grelha
 * superior, saida de ar com aletas horizontais, defletor inclinado, display e LED.
 * Largura 0.9 m x altura 0.29 m x profundidade 0.21 m (proporcoes de um 12.000 BTU).
 */
function createSplitAirConditioner() {
  const group = new THREE.Group()
  group.name = 'ArCondicionadoSplit'

  const W = 0.9
  const H = 0.29
  const D = 0.21

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf7f8f9, roughness: 0.34, metalness: 0.02 })
  const frontMat = new THREE.MeshStandardMaterial({
    map: makeSplitFrontTexture(),
    roughness: 0.22,
    metalness: 0.02,
  })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.7 })
  const ventMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.45 })

  // Perfil lateral arredondado (x = profundidade a partir da parede, y = altura)
  const profile = new THREE.Shape()
  const r = 0.05
  profile.moveTo(0, 0.03)
  profile.lineTo(0, H)
  profile.lineTo(D - r - 0.02, H)
  profile.quadraticCurveTo(D - 0.004, H, D, H - r)
  profile.lineTo(D, 0.09)
  profile.quadraticCurveTo(D, 0.012, D - 0.07, 0.0)
  profile.lineTo(0.05, 0.0)
  profile.quadraticCurveTo(0.0, 0.0, 0, 0.03)
  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: W - 0.024,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 4,
    curveSegments: 10,
  })
  bodyGeo.translate(0, 0, -(W - 0.024) / 2)
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Painel frontal levemente saltado (2 mm a frente do corpo -> sem z-fighting)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.008, H - 0.11, W - 0.03), frontMat)
  panel.position.set(D + 0.009, H - 0.055 - (H - 0.11) / 2 + 0.005, 0)
  panel.castShadow = true
  group.add(panel)

  // Frisos sutis separando painel e corpo
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, W - 0.03), ventMat)
  seam.position.set(D + 0.012, 0.104, 0)
  group.add(seam)

  // Grelha de entrada de ar no topo (ripas finas)
  for (let i = 0; i < 7; i += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, W - 0.1), ventMat)
    slat.position.set(0.04 + i * 0.019, H + 0.0125, 0)
    group.add(slat)
  }

  // Saida de ar inferior: fenda escura recuada + aletas horizontais
  const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, W - 0.11), darkMat)
  outlet.position.set(D - 0.045, -0.009, 0)
  group.add(outlet)
  for (let i = 0; i < 9; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.003), ventMat)
    fin.position.set(D - 0.045, -0.006, -(W - 0.16) / 2 + i * ((W - 0.16) / 8))
    group.add(fin)
  }

  // Defletor (flap) curvo inclinado levemente para baixo, como em operacao
  const flapGeo = new THREE.CylinderGeometry(0.16, 0.16, W - 0.12, 24, 1, true, Math.PI * 0.42, Math.PI * 0.2)
  flapGeo.rotateX(Math.PI / 2)
  const flap = new THREE.Mesh(
    flapGeo,
    new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.3, side: THREE.DoubleSide }),
  )
  flap.position.set(D - 0.19, 0.115, 0)
  flap.rotation.z = -0.12
  flap.castShadow = true
  group.add(flap)

  // Display discreto + LED azul de funcionamento
  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.003, 0.026, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.2, metalness: 0.1 }),
  )
  display.position.set(D + 0.0145, 0.135, W / 2 - 0.12)
  group.add(display)
  const digitMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff })
  for (const dz of [-0.012, 0.012]) {
    const digit = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.014, 0.012), digitMat)
    digit.position.set(D + 0.0165, 0.135, W / 2 - 0.12 + dz)
    group.add(digit)
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x55c8ff }))
  led.position.set(D + 0.016, 0.135, W / 2 - 0.175)
  group.add(led)

  // Logo sutil em baixo-relevo cinza claro
  const logo = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.06), ventMat)
  logo.position.set(D + 0.0145, 0.2, 0)
  group.add(logo)

  // Sombra de contato macia na parede logo abaixo e atras do aparelho
  const wallShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.22, H + 0.26),
    new THREE.MeshBasicMaterial({
      map: makeSoftShadowTexture(0.6, 0.22),
      transparent: true,
      depthWrite: false,
    }),
  )
  wallShadow.rotation.y = Math.PI / 2
  wallShadow.position.set(0.002, H / 2 - 0.06, 0)
  group.add(wallShadow)

  // Canaleta branca discreta descendo pela lateral ate o rodape? Mantem limpo: so um trecho curto
  const duct = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.05), bodyMat)
  duct.position.set(0.016, H + 0.11 + 0.02, -W / 2 + 0.08)
  duct.castShadow = true
  group.add(duct)

  return group
}

/**
 * Constroi o quarto residencial de alto padrao + sombra de contato dinamica sob a cama.
 */
export function buildCozyBedroom() {
  const room = new THREE.Group()
  room.name = 'QuartoResidencialGrupoYR'

  const wallX = -1.38 // parede da cabeceira
  const wallZ = -1.64 // parede da janela panoramica
  const wallH = 2.95

  const shadowTex = makeSoftShadowTexture(0.32, 0.36)

  const walnutMat = new THREE.MeshStandardMaterial({
    color: 0x7a5638,
    roughness: 0.52,
    metalness: 0.06,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe8,
    roughness: 0.45,
  })
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x3b3530,
    roughness: 0.38,
    metalness: 0.65,
  })
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc5a265,
    roughness: 0.28,
    metalness: 0.82,
  })

  // =========================================================================
  // 1. PISO TRAVERTINO ACETINADO + TAPETE BOUCLÉ + SOMBRA DINAMICA SOB A CAMA
  // =========================================================================
  const { colorTex: floorColor, roughTex: floorRough } = makeTravertineFloorTextures()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.8, 7.4),
    new THREE.MeshStandardMaterial({
      map: floorColor,
      roughnessMap: floorRough,
      roughness: 0.46,
      metalness: 0.05,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0.35, 0, 0.25)
  floor.receiveShadow = true
  room.add(floor)

  // Tapete bouclé macio elevado 4mm acima do piso (ZERO Z-fighting com piso ou moveis!)
  const rugShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.66, 2.14),
    new THREE.MeshBasicMaterial({
      map: makeSoftShadowTexture(0.75, 0.22),
      transparent: true,
      depthWrite: false,
    }),
  )
  rugShadow.rotation.x = -Math.PI / 2
  rugShadow.position.set(0.06, 0.002, 0.04)
  room.add(rugShadow)

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.012, 1.98),
    new THREE.MeshStandardMaterial({
      map: makeBoucleRugTexture(),
      roughness: 0.94,
    }),
  )
  rug.position.set(0.06, 0.01, 0.04) // base em 0.004, topo em 0.016
  rug.receiveShadow = true
  room.add(rug)

  // Sombra de contato suave sob a cama (y = 0.019 — acima do tapete, abaixo das cotas!)
  const bedContactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.45, 1.38),
    new THREE.MeshBasicMaterial({
      map: makeSoftShadowTexture(0.55, 0.34),
      transparent: true,
      depthWrite: false,
    }),
  )
  bedContactShadow.rotation.x = -Math.PI / 2
  bedContactShadow.position.set(0, 0.019, 0)
  room.add(bedContactShadow)

  // =========================================================================
  // 2. PAREDE DA CABECEIRA (X = -1.38) — PAINEIS FENDI + PAINEL AMADEIRADO LED
  // =========================================================================
  const headWallGroup = new THREE.Group()
  headWallGroup.name = 'ParedeCabeceira'
  room.add(headWallGroup)

  const headWallW = 5.2
  const headWall = new THREE.Mesh(
    new THREE.PlaneGeometry(headWallW, wallH),
    new THREE.MeshStandardMaterial({
      map: makeArchWallTexture(true),
      roughness: 0.88,
      side: THREE.FrontSide,
    }),
  )
  headWall.rotation.y = Math.PI / 2
  headWall.position.set(wallX, wallH / 2, 0.8)
  headWall.receiveShadow = true
  headWallGroup.add(headWall)

  // Rodape arquitetonico moderno com linha de sombra
  const headBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, headWallW), trimMat)
  headBaseboard.position.set(wallX + 0.013, 0.055, 0.8)
  headBaseboard.receiveShadow = true
  headWallGroup.add(headBaseboard)

  // Painel horizontal amadeirado com fita de LED ambar quente embutida (assinatura da foto YR!)
  const panelW = 2.68
  const panelH = 0.84
  const panelY = 1.36 // levemente mais baixo para abrir espaco ao split acima
  const panelZ = 0.16

  // Moldura de LED quente recuada (logo atras do painel de madeira)
  const ledBacking = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, panelH + 0.036, panelW + 0.036),
    new THREE.MeshBasicMaterial({ color: 0xffe2a6 }),
  )
  ledBacking.position.set(wallX + 0.012, panelY, panelZ)
  headWallGroup.add(ledBacking)

  // Painel horizontal em nogueira-carvalho saltado a frente do LED (folga de 2mm -> zero Z-fighting)
  const woodPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, panelH, panelW),
    new THREE.MeshStandardMaterial({
      map: makeWalnutPanelTexture(),
      roughness: 0.48,
      metalness: 0.05,
    }),
  )
  woodPanel.position.set(wallX + 0.04, panelY, panelZ)
  woodPanel.castShadow = true
  woodPanel.receiveShadow = true
  headWallGroup.add(woodPanel)

  // Interruptor minimalista discreto na parede ao lado da cabeceira
  const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.072), trimMat)
  switchPlate.position.set(wallX + 0.064, 1.38, 1.02)
  headWallGroup.add(switchPlate)

  // =========================================================================
  // 3. PAREDE DA JANELA PANORAMICA PISO-TETO (Z = -1.64) + CORTINAS WAVE 3D
  // =========================================================================
  const windowWallGroup = new THREE.Group()
  windowWallGroup.name = 'ParedeJanela'
  room.add(windowWallGroup)

  const winWallW = 5.4
  // Parede com vao real para a janela (o exterior 3D fica atras, com paralaxe)
  const winWallShape = new THREE.Shape()
  winWallShape.moveTo(-winWallW / 2, -wallH / 2)
  winWallShape.lineTo(winWallW / 2, -wallH / 2)
  winWallShape.lineTo(winWallW / 2, wallH / 2)
  winWallShape.lineTo(-winWallW / 2, wallH / 2)
  winWallShape.lineTo(-winWallW / 2, -wallH / 2)
  {
    // Mesmas medidas da janela definidas abaixo (centro 0.56/1.41, 2.08 x 2.66)
    const hx0 = 0.56 - 1.04 - 1.25
    const hx1 = 0.56 + 1.04 - 1.25
    const hy0 = 1.41 - 1.33 - wallH / 2
    const hy1 = 1.41 + 1.33 - wallH / 2
    const hole = new THREE.Path()
    hole.moveTo(hx0, hy0)
    hole.lineTo(hx0, hy1)
    hole.lineTo(hx1, hy1)
    hole.lineTo(hx1, hy0)
    hole.lineTo(hx0, hy0)
    winWallShape.holes.push(hole)
  }
  const winWallGeo = new THREE.ShapeGeometry(winWallShape)
  {
    const pos = winWallGeo.attributes.position
    const uv = winWallGeo.attributes.uv
    for (let i = 0; i < pos.count; i += 1) {
      uv.setXY(i, pos.getX(i) / winWallW + 0.5, pos.getY(i) / wallH + 0.5)
    }
  }
  const winWall = new THREE.Mesh(
    winWallGeo,
    new THREE.MeshStandardMaterial({
      map: makeArchWallTexture(false),
      roughness: 0.88,
      side: THREE.FrontSide,
    }),
  )
  winWall.position.set(1.25, wallH / 2, wallZ)
  winWall.receiveShadow = true
  windowWallGroup.add(winWall)

  const winBaseboard = new THREE.Mesh(new THREE.BoxGeometry(winWallW, 0.11, 0.022), trimMat)
  winBaseboard.position.set(1.25, 0.055, wallZ + 0.013)
  winBaseboard.receiveShadow = true
  windowWallGroup.add(winBaseboard)

  // Cortineiro em gesso no teto
  const valance = new THREE.Mesh(new THREE.BoxGeometry(winWallW, 0.15, 0.24), trimMat)
  valance.position.set(1.25, wallH - 0.075, wallZ + 0.12)
  windowWallGroup.add(valance)

  // Janela panoramica piso-teto (ampla e luminosa como em cena-cama-eletrica.webp!)
  const winCenterX = 0.56
  const winW = 2.08
  const winH = 2.66
  const winCenterY = 1.41

  // Exterior 3D: jardim ao fundo, galho com folhas e passaros (pousados e voando)
  const outdoor = createOutdoorScene({ winCenterX, winCenterY, winW, winH, wallZ })
  windowWallGroup.add(outdoor.group)

  // Batentes (espessura da parede) para o vao nao parecer recortado no papel
  const jambDepth = 0.14
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.02, winH, jambDepth), trimMat)
    jamb.position.set(winCenterX + sx * (winW / 2 + 0.01), winCenterY, wallZ - jambDepth / 2)
    windowWallGroup.add(jamb)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, 0.02, jambDepth), trimMat)
  lintel.position.set(winCenterX, winCenterY + winH / 2 + 0.01, wallZ - jambDepth / 2)
  windowWallGroup.add(lintel)
  const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, 0.02, jambDepth), trimMat)
  sill.position.set(winCenterX, winCenterY - winH / 2 - 0.01, wallZ - jambDepth / 2)
  windowWallGroup.add(sill)

  // Vidro discreto com reflexo sutil
  const glassPane = new THREE.Mesh(
    new THREE.PlaneGeometry(winW - 0.05, winH - 0.05),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.12,
      transparent: true,
      opacity: 0.1,
    }),
  )
  glassPane.position.set(winCenterX, winCenterY, wallZ + 0.026)
  windowWallGroup.add(glassPane)

  // Esquadria slim contemporanea em aluminio fosco
  const frameD = 0.06
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.042, winH, frameD), darkMetalMat)
    post.position.set(winCenterX + sx * (winW / 2), winCenterY, wallZ + frameD / 2)
    windowWallGroup.add(post)
  }
  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, 0.042, frameD), darkMetalMat)
  bottomRail.position.set(winCenterX, 0.08, wallZ + frameD / 2)
  windowWallGroup.add(bottomRail)

  const midMullion = new THREE.Mesh(new THREE.BoxGeometry(0.026, winH, 0.036), darkMetalMat)
  midMullion.position.set(winCenterX, winCenterY, wallZ + 0.032)
  windowWallGroup.add(midMullion)

  // Cortinas 3D em tecido ondulado: voal branco translucido + linho champagne prega wave!
  const voileMat = new THREE.MeshStandardMaterial({
    color: 0xfdfbf7,
    roughness: 0.92,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
  })
  const linenDrapeMat = new THREE.MeshStandardMaterial({
    color: 0xccbda9, // linho fendi-champagne luxuoso
    roughness: 0.9,
    side: THREE.DoubleSide,
  })

  for (const side of [-1, 1]) {
    const voile = createWaveCurtainMesh(0.54, 2.74, voileMat, 5.5, 0.03)
    voile.position.set(winCenterX + side * (winW / 2 - 0.12), 1.4, wallZ + 0.09)
    windowWallGroup.add(voile)

    const drape = createWaveCurtainMesh(0.56, 2.74, linenDrapeMat, 4.5, 0.046)
    drape.position.set(winCenterX + side * (winW / 2 + 0.14), 1.4, wallZ + 0.15)
    windowWallGroup.add(drape)
  }

  // =========================================================================
  // 4. MOBILIARIO DE DESIGN (FORA DA BORDA DO TAPETE -> ZERO SOBREPOSICAO)
  // =========================================================================
  const nightstand = createModernNightstand(walnutMat, trimMat, brassMat, shadowTex)
  nightstand.position.set(-1.12, 0, 1.18)
  room.add(nightstand)

  const armchair = createSculptedArmchair(walnutMat, shadowTex)
  armchair.position.set(-0.82, 0, -1.2)
  armchair.rotation.y = 0.72
  room.add(armchair)

  // Planta afastada das cortinas (antes as folhas atravessavam o voal translucido)
  const plant = createDesignerPlant(walnutMat, shadowTex)
  plant.position.set(1.08, 0, -1.2)
  plant.rotation.y = 0.6
  room.add(plant)

  // Ar-condicionado split na parede da cabeceira, centralizado acima do painel de LED
  const airConditioner = createSplitAirConditioner()
  airConditioner.position.set(wallX + 0.002, 1.92, -0.62)
  headWallGroup.add(airConditioner)


  // Relogio de parede no trecho livre da parede da janela (acima da poltrona)
  const clock = createWallClock(walnutMat)
  clock.group.position.set(-1.12, 2.08, wallZ + 0.02)
  windowWallGroup.add(clock.group)

  // Quadro decorativo na parede da janela, lado direito
  const art = createFramedArt(walnutMat)
  art.position.set(2.5, 1.5, wallZ + 0.017)
  windowWallGroup.add(art)

  // Suporte de soro discreto junto a cabeceira (home care)
  const ivStand = createIvStand()
  ivStand.position.set(-0.98, 0, -0.86)
  room.add(ivStand)

  let lastClock = 0
  function updateAmbient(time) {
    outdoor.update(time)
    if (time - lastClock > 0.25) {
      lastClock = time
      clock.update()
    }
  }

  function updateVisibility(camera) {
    headWallGroup.visible = camera.position.x > wallX + 0.08
    windowWallGroup.visible = camera.position.z > wallZ + 0.08
  }

  function updateBedShadow(lift01) {
    const s = 1 - lift01 * 0.08
    bedContactShadow.scale.set(s, s, 1)
    bedContactShadow.material.opacity = 0.92 - lift01 * 0.24
  }

  return { room, updateVisibility, updateBedShadow, updateAmbient }
}
