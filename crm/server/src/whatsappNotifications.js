import { randomUUID } from 'node:crypto'

export const notifyBaileysDisconnect = ({ database, io, reasonCode, idFactory = randomUUID } = {}) => {
  if (!database || !io) return []

  const needsRelinking = reasonCode === 401 || reasonCode === 500
  const message = needsRelinking
    ? 'A sessão do WhatsApp caiu e precisa ser vinculada novamente pelo QR Code.'
    : 'A conexão do WhatsApp caiu. O CRM tentará reconectar automaticamente; confira o status se continuar offline.'
  const recipients = database.get('users').filter((user) => user.role === 'admin')

  return recipients.map((recipient) => {
    const notification = database.insert('notifications', {
      id: `ntf_${idFactory()}`,
      recipientId: recipient.id,
      leadId: null,
      kind: 'whatsapp_disconnected',
      title: 'WhatsApp desconectado',
      message,
      createdAt: new Date().toISOString(),
      readAt: null,
    })
    io.emit('notification:new', { id: notification.id, recipientId: notification.recipientId })
    return notification
  })
}
