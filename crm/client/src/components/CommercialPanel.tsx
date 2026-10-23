import React,{useEffect,useState} from 'react'
import {Save,Plus,Trash2,Truck,Tag} from 'lucide-react'
import {Equipment} from '../types'
import {useAuth} from '../contexts/AuthContext'
import './commercial.css'
import {FreightApiPanel} from './FreightApiPanel'
type Rate={id:string;city:string;district:string;productCode:string;deliveryPrice:number;pickupPrice:number}
type Freight={revision:number;rows:Rate[]}
const api=commercialApi
export async function commercialApi<T>(url:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+(localStorage.getItem('yr_crm_token')||''),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const v=await r.json().catch(()=>null);if(!r.ok)throw Error(v?.error||'Não foi possível salvar.');return v
}
export function CommercialPanel({equipments,onRefresh}:{equipments:Equipment[];onRefresh:()=>void}){
 const {user}=useAuth(),allowed=user?.role==='admin'||user?.role==='vendedor'
 const [table,setTable]=useState<Freight|null>(null),[rows,setRows]=useState<Rate[]>([])
 const [selected,setSelected]=useState(''),[monthly,setMonthly]=useState(''),[sale,setSale]=useState('')
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{let alive=true;if(allowed)api<Freight>('/api/commercial/freight').then(t=>{if(alive){setTable(t);setRows(t.rows)}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[allowed])
 const eq=equipments.find(e=>e.id===selected)
 useEffect(()=>{setMonthly(eq?String(eq.monthlyPrice):'');setSale(eq?String(eq.salePrice):'')},[eq?.id,eq?.monthlyPrice,eq?.salePrice])
 if(!allowed)return null
 const action=async(name:string,fn:()=>Promise<void>)=>{setBusy(name);setError('');setNotice('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Operação não concluída.')}finally{setBusy('')}}
 const dirty=table&&JSON.stringify(rows)!==JSON.stringify(table.rows)
 const update=(id:string,change:Partial<Rate>)=>setRows(all=>all.map(r=>r.id===id?{...r,...change}:r))
 return <section className="commercial-panel" aria-label="Preços e frete">
 <div className="commercial-heading"><Truck size={22}/><div><h2>Preços e tabela de frete</h2><p>A YRIA consulta estes cadastros. Sem valor ou região, encaminha para um consultor.</p></div></div>
 {error?<p role="alert" className="commercial-error">{error}</p>:null}{notice?<p role="status" className="commercial-success">{notice}</p>:null}
 <details><summary><Tag size={17}/>Atualizar preços de venda e locação</summary>
 <form className="commercial-prices" onSubmit={e=>{e.preventDefault();if(!eq)return;void action('price',async()=>{
 if(!monthly.trim()||!sale.trim())throw Error('Preencha os dois preços. Use 0 para deixar sob consulta.')
 await api('/api/equipments/'+encodeURIComponent(eq.id)+'/prices','PUT',{monthlyPrice:Number(monthly),salePrice:Number(sale),previousMonthlyPrice:eq.monthlyPrice,previousSalePrice:eq.salePrice})
 onRefresh();setNotice('Preços salvos neste patrimônio. Confira os demais patrimônios do mesmo modelo para manter o catálogo consistente.')
 })}}>
 <label>Produto / patrimônio<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione o equipamento</option>{equipments.map(e=><option key={e.id} value={e.id}>{e.name} · {e.productCode||'Sem código'} · {e.serialNumber}</option>)}</select></label>
 <label>Locação por mês (R$)<input required type="number" min="0" max="1000000" step="0.01" value={monthly} disabled={!eq} onChange={e=>setMonthly(e.target.value)}/></label>
 <label>Venda por unidade (R$)<input required type="number" min="0" max="1000000" step="0.01" value={sale} disabled={!eq} onChange={e=>setSale(e.target.value)}/></label>
 <button disabled={!!busy||!eq} type="submit"><Save size={16}/>Salvar preços</button></form>
 <p className="commercial-hint">Preço zero significa “sob consulta”, nunca produto gratuito. Modelos com preços divergentes são conferidos por um consultor.</p></details>
 <details open><summary><Truck size={17}/>Frete por região e produto</summary>
 <p className="commercial-hint">Valores por pedido, não por unidade. Bairro e código em branco valem para toda a cidade/modelos. A regra mais específica tem prioridade. Retirada entra apenas na locação; use 0 só se for gratuita. A equipe confirma dificuldades de acesso.</p>
 {!table?<p>Carregando tabela…</p>:!rows.length?<p className="commercial-empty">Nenhum frete cadastrado. A YRIA consultará a equipe.</p>:null}
 <div className="commercial-rates">{rows.map((r,i)=><fieldset key={r.id} className="commercial-rate"><legend>Região {i+1}</legend>
 <label>Cidade<input required maxLength={100} value={r.city} placeholder="Ex.: Curitiba" onChange={e=>update(r.id,{city:e.target.value})}/></label>
 <label>Bairro (opcional)<input maxLength={100} value={r.district} placeholder="Todos os bairros" onChange={e=>update(r.id,{district:e.target.value})}/></label>
 <label>Código do produto (opcional)<input maxLength={60} value={r.productCode} placeholder="Todos os produtos" onChange={e=>update(r.id,{productCode:e.target.value})}/></label>
 <label>Entrega (R$)<input required type="number" min="0" max="1000000" step="0.01" value={Number.isFinite(r.deliveryPrice)?r.deliveryPrice:''} onChange={e=>update(r.id,{deliveryPrice:e.target.value===''?NaN:Number(e.target.value)})}/></label>
 <label>Retirada (R$)<input required type="number" min="0" max="1000000" step="0.01" value={Number.isFinite(r.pickupPrice)?r.pickupPrice:''} onChange={e=>update(r.id,{pickupPrice:e.target.value===''?NaN:Number(e.target.value)})}/></label>
 <button type="button" aria-label={'Remover região '+(i+1)+' do rascunho'} disabled={!!busy} onClick={()=>setRows(all=>all.filter(a=>a.id!==r.id))}><Trash2 size={16}/>Remover</button></fieldset>)}</div>
 <div className="commercial-actions"><button disabled={!!busy||!table||rows.length>=200} onClick={()=>setRows(all=>[...all,{id:crypto.randomUUID(),city:'',district:'',productCode:'',deliveryPrice:NaN,pickupPrice:NaN}])}><Plus size={16}/>Adicionar região</button>
 <button disabled={!!busy||!dirty} onClick={()=>void action('freight',async()=>{
 if(rows.some(r=>!r.city.trim()||!Number.isFinite(r.deliveryPrice)||!Number.isFinite(r.pickupPrice)))throw Error('Preencha cidade, entrega e retirada em todas as regiões.')
 const t=await api<Freight>('/api/commercial/freight','PUT',{revision:table?.revision,rows});setTable(t);setRows(t.rows);setNotice('Tabela de frete salva. A YRIA consultará estes valores nas próximas respostas.')
 })}><Save size={16}/>{busy==='freight'?'Salvando…':'Salvar tabela de frete'}</button>
 {dirty?<span>Alterações no rascunho. Salve para aplicar.</span>:null}</div></details><FreightApiPanel equipments={equipments} onRefresh={onRefresh}/></section>
}
