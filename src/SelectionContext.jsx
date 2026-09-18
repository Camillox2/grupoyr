import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { products } from './catalog.js'

const SelectionContext = createContext(null)
const storageKey = 'yr-showroom-selection-v1'
const initial = { slug: null, mode: 'Comprar', place: 'all', period: '' }
export const placeLabels = { all: 'Ambiente a definir', home: 'Em casa', clinic: 'Clínica ou instituição' }
// O catalogo passou a ser inteiro de cuidado em casa: nao ha mais recorte
// por ambiente. Mantido como funcao para nao quebrar quem ainda importa.
export const fitsPlace = () => true

export function SelectionProvider({ children }) {
  const [selection, setSelection] = useState(initial)
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      if (saved && typeof saved === 'object') {
        const product = products.find(item => item.slug === saved.slug)
        setSelection({
          slug: product?.slug || null,
          mode: saved.mode === 'Alugar' && product?.rent ? 'Alugar' : 'Comprar',
          place: Object.hasOwn(placeLabels, saved.place) ? saved.place : 'all',
          period: typeof saved.period === 'string' ? saved.period.slice(0, 80) : '',
        })
      }
    } catch { /* Browsing remains usable when storage is unavailable. */ }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (restored) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(selection)) } catch { /* Optional persistence. */ }
    }
  }, [selection, restored])
  const choose = useCallback((product, mode) => setSelection(current => ({
    ...current, slug: product.slug,
    mode: (mode || current.mode) === 'Alugar' && product.rent ? 'Alugar' : 'Comprar',
    place: fitsPlace(product, current.place) ? current.place : 'clinic',
  })), [])
  const setPlace = useCallback(place => setSelection(current => {
    const product = products.find(item => item.slug === current.slug)
    return { ...current, place, slug: product && !fitsPlace(product, place) ? null : current.slug }
  }), [])
  const update = useCallback(patch => setSelection(current => {
    const next = { ...current, ...patch }
    if (next.mode === 'Alugar' && !products.find(item => item.slug === next.slug)?.rent) next.mode = 'Comprar'
    return next
  }), [])
  const clear = useCallback(() => setSelection(current => ({ ...current, slug: null })), [])
  const value = useMemo(() => ({ selection, product: products.find(item => item.slug === selection.slug), choose, setPlace, update, clear }), [selection, choose, setPlace, update, clear])
  return <SelectionContext.Provider value={value}><div className={selection.slug ? 'showroom-root has-selection' : 'showroom-root'}>{children}</div></SelectionContext.Provider>
}

export const useSelection = () => useContext(SelectionContext)
