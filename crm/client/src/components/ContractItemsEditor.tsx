import React, { useEffect, useState } from 'react'
import { PackagePlus, Trash2 } from 'lucide-react'
import { Contract } from '../types'
import { Modal } from './ui/Modal'
import { authHeaders } from '../lib/conversation'

interface CatalogItem { productCode: string; name: string; category: string; available: number; total: number; monthlyPrice: number; salePrice: number }

interface Props {
  contract: Contract | null
  onClose: () => void
  onChanged: (message: string) => void
}

const request = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), 'Content-Type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Não foi possível concluir a operação.')
  return body
}

export const ContractItemsEditor: React.FC<Props> = ({ contract, onClose, onChanged }) => {
  const [current, setCurrent] = useState<Contract | null>(contract)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [code, setCode] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrent(contract); setError(null); setQty(1); setCode(''); setPrice('')
    if (!contract) return
    request(`/api/contracts/${contract.id}/items/catalog`).then(setCatalog).catch((e) => setError(e.message))
  }, [contract])

  if (!contract || !current) return null
  const items = current.itemsSnapshot || []
  const selected = catalog.find((c) => (c.productCode || c.name) === code)

  const add = async () => {
    if (!code) return setError('Escolha um produto do catálogo.')
    setBusy(true); setError(null)
    try {
      const updated = await request(`/api/contracts/${contract.id}/items`, { method: 'POST', body: JSON.stringify({ productCode: code, qty, unitPrice: price.trim() === '' ? null : Number(price.replace(',', '.')) }) })
      setCurrent(updated)
      setCatalog(await request(`/api/contracts/${contract.id}/items/catalog`))
      setCode(''); setQty(1); setPrice('')
      onChanged(`Item adicionado ao contrato ${contract.number}.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (index: number) => {
    const item = items[index]
    if (!window.confirm(`Remover ${item.qty}x ${item.product} do contrato ${contract.number}? O equipamento volta para o estoque.`)) return
    setBusy(true); setError(null)
    try {
      const updated = await request(`/api/contracts/${contract.id}/items/${index}`, { method: 'DELETE' })
      setCurrent(updated)
      setCatalog(await request(`/api/contracts/${contract.id}/items/catalog`))
      onChanged(`Item removido do contrato ${contract.number}.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Editar itens · ${contract.number}`}
      subtitle={contract.clientName}
      icon={<PackagePlus className="h-5 w-5" />}
      size="lg"
      footer={<button onClick={onClose} className="rounded-[8px] px-4 py-2 text-sm font-bold" style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', border: '1px solid var(--border-subtle)' }}>Fechar</button>}
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Itens do contrato</p>
          {items.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>Nenhum item detalhado neste contrato.</p> : (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={index} className="flex items-start justify-between gap-3 rounded-[10px] p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <p className="font-bold" style={{ color: 'var(--ink)' }}>{item.qty}x {item.product}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {item.productCode || 'sem código'} · {item.unitPrice == null ? 'sem valor' : `${item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${item.modality === 'locacao' ? '/mês' : ''}`} · Patr. {item.patrimonies.join(', ')}
                      {item.addedAt ? ` · incluído em ${new Date(item.addedAt).toLocaleDateString('pt-BR')}` : ' · item original'}
                    </p>
                  </div>
                  {item.addedAt ? (
                    <button disabled={busy} onClick={() => remove(index)} className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11px] font-bold disabled:opacity-50" style={{ background: 'var(--danger-surface, #fef2f2)', color: 'var(--danger, #b91c1c)', border: '1px solid var(--danger-border, #fecaca)' }}>
                      <Trash2 className="h-3.5 w-3.5" />Remover
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[10px] p-3" style={{ border: '1px solid var(--yr-100)', background: 'var(--yr-050)' }}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--yr-700)' }}>Adicionar produto</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={code} onChange={(e) => { setCode(e.target.value); const c = catalog.find((x) => (x.productCode || x.name) === e.target.value); setPrice(c && (contract.type === 'venda' ? c.salePrice : c.monthlyPrice) ? String(contract.type === 'venda' ? c.salePrice : c.monthlyPrice) : '') }} className="input min-w-0 flex-1 rounded-[8px] border px-2 py-2" aria-label="Produto">
              <option value="">Escolha um produto do catálogo…</option>
              {catalog.map((c) => (
                <option key={c.productCode || c.name} value={c.productCode || c.name} disabled={c.available < 1}>
                  {c.name} {c.productCode ? `(${c.productCode})` : ''} — {c.available} disponível(is)
                </option>
              ))}
            </select>
            <input type="number" min={1} max={Math.max(1, selected?.available || 1)} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="input w-20 rounded-[8px] border px-2 py-2" aria-label="Quantidade" />
            <input inputMode="decimal" placeholder="R$ / mês" value={price} onChange={(e) => setPrice(e.target.value)} className="input w-28 rounded-[8px] border px-2 py-2" aria-label="Valor por unidade" title="Valor por unidade (mensal na locação). Vazio = sem valor adicional." />
            <button disabled={busy || !code} onClick={add} className="rounded-[8px] px-3 py-2 text-sm font-bold disabled:opacity-50" style={{ background: 'var(--yr-700)', color: 'var(--ink-on-brand)' }}>Adicionar</button>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            O valor vem do catálogo (pode ajustar). Com valor, a mensalidade e as cobranças ainda não pagas são atualizadas; faturas pagas não mudam. Vazio = sem valor adicional. Em contrato assinado, o equipamento passa para "alugado" e aparece como incluído após a assinatura.
          </p>
        </div>
        {error ? <p className="text-[12px] font-bold" style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p> : null}
      </div>
    </Modal>
  )
}
