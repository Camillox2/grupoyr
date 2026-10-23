import { db } from './db.js'
import { getYriaConfiguration } from './yriaCore.js'
import { runAutomaticYria } from './yriaCheckout.js'
import { generateYria } from './yriaProvider.js'
import { trackedGoogleFetch } from './googleUsage.js'

export { getYriaConfiguration } from './yriaCore.js'
export function evaluateYria({ previous, messages, message, config, sandbox = false, source = 'whatsapp' }) {
  const settings = db.getSettings()
  const key = settings.geminiApiKey || process.env.GEMINI_API_KEY || ''
  return runAutomaticYria({
    settings, allowSandbox: sandbox,
    previous, messages, message, catalog: db.get('equipments'), freightRates: settings.freightRates || [],
    config: config || getYriaConfiguration(settings).published.config,
    generate: input => generateYria({ ...input, key, fetcher: trackedGoogleFetch({ database: db, key, source: sandbox ? 'laboratory' : source }) }),
  })
}
