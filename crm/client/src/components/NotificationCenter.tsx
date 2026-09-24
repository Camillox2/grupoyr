import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { CrmNotification } from '../types'

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}` })

interface NotificationCenterProps {
  onOpenLead: (leadId: string) => void
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onOpenLead }) => {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [items, setItems] = useState<CrmNotification[]>([])
  const [open, setOpen] = useState(false)
  const seenIds = useRef(new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  const unreadCount = items.filter((item) => !item.readAt).length

  const refresh = useCallback(async () => {
    const response = await fetch('/api/notifications', { headers: authHeaders() })
    if (!response.ok) return [] as CrmNotification[]
    const data = await response.json()
    const notifications = Array.isArray(data) ? data as CrmNotification[] : []
    setItems(notifications)
    return notifications
  }, [])

  useEffect(() => {
    if (user) void refresh()
  }, [user, refresh])

  useEffect(() => {
    if (!socket || !user) return
    const onNotification = async (event: { id: string; recipientId: string }) => {
      if (event.recipientId !== user.id) return
      const notifications = await refresh()
      const notification = notifications.find((item) => item.id === event.id)
      if (!notification || seenIds.current.has(notification.id)) return
      seenIds.current.add(notification.id)
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted'
        || localStorage.getItem('yr_crm_windows_notifications') !== 'enabled') return

      const options: NotificationOptions = {
        body: notification.message,
        icon: '/yr-hospitalar-logo.jpg',
        tag: notification.id,
        data: { leadId: notification.leadId },
      }
      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready
          await registration.showNotification(notification.title, options)
        } else {
          new Notification(notification.title, options)
        }
      } catch (error) {
        console.warn('Não foi possível exibir a notificação do sistema:', error)
      }
    }
    socket.on('notification:new', onNotification)
    return () => { socket.off('notification:new', onNotification) }
  }, [socket, user, refresh])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const markRead = async (item: CrmNotification) => {
    if (item.readAt) return
    const response = await fetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, {
      method: 'PUT', headers: authHeaders(),
    })
    if (response.ok) {
      const updated = await response.json()
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry))
    }
  }

  const openLead = async (item: CrmNotification) => {
    await markRead(item)
    setOpen(false)
    onOpenLead(item.leadId)
  }

  const markAllRead = async () => {
    const response = await fetch('/api/notifications/read-all', { method: 'PUT', headers: authHeaders() })
    if (response.ok) {
      const readAt = new Date().toISOString()
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })))
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative grid h-10 w-10 place-items-center rounded-[12px]"
        style={{ color: '#dce9f8', border: '1px solid rgba(220, 233, 248, 0.22)', background: 'rgba(255, 253, 249, 0.06)' }}
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); if (!open) void refresh() }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel absolute right-0 top-[calc(100%+10px)] z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white" aria-label="Central de notificações">
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div><h2 className="text-sm font-bold">Notificações</h2><p className="mt-0.5 text-[11px] text-slate-500">Avisos de atendimento e qualificação</p></div>
            {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300"><CheckCheck className="h-3.5 w-3.5" />Marcar lidas</button>}
          </header>
          <div className="notification-panel-list max-h-[min(65dvh,440px)] overflow-y-auto">
            {items.length === 0 ? <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum aviso por enquanto.</p> : items.map((item) => (
              <button key={item.id} type="button" onClick={() => void openLead(item)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-blue-50/70 dark:border-slate-800 dark:hover:bg-slate-800 ${item.readAt ? '' : 'bg-blue-50/50 dark:bg-blue-950/20'}`}>
                <span className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'}`} />
                  <span className="min-w-0 flex-1"><strong className="block text-xs font-bold">{item.title}</strong><span className="mt-1 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{item.message}</span><time className="mt-1.5 block text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString('pt-BR')}</time></span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
