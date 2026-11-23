/**
 * Estado compartilhado entre os atos (sem libs).
 * O Ato 2 registra cômodos/equipamentos explorados; o CTA do Ato 3 monta a
 * mensagem do WhatsApp a partir disso (com fallback se nada foi explorado).
 *
 * state = { rooms: Set<'quarto'|'banheiro'|'sala'>, items: Set<string> }
 */
import { useSyncExternalStore } from 'react'

export const ROOMS = ['quarto', 'banheiro', 'sala']

let state = { rooms: new Set(), items: new Set() }
const listeners = new Set()

function emit() {
  // Novo objeto a cada mudança: snapshot estável para useSyncExternalStore.
  state = { rooms: new Set(state.rooms), items: new Set(state.items) }
  listeners.forEach(fn => fn(state))
}

export function getExploration() { return state }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function markRoom(room) {
  if (!ROOMS.includes(room) || state.rooms.has(room)) return
  state.rooms.add(room)
  emit()
}

export function markItem(item) {
  if (!item || state.items.has(item)) return
  state.items.add(item)
  emit()
}

export function resetExploration() {
  state = { rooms: new Set(), items: new Set() }
  listeners.forEach(fn => fn(state))
}

/** Hook React: re-renderiza quando algo é explorado. */
export function useExploration() {
  return useSyncExternalStore(subscribe, getExploration, getExploration)
}
