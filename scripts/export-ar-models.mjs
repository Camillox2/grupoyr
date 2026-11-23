import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { buildHospitalBed } from '../src/bed3d/buildHospitalBed.js'
import { DEFAULT_LIFT } from '../src/bed3d/specs.js'

// Polyfill minimalista de FileReader em Node para o GLTFExporter binario (.glb)
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf
          this.onloadend?.()
        })
        .catch((err) => {
          this.error = err
          this.onerror?.(err)
        })
    }
    readAsDataURL(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          const b64 = Buffer.from(buf).toString('base64')
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`
          this.onloadend?.()
        })
        .catch((err) => {
          this.error = err
          this.onerror?.(err)
        })
    }
  }
}

const outDir = resolve('public/models')
await mkdir(outDir, { recursive: true })

const gltfExporter = new GLTFExporter()
const usdzExporter = new USDZExporter()

// Pose AR: altura exata de 66 cm e leve inclinacao que evidencia a articulacao hospitalar
const AR_POSE = { back: 0.34, legs: 0.16, lift: DEFAULT_LIFT, railsDown: 0 }

async function exportModel(mode, basename) {
  const scene = new THREE.Scene()
  const { root } = buildHospitalBed({
    mode,
    pose: AR_POSE,
    showPneumatic: false,
    showPillow: false,
  })

  // Remove nos invisiveis ANTES de medir a caixa delimitadora para escala 1:1 exata
  const toRemove = []
  root.traverse((obj) => {
    if (!obj.visible && obj.parent) toRemove.push(obj)
  })
  for (const node of toRemove) node.parent?.remove(node)

  root.updateMatrixWorld(true)

  // Garante apoio exato no piso (Y = 0) e centralizacao em X/Z para AR 1:1
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  root.position.set(-center.x, -box.min.y, -center.z)
  root.updateMatrixWorld(true)

  scene.add(root)

  const glbBuffer = await new Promise((res, rej) => {
    gltfExporter.parse(
      scene,
      (result) => res(result),
      (err) => rej(err),
      { binary: true, onlyVisible: true },
    )
  })
  const glbPath = resolve(outDir, `${basename}.glb`)
  await writeFile(glbPath, Buffer.from(glbBuffer))

  const usdzArray = await usdzExporter.parseAsync(scene)
  const usdzPath = resolve(outDir, `${basename}.usdz`)
  await writeFile(usdzPath, Buffer.from(usdzArray))

  console.log(
    `[AR] ${basename}: ${size.x.toFixed(2)}m (C) x ${size.z.toFixed(2)}m (L) x ${size.y.toFixed(2)}m (A total) | GLB ${Math.round(glbBuffer.byteLength / 1024)} KiB | USDZ ${Math.round(usdzArray.byteLength / 1024)} KiB`,
  )
}

await exportModel('eletrica', 'cama-eletrica-yr')
await exportModel('manual', 'cama-manual-yr')
