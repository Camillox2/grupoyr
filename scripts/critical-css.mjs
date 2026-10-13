import { readFile } from 'node:fs/promises'
import postcss from 'postcss'

// Keep the first screen's actual rules, in their original cascade order.
// The other routes continue to use the ordinary cached stylesheet.
export async function inlineHomeStyles(template, markup) {
  const firstScreen = [
    markup.match(/<header\b[\s\S]*?<\/header>/)?.[0],
    markup.match(/<section class="herobed"[\s\S]*?<\/section>/)?.[0],
    markup.match(/<button\b[^>]*aria-label="Abrir atendimento YRIA"[\s\S]*?<\/button>/)?.[0],
  ].filter(Boolean).join('')
  const classes = new Set(['site-shell', 'yr3', 'skip-link'])
  for (const match of firstScreen.matchAll(/class="([^"]+)"/g)) for (const name of match[1].split(/\s+/)) classes.add(name)
  const links = [...template.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
  let critical = ''
  let result = template
  for (const [tag] of links) {
    const href = tag.match(/href="([^"]+)"/)?.[1]
    if (!href?.startsWith('/assets/')) continue
    const full = postcss.parse(await readFile(`dist${href}`, 'utf8'))
    const root = postcss.root()
    const keyframes = []
    function copyRules(input, output) {
      for (const node of input.nodes || []) {
        if (node.type === 'rule') {
          const selectors = postcss.list.comma(node.selector).filter(selector =>
            [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].every(match => classes.has(match[1])))
          if (selectors.length) output.append(node.clone({ selector: selectors.join(',') }))
        } else if (node.type === 'atrule') {
          if (node.name.endsWith('keyframes')) keyframes.push(node)
          else if (['media', 'supports', 'layer', 'container'].includes(node.name)) {
            const copy = node.clone({ nodes: [] })
            copyRules(node, copy)
            if (copy.nodes.length) output.append(copy)
          } else output.append(node.clone())
        }
      }
    }
    copyRules(full, root)
    const rules = root.toString()
    for (const frame of keyframes) if (rules.includes(frame.params)) root.append(frame.clone())
    critical += root.toString()
    const asyncTag = tag.replace(/\s*media="[^"]*"/, '').replace(/\s*\/?>$/, ' media="print" data-yr-full-styles>')
    result = result.replace(tag,
      `<link rel="preload" as="style" href="${href}" crossorigin>\n${asyncTag}\n<noscript>${tag}</noscript>\n<script src="/apply-styles.js" defer></script>`)
  }
  if (!critical) throw new Error('No critical homepage styles were found')
  console.log(`Homepage critical CSS: ${Buffer.byteLength(critical)} bytes`)
  return result.replace('</head>', `<style data-yr-critical>${critical.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`)
}
