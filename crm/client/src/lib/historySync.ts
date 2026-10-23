import type { WhatsAppHistorySync } from '../types'

export function replaceHistorySnapshot(current: Record<string, WhatsAppHistorySync>, snapshot: Record<string, WhatsAppHistorySync>, sameServer: boolean, snapshotAt?: string) {
  const result = Object.fromEntries(Object.entries(snapshot).map(([leadId, job]) => [leadId,
    sameServer && current[leadId] && Date.parse(current[leadId].updatedAt) > Date.parse(job.updatedAt) ? current[leadId] : job,
  ]))
  if (sameServer && snapshotAt) for (const [leadId, job] of Object.entries(current)) {
    if (!result[leadId] && Date.parse(job.updatedAt) > Date.parse(snapshotAt)) result[leadId] = job
  }
  return result
}

export function historySyncBusy(job: WhatsAppHistorySync | undefined, now: number) {
  return !!job && ['requesting', 'waiting_phone', 'processing'].includes(job.phase)
    && (!job.deadlineAt || Date.parse(job.deadlineAt) > now)
    && (job.phase !== 'waiting_phone' || now - Date.parse(job.updatedAt) < 60000)
}
