import * as THREE from 'three'

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
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  // Ceu de manha luminoso e sereno
  const sky = ctx.createLinearGradient(0, 0, 0, 1024)
  sky.addColorStop(0, '#c6dff2')
  sky.addColorStop(0.36, '#e3eff8')
  sky.addColorStop(0.62, '#f4f6f0')
  sky.addColorStop(1, '#dce3d5')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 768, 1024)

  // Predios residenciais distantes bem desfocados no horizonte (estilo Curitiba / cena real)
  ctx.save()
  ctx.filter = 'blur(8px)'
  const buildings = [
    [90, 410, 96, 360, '#dce2e6'],
    [195, 470, 82, 300, '#e4e8eb'],
    [435, 365, 118, 410, '#d8dfe4'],
    [570, 435, 92, 340, '#e0e5e8'],
  ]
  for (const [bx, by, bw, bh, col] of buildings) {
    ctx.fillStyle = col
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = 'rgba(155, 170, 182, 0.35)'
    for (let wy = by + 18; wy < by + bh - 40; wy += 24) {
      for (let wx = bx + 12; wx < bx + bw - 16; wx += 22) {
        ctx.fillRect(wx, wy, 12, 12)
      }
    }
  }
  ctx.restore()

  // Camadas de copas de arvores com bokeh organico e luz solar filtrada
  ctx.save()
  ctx.filter = 'blur(12px)'
  const treeLayers = [
    [80, 680, 145, '#89a87e'],
    [240, 720, 165, '#78986e'],
    [430, 700, 150, '#8ca982'],
    [620, 665, 180, '#6e8f66'],
    [140, 840, 190, '#5a7b53'],
    [390, 865, 210, '#63845b'],
    [660, 845, 200, '#50704a'],
    [290, 975, 240, '#496844'],
    [580, 985, 220, '#54734d'],
  ]
  for (const [cx, cy, r, col] of treeLayers) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Pontos de luz solar filtrados pelas folhas (bokeh quente)
  ctx.fillStyle = 'rgba(255, 250, 224, 0.55)'
  for (const [bx, by, br] of [
    [160, 650, 38],
    [350, 670, 44],
    [540, 630, 52],
    [250, 790, 32],
    [490, 780, 36],
  ]) {
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Leve brilho atmosferico de manha vindo de cima
  const haze = ctx.createLinearGradient(0, 0, 0, 520)
  haze.addColorStop(0, 'rgba(255, 252, 245, 0.35)')
  haze.addColorStop(1, 'rgba(255, 252, 245, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, 768, 520)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Textura de folha botanica real (Ficus Lyrata) com nervura central, laterais e canal alfa. */
function makeBotanicalLeafTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 384
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 256, 384)

  // Silhueta organica da folha de Ficus / Oliveira
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(128, 372)
  ctx.bezierCurveTo(106, 330, 40, 265, 34, 178)
  ctx.bezierCurveTo(28, 92, 82, 28, 128, 12)
  ctx.bezierCurveTo(174, 28, 228, 92, 222, 178)
  ctx.bezierCurveTo(216, 265, 150, 330, 128, 372)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, 372, 0, 12)
  grad.addColorStop(0, '#2c4f33')
  grad.addColorStop(0.45, '#3b6742')
  grad.addColorStop(0.85, '#4e7d53')
  grad.addColorStop(1, '#5e8e62')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.clip()

  // Brilho suave de luz na metade da folha
  const sheen = ctx.createRadialGradient(96, 150, 10, 128, 180, 160)
  sheen.addColorStop(0, 'rgba(176, 214, 156, 0.25)')
  sheen.addColorStop(1, 'rgba(20, 40, 24, 0.14)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, 256, 384)

  // Nervura central + nervuras laterais delicadas
  ctx.strokeStyle = 'rgba(175, 208, 152, 0.65)'
  ctx.lineWidth = 4.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(128, 368)
  ctx.lineTo(128, 28)
  ctx.stroke()

  ctx.lineWidth = 2.2
  ctx.strokeStyle = 'rgba(165, 200, 144, 0.48)'
  for (let i = 0; i < 6; i += 1) {
    const y = 310 - i * 44
    const reach = 74 - Math.abs(i - 2.5) * 14
    for (const dir of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(128, y)
      ctx.quadraticCurveTo(128 + dir * reach * 0.55, y - 10, 128 + dir * reach, y - 34)
      ctx.stroke()
    }
  }
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Cria uma folha 3D realmente curvada (arco natural + leve concha em V), nao um papel plano! */
function createCurvedLeafGeometry() {
  const geo = new THREE.PlaneGeometry(0.15, 0.23, 6, 8)
  // Desloca o pivo para a base do peciolo (y = 0..0.23)
  geo.translate(0, 0.115, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const u = x / 0.075 // -1..1
    const v = y / 0.23 // 0..1
    // Caimento gracioso ao longo do comprimento + leve dobra em V nas laterais
    const droop = -Math.pow(v, 1.85) * 0.068
    const cup = Math.abs(u) * 0.016 * Math.sin(v * Math.PI)
    const wave = Math.sin(v * Math.PI * 3) * 0.004 * Math.abs(u)
    pos.setZ(i, droop + cup + wave)
  }
  geo.computeVertexNormals()
  return geo
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
  const pillowMat = new THREE.MeshStandardMaterial({
    color: 0xe9e1d5,
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
 * Planta Ficus Lyrata escultural de alto padrao:
 * - Vaso UNICO em ceramica fosca torneada (LatheGeometry — zero sobreposicao/piscamento!)
 * - Suporte de madeira nogueira com 4 pes elevados (zero Z-fighting com o piso!)
 * - Galhos curvos organicos (TubeGeometry) + 34 folhas 3D curvadas com textura nervurada real!
 */
function createDesignerPlant(walnutMat, shadowTex) {
  const group = new THREE.Group()
  group.name = 'PlantaDesigner'

  // Sombra de contato suave no piso
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  group.add(shadow)

  // Suporte moderno em nogueira (4 pernas elegantes + cruzeta inferior)
  const standLegGeo = new THREE.CylinderGeometry(0.012, 0.01, 0.32, 12)
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const leg = new THREE.Mesh(standLegGeo, walnutMat)
    leg.position.set(Math.cos(a) * 0.175, 0.16, Math.sin(a) * 0.175)
    leg.castShadow = true
    group.add(leg)
  }
  const barA = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.018), walnutMat)
  barA.position.y = 0.105
  barA.rotation.y = Math.PI / 4
  group.add(barA)
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.016), walnutMat)
  barB.position.y = 0.105
  barB.rotation.y = -Math.PI / 4
  group.add(barB)

  // Vaso ceramico UNICO sem emendas nem cilindros sobrepostos (y = 0.115 .. 0.42)
  const potMat = new THREE.MeshStandardMaterial({
    color: 0xeae3d8,
    roughness: 0.42,
    metalness: 0.03,
  })
  const potGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, 0.115),
      new THREE.Vector2(0.115, 0.115),
      new THREE.Vector2(0.148, 0.155),
      new THREE.Vector2(0.166, 0.24),
      new THREE.Vector2(0.162, 0.375),
      new THREE.Vector2(0.168, 0.405),
      new THREE.Vector2(0.154, 0.412),
      new THREE.Vector2(0.145, 0.385),
    ],
    28,
  )
  const pot = new THREE.Mesh(potGeo, potMat)
  pot.castShadow = true
  pot.receiveShadow = true
  group.add(pot)

  // Substrato/pedriscos bem abaixo da borda (sem tocar a parede interna!)
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.138, 22),
    new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.96 }),
  )
  soil.rotation.x = -Math.PI / 2
  soil.position.y = 0.375
  group.add(soil)

  // Galhos organicos curvados (TubeGeometry) + folhas 3D curvadas com textura botanica real
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.88 })
  const leafTex = makeBotanicalLeafTexture()
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.42,
    roughness: 0.36,
    metalness: 0.04,
    side: THREE.DoubleSide,
  })
  const leafGeo = createCurvedLeafGeometry()

  const branches = [
    [
      new THREE.Vector3(0, 0.37, 0),
      new THREE.Vector3(-0.02, 0.68, 0.01),
      new THREE.Vector3(-0.05, 0.98, 0.04),
      new THREE.Vector3(-0.03, 1.24, 0.02),
    ],
    [
      new THREE.Vector3(0.02, 0.37, -0.02),
      new THREE.Vector3(0.08, 0.62, -0.05),
      new THREE.Vector3(0.14, 0.88, -0.09),
      new THREE.Vector3(0.18, 1.06, -0.07),
    ],
    [
      new THREE.Vector3(-0.02, 0.37, 0.02),
      new THREE.Vector3(-0.09, 0.58, 0.07),
      new THREE.Vector3(-0.15, 0.8, 0.11),
    ],
    [
      new THREE.Vector3(0.01, 0.37, 0.03),
      new THREE.Vector3(0.06, 0.54, 0.08),
      new THREE.Vector3(0.11, 0.72, 0.12),
    ],
  ]

  branches.forEach((pts, bIdx) => {
    const curve = new THREE.CatmullRomCurve3(pts)
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, bIdx === 0 ? 0.011 : 0.0085, 8, false),
      stemMat,
    )
    tube.castShadow = true
    group.add(tube)

    const count = bIdx === 0 ? 12 : 8
    for (let i = 0; i < count; i += 1) {
      const t = 0.34 + (i / (count - 1)) * 0.66
      const p = curve.getPoint(t)
      const leaf = new THREE.Mesh(leafGeo, leafMat)
      leaf.position.copy(p)
      leaf.rotation.order = 'YXZ'
      leaf.rotation.y = i * 2.38 + bIdx * 1.4
      leaf.rotation.x = 0.42 + (1 - t) * 0.58
      leaf.rotation.z = Math.sin(i * 1.7) * 0.18
      const sc = 0.72 + (1 - t * 0.28) * 0.52
      leaf.scale.setScalar(sc)
      group.add(leaf)
    }
  })

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
  const panelY = 1.46
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
  const winWall = new THREE.Mesh(
    new THREE.PlaneGeometry(winWallW, wallH),
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

  const outdoorView = new THREE.Mesh(
    new THREE.PlaneGeometry(winW - 0.04, winH - 0.04),
    new THREE.MeshBasicMaterial({ map: makePanoramicWindowViewTexture() }),
  )
  outdoorView.position.set(winCenterX, winCenterY, wallZ + 0.01)
  windowWallGroup.add(outdoorView)

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

  const plant = createDesignerPlant(walnutMat, shadowTex)
  plant.position.set(1.56, 0, -1.22)
  room.add(plant)

  function updateVisibility(camera) {
    headWallGroup.visible = camera.position.x > wallX + 0.08
    windowWallGroup.visible = camera.position.z > wallZ + 0.08
  }

  function updateBedShadow(lift01) {
    const s = 1 - lift01 * 0.08
    bedContactShadow.scale.set(s, s, 1)
    bedContactShadow.material.opacity = 0.92 - lift01 * 0.24
  }

  return { room, updateVisibility, updateBedShadow }
}
