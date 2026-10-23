import type { User } from '../types'

/** Todas as telas do CRM, na ordem do menu. Espelha server/src/screenAccess.js. */
export const SCREENS = [
  { id: 'dashboard', label: 'Visão geral' },
  { id: 'insights', label: 'Insights e Ads' },
  { id: 'kanban', label: 'Funil' },
  { id: 'whatsapp', label: 'WhatsApp e IA' },
  { id: 'equipments', label: 'Equipamentos' },
  { id: 'contracts', label: 'Contratos' },
  { id: 'clients', label: 'Clientes' },
  { id: 'inspections', label: 'Vistorias' },
  { id: 'client-operations', label: 'Operação e alertas' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'blog', label: 'Blog' },
  { id: 'yria', label: 'YRIA · laboratório' },
  { id: 'settings', label: 'Configurações' },
] as const

export type ScreenId = (typeof SCREENS)[number]['id']
export const SCREEN_IDS: string[] = SCREENS.map((screen) => screen.id)

/** Admin vê tudo; sem lista vinda do servidor, mantém o acesso total. */
export function canSeeScreen(user: User | null | undefined, screen: string) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!Array.isArray(user.screens)) return true
  return user.screens.includes(screen)
}

export function firstAllowedScreen(user: User | null | undefined): string | null {
  return SCREEN_IDS.find((id) => canSeeScreen(user, id)) || null
}
