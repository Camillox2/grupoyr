import { randomUUID } from 'node:crypto'

export const HISTORY_SYNC_LIMITS = { requesting: 30000, waiting_phone: 120000, processing: 90000 }
const RUNNING = new Set(Object.keys(HISTORY_SYNC_LIMITS))
export const serializeHistoryJob = ({ anchor, ...job }) => job

// A solicitação e seu estado são duráveis. O socket é recriado após uma queda.
export function createHistorySyncTracker({ emit = () => {}, now = Date.now, persist = async () => {}, onPersistenceError = () => {} } = {}) {
  const jobs = new Map()
  let lastUpdate = 0
  let writeQueue = Promise.resolve()
  const active = job => job && RUNNING.has(job.phase)
  const update = (leadId, values, save = true) => {
    const job = { ...jobs.get(leadId), ...values, leadId, updatedAt: new Date(lastUpdate = Math.max(now(), lastUpdate + 1)).toISOString() }
    job.deadlineAt = RUNNING.has(job.phase) ? new Date(now() + HISTORY_SYNC_LIMITS[job.phase]).toISOString() : null
    jobs.set(leadId, job)
    emit(job)
    if (save) {
      writeQueue = writeQueue.catch(() => {}).then(() => persist(job)).catch(error => {
        if (jobs.get(leadId)?.runId === job.runId) update(leadId, { phase: 'error', error: 'Não foi possível salvar a sincronização. Tente novamente quando a conexão voltar.', finishedAt: new Date(now()).toISOString() }, false)
        onPersistenceError(error)
        throw error
      })
      // O chamador pode aguardar flush(); nenhum erro de gravação fica sem tratamento.
      void writeQueue.catch(() => {})
    }
    return job
  }
  const matches = (leadId, runId) => !runId || jobs.get(leadId)?.runId === runId
  const expire = () => {
    for (const job of jobs.values()) if (active(job) && Date.parse(job.deadlineAt) <= now()) update(job.leadId, {
      phase: 'timed_out', finishedAt: new Date(now()).toISOString(),
      error: 'O WhatsApp não respondeu dentro do prazo. As mensagens já recebidas foram preservadas. Você pode tentar novamente.',
    })
  }
  const tracker = {
    get(leadId) { expire(); return jobs.get(leadId) || null },
    all() { expire(); return Object.fromEntries(jobs) },
    active() { expire(); return [...jobs.values()].filter(active) },
    resumable: () => [...jobs.values()].filter(job => job.phase === 'paused'),
    flush: () => writeQueue,
    expire,
    restore(records = []) {
      for (const { id, ...record } of records) {
        if (!record.leadId || !record.startedAt) continue
        const job = { attempts: 1, received: 0, processed: 0, imported: 0, error: null, runId: randomUUID(), ...record }
        jobs.set(job.leadId, job)
        lastUpdate = Math.max(lastUpdate, Date.parse(job.updatedAt) || 0)
        if (active(job)) {
          const deadline = Date.parse(job.deadlineAt || '') || Date.parse(job.updatedAt || job.startedAt) + HISTORY_SYNC_LIMITS[job.phase]
          if (deadline <= now()) update(job.leadId, { phase: 'timed_out', finishedAt: new Date(now()).toISOString(), error: 'A tentativa anterior ficou sem resposta. Você pode tentar novamente.' })
          else update(job.leadId, { phase: 'paused', pauseReason: 'server_restart', finishedAt: null })
        }
      }
    },
    pauseAll(reason = 'whatsapp_disconnected') {
      expire()
      for (const job of jobs.values()) if (active(job)) update(job.leadId, { phase: 'paused', pauseReason: reason })
    },
    start(leadId) {
      expire()
      const previous = jobs.get(leadId)
      if (active(previous) && (previous.phase !== 'waiting_phone' || now() - Date.parse(previous.updatedAt) < 60000)) return { job: previous, started: false }
      return { started: true, job: update(leadId, { phase: 'requesting', runId: randomUUID(), attempts: 1, anchor: null, startedAt: new Date(now()).toISOString(), finishedAt: null, received: 0, processed: 0, imported: 0, error: null, pauseReason: null, providerProgress: null }) }
    },
    resume(leadId) {
      const job = jobs.get(leadId)
      if (job?.phase !== 'paused') return { job, started: false }
      if (job.attempts >= 3) return { started: false, job: update(leadId, { phase: 'timed_out', finishedAt: new Date(now()).toISOString(), error: 'A conexão interrompeu três tentativas. Confira a internet e tente novamente.' }) }
      return { started: true, job: update(leadId, { phase: 'requesting', runId: randomUUID(), attempts: job.attempts + 1, received: 0, processed: 0, error: null, pauseReason: null }) }
    },
    requested(leadId, runId) {
      if (matches(leadId, runId) && jobs.get(leadId)?.phase === 'requesting') update(leadId, { phase: 'waiting_phone' })
    },
    setAnchor(leadId, anchor, runId) {
      if (matches(leadId, runId) && jobs.get(leadId)?.phase === 'requesting') update(leadId, { anchor })
    },
    beginBatch(leadId, count, providerProgress, runId) {
      expire()
      const job = jobs.get(leadId)
      if (!active(job) || !matches(leadId, runId)) return
      update(leadId, { phase: 'processing', received: job.received + count, providerProgress: Number.isFinite(providerProgress) ? providerProgress : null })
    },
    processed(leadId, imported = false, runId) {
      const job = jobs.get(leadId)
      if (job?.phase !== 'processing' || !matches(leadId, runId)) return
      update(leadId, { processed: job.processed + 1, imported: job.imported + Number(imported) })
    },
    finishBatch(leadId, runId) {
      const job = jobs.get(leadId)
      if (job?.phase !== 'processing' || job.processed < job.received || !matches(leadId, runId)) return
      const finished = job.providerProgress === null || job.providerProgress >= 100
      update(leadId, { phase: finished ? 'completed' : 'waiting_phone', ...(finished ? { finishedAt: new Date(now()).toISOString() } : {}) })
    },
    unavailable(leadId, runId) { if (matches(leadId, runId)) return update(leadId, { phase: 'no_history', finishedAt: new Date(now()).toISOString() }) },
    fail(leadId, runId) { if (matches(leadId, runId) && active(jobs.get(leadId))) return update(leadId, { phase: 'error', error: 'Não foi possível solicitar o histórico. Confira a conexão e tente novamente.', finishedAt: new Date(now()).toISOString() }) },
  }
  return tracker
}
