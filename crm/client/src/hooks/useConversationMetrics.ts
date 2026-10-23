import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../contexts/AuthContext'
import type { ConversationMetric } from '../lib/chatTimeline'

export function useConversationMetrics(socket: Socket | null) {
  const { token } = useAuth()
  const [snapshot, setSnapshot] = useState<{ token: string; leads: Record<string, ConversationMetric> } | null>(null)
  useEffect(() => {
    if (!token) return
    let timer: number | undefined, controller: AbortController | undefined, disposed = false
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        controller?.abort(); controller = new AbortController()
        const signal = controller.signal
        fetch('/api/conversations/metrics', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal })
          .then(response => { if (!response.ok) throw Error('SLA indisponível'); return response.json() })
          .then(data => { if (!disposed && !signal.aborted && data?.leads) setSnapshot({ token, leads: data.leads }) })
          .catch(() => { /* Preserve last snapshot through brief network interruptions. */ })
      }, 150)
    }
    refresh()
    const interval = window.setInterval(refresh, 30000)
    const events = ['connect', 'message:new', 'message:updated', 'lead:new', 'lead:updated']
    events.forEach(event => socket?.on(event, refresh))
    return () => { disposed = true; window.clearTimeout(timer); window.clearInterval(interval); controller?.abort(); events.forEach(event => socket?.off(event, refresh)) }
  }, [token, socket])
  return snapshot?.token === token ? snapshot.leads : {}
}
