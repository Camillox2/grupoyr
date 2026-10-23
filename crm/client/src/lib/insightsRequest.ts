type RequestOptions = {
  fetcher?: typeof fetch
  timeoutMs?: number
  retryDelayMs?: number
}

class InsightsHttpError extends Error {
  status: number
  constructor(status: number) {
    super(status === 401 ? 'Sua sessão expirou. Entre novamente no CRM.' :
      status === 403 ? 'Acesso restrito a administradores.' :
      'Não foi possível carregar os insights. Tente novamente.')
    this.status = status
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Consulta cancelada', 'AbortError'))
    const abort = () => { clearTimeout(timer); reject(new DOMException('Consulta cancelada', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

// One bounded retry for transient failures. Never retry authentication failures or
// let an aborted/older request replace the current period's response.
export async function requestInsights<T>(
  token: string, days: number, signal: AbortSignal,
  { fetcher = fetch, timeoutMs = 12000, retryDelayMs = 500 }: RequestOptions = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal.addEventListener('abort', cancel, { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const response = await fetcher('/api/insights?days=' + days, {
        headers: { Authorization: 'Bearer ' + token },
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) throw new InsightsHttpError(response.status)
      const result = await response.json()
      if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
      return result as T
    } catch (error) {
      if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
      const retryable = !(error instanceof InsightsHttpError) || [502, 503, 504].includes(error.status)
      if (attempt === 1 || !retryable) {
        if (timedOut) throw new Error('A consulta demorou mais que o esperado. Tente novamente.')
        if (error instanceof InsightsHttpError) throw error
        throw new Error('Falha temporária de conexão. Tente novamente.')
      }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
    }
    await pause(retryDelayMs, signal)
  }
  throw new Error('Não foi possível carregar os insights.')
}
