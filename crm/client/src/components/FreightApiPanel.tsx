import React,{useEffect,useState} from 'react'
import {Save,Truck,ShieldCheck} from 'lucide-react'
import {Equipment} from '../types'
import {useAuth} from '../contexts/AuthContext'
import {commercialApi as api} from './CommercialPanel'
type Provider={revision:number;enabled?:boolean;sandbox?:boolean;originPostalCode?:string;serviceId?:string;approvedService?:boolean;configured?:boolean;token?:string}
type Shipping=NonNullable<Equipment['shipping']>
type Quote={deliveryCents:number;pickupCents:number;basis:string;provider:string;sandbox:boolean;fallback?:string}
const emptyShipping:Shipping={widthCm:0,heightCm:0,lengthCm:0,weightKg:0,insuranceValue:0,carrierEligible:false}
export function FreightApiPanel({equipments,onRefresh}:{equipments:Equipment[];onRefresh:()=>void}){
 const {user}=useAuth()
 const [provider,setProvider]=useState<Provider|null>(null),[selected,setSelected]=useState(''),[shipping,setShipping]=useState(emptyShipping)
 const [cep,setCep]=useState(''),[city,setCity]=useState(''),[district,setDistrict]=useState(''),[modality,setModality]=useState('compra'),[qty,setQty]=useState('1')
 const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const eq=equipments.find(e=>e.id===selected)
 useEffect(()=>{let alive=true;if(user?.role==='admin')void api<Provider>('/api/commercial/freight/provider').then(v=>{if(alive)setProvider({...v,token:''})}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[user?.role])
 useEffect(()=>{setShipping(eq?.shipping||emptyShipping);setQuote(null)},[eq?.id,eq?.shipping])
 const action=async(name:string,fn:()=>Promise<void>)=>{setBusy(name);setError('');setNotice('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Operação não concluída.')}finally{setBusy('')}}
 return <details><summary><Truck size={17}/>API de frete e medidas embaladas</summary>
 <p className="commercial-hint">Integração Melhor Envio: cotação por CEP, peso e embalagem. Não calcula uma rota em km, não compra etiquetas e não inclui montagem. Equipamentos grandes podem não ser aceitos: a tabela manual continua disponível. Na locação, a retirada futura precisa estar na tabela.</p>
 {error?<p role="alert" className="commercial-error">{error}</p>:null}{notice?<p role="status" className="commercial-success">{notice}</p>:null}
 <form className="commercial-rate" onSubmit={e=>{e.preventDefault();if(!eq)return;void action('shipping',async()=>{await api('/api/equipments/'+encodeURIComponent(eq.id)+'/shipping','PUT',{shipping,previousShipping:eq.shipping||null});onRefresh();setNotice('Medidas salvas neste patrimônio. Confira também os demais itens do mesmo modelo.')})}}>
 <legend>Embalagem do equipamento</legend>
 <label>Equipamento para frete<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{equipments.map(e=><option key={e.id} value={e.id}>{e.name} · {e.serialNumber}</option>)}</select></label>
 {([['widthCm','Largura embalada (cm)'],['heightCm','Altura embalada (cm)'],['lengthCm','Comprimento embalado (cm)'],['weightKg','Peso embalado (kg)'],['insuranceValue','Valor segurado (R$)']] as const).map(([key,label])=><label key={key}>{label}<input required disabled={!eq} type="number" min="0.01" max={key==='insuranceValue'?1000000:key==='weightKg'?1000:500} step="0.01" value={shipping[key]||''} onChange={e=>setShipping(s=>({...s,[key]:Number(e.target.value)}))}/></label>)}
 <label className="commercial-check"><input type="checkbox" checked={shipping.carrierEligible} disabled={!eq} onChange={e=>setShipping(s=>({...s,carrierEligible:e.target.checked}))}/>Embalagem e produto aptos a transportadora</label>
 <button disabled={!eq||!!busy}><Save size={16}/>Salvar embalagem</button></form>
 {provider?<form className="commercial-rate" onSubmit={e=>{e.preventDefault();void action('provider',async()=>{const v=await api<Provider>('/api/commercial/freight/provider','PUT',provider);setProvider({...v,token:''});setNotice('Configuração salva. Teste uma cotação antes de usar no atendimento.')})}}>
 <legend><ShieldCheck size={15}/>Conexão · somente administrador</legend>
 <label>CEP de origem<input inputMode="numeric" maxLength={9} value={provider.originPostalCode||''} onChange={e=>setProvider(p=>p?{...p,originPostalCode:e.target.value}:p)}/></label>
 <label>ID do serviço autorizado<input inputMode="numeric" maxLength={8} value={provider.serviceId||''} onChange={e=>setProvider(p=>p?{...p,serviceId:e.target.value}:p)}/></label>
 <label>Token Melhor Envio<input type="password" autoComplete="new-password" value={provider.token||''} placeholder={provider.configured?'Configurado · deixe vazio para manter':'Cole o token da sua conta'} onChange={e=>setProvider(p=>p?{...p,token:e.target.value}:p)}/></label>
 <label>Ambiente<select value={provider.sandbox===false?'production':'sandbox'} onChange={e=>setProvider(p=>p?{...p,sandbox:e.target.value==='sandbox'}:p)}><option value="sandbox">Sandbox · apenas testes</option><option value="production">Produção · cotação real</option></select></label>
 <label className="commercial-check"><input type="checkbox" checked={provider.approvedService===true} onChange={e=>setProvider(p=>p?{...p,approvedService:e.target.checked}:p)}/>Conferi restrições, cobertura e adequação do serviço para estes produtos</label>
 <label className="commercial-check"><input type="checkbox" role="switch" aria-label="Ativar API de frete" checked={provider.enabled===true} onChange={e=>setProvider(p=>p?{...p,enabled:e.target.checked}:p)}/>Ativar cotações pela API</label>
 <button disabled={!!busy}><Save size={16}/>Salvar conexão de frete</button></form>:null}
 <form className="commercial-rate" onSubmit={e=>{e.preventDefault();setQuote(null);void action('quote',async()=>{const v=await api<{quote:Quote}>('/api/commercial/freight/quote','POST',{equipmentId:selected,quantity:Number(qty),cep,city,district,modality});setQuote(v.quote)})}}>
 <legend>Conferir cotação · sem contratar frete</legend>
 <label>CEP de destino<input inputMode="numeric" maxLength={9} value={cep} onChange={e=>setCep(e.target.value)}/></label>
 <label>Cidade de destino<input required maxLength={100} value={city} onChange={e=>setCity(e.target.value)}/></label>
 <label>Bairro de destino<input maxLength={100} value={district} onChange={e=>setDistrict(e.target.value)}/></label>
 <label>Modalidade da cotação<select value={modality} onChange={e=>setModality(e.target.value)}><option value="compra">Venda</option><option value="locacao">Locação</option></select></label>
 <label>Quantidade para frete<input required type="number" min="1" max="10" value={qty} onChange={e=>setQty(e.target.value)}/></label>
 <button disabled={!eq||!!busy}><Truck size={16}/>{busy==='quote'?'Consultando…':'Testar cotação'}</button>
 </form>
 {quote?<div role="status" className="commercial-empty"><strong>{quote.sandbox?'SIMULAÇÃO · não usar como frete real':quote.provider==='manual'?'Tabela manual':'Cotação Melhor Envio'}</strong><p>Entrega: {(quote.deliveryCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · Retirada: {(quote.pickupCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p><p>{quote.basis}{quote.fallback?' · '+quote.fallback:''}</p></div>:null}
 </details>
}

