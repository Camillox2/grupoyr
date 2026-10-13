import variants from './responsive-images.generated.json'

// The original stays as a fallback. Width descriptors let the browser choose
// the appropriate file for the displayed size and device pixel ratio.
export function imageSources(source, sizes = '(max-width: 700px) calc(100vw - 48px), (max-width: 1100px) 45vw, 620px') {
  const images = variants[source]
  return images ? { srcSet: images.map(image => `${image.src} ${image.width}w`).join(', '), sizes } : {}
}
