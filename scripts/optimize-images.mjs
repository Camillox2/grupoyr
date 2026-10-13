import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import sharp from 'sharp'

const productFiles = await readdir('public/products')
const sources = ['/yr-hospitalar-logo.jpg', '/dcfoundry-digital-logo.png', ...productFiles
  .filter(file => /\.(jpe?g|png|webp)$/i.test(file)).map(file => `/products/${file}`)]
const widths = [80, 160, 320, 480, 640, 960, 1280]
const output = resolve('public/images/optimized')
await mkdir(output, { recursive: true })
const manifest = {}
let bytes = 0
for (const source of sources) {
  const input = resolve('public', source.slice(1))
  const metadata = await sharp(input).metadata()
  const sourceWidth = metadata.orientation >= 5 ? metadata.height : metadata.width
  const maximum = Math.min(sourceWidth, widths.at(-1))
  const sizes = [...new Set([...widths.filter(width => width < maximum), maximum])]
  const name = basename(source).replace(/\.[^.]+$/, '')
  const variants = []
  for (const width of sizes) {
    const file = `${name}-${width}.webp`
    const info = await sharp(input).rotate().resize({ width, withoutEnlargement: true })
      .webp({ quality: source.startsWith('/products/') ? 80 : 88, effort: 5 }).toFile(resolve(output, file))
    variants.push({ src: `/images/optimized/${file}`, width: info.width })
    bytes += info.size
  }
  manifest[source] = variants
}
await writeFile('src/responsive-images.generated.json', JSON.stringify(manifest))
console.log(`Responsive images: ${sources.length} originals, ${Object.values(manifest).flat().length} variants, ${Math.round(bytes / 1024)} KiB`)
