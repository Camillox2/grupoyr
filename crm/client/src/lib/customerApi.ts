export async function customerApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const form = body instanceof FormData
  const response = await fetch(url, { method, cache: 'no-store', headers: { Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(method === 'GET' ? 12000 : 180000) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir. Tente novamente.')
  return data as T
}
export const reais = (cents: number) => (Number(cents || 0) / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'})
export async function downloadCustomerFile(url: string, name: string) {
  const response = await fetch(url, { cache: 'no-store', headers: { Authorization: 'Bearer '+(localStorage.getItem('yr_crm_token') || '') }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error((await response.json().catch(()=>null))?.error || 'Arquivo indisponível. Tente novamente.')
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || name
  const objectUrl = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = objectUrl; link.download = filename.replace(/[\/\\]/g, '_'); document.body.append(link); link.click(); link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 30000)
}
export interface InspectionPhoto { id:string;caption:string;size:number;originalBytes:number;width:number;height:number;createdAt:string }
export interface Inspection { id:string;leadId:string;contractId:string|null;equipmentId:string;equipmentName:string;serialNumber:string;clientName:string;phase:'delivery'|'pickup';status:'draft'|'completed';revision:number;photos:InspectionPhoto[];baselineId?:string;autoAnalyze?:boolean;notes?:string;createdAt:string;hasCustomerLink?:boolean;analysis?:{status:string;message?:string;summary?:string;limitations?:string;notice?:string;model?:string;findings?:{beforePhotoId:string;afterPhotoId:string;observation:string;confidence:string}[];humanReview?:{decision:string;notes:string}|null} }
