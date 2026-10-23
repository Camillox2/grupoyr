import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Download, RefreshCw, WifiOff, Smartphone, X } from 'lucide-react'
import './inspection.css'
interface InstallEvent extends Event { prompt:()=>Promise<void>; userChoice:Promise<{outcome:string}> }
interface PwaState { installed:boolean; canInstall:boolean; install:()=>Promise<void> }
const PwaContext=createContext<PwaState>({installed:false,canInstall:false,install:async()=>{}})
export function PwaProvider({children}:{children:ReactNode}) {
  const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches)
  const [online,setOnline]=useState(navigator.onLine),[serverOk,setServerOk]=useState(true),[registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null),[instructions,setInstructions]=useState(false)
  useEffect(()=>{
    let active=true,pending=false
    const captured=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent)}
    const done=()=>{setInstalled(true);setPrompt(null)}
    const connection=()=>setOnline(navigator.onLine)
    const update=(event:Event)=>setRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail)
    const health=async()=>{if(!active||pending||document.hidden||!navigator.onLine)return;pending=true;try{const r=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(active)setServerOk(r.ok)}catch{if(active)setServerOk(false)}finally{pending=false}}
    const display=window.matchMedia('(display-mode: standalone)'),displayChanged=()=>setInstalled(display.matches)
    display.addEventListener('change',displayChanged)
    window.addEventListener('beforeinstallprompt',captured);window.addEventListener('appinstalled',done)
    window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('yr:pwa-update',update)
    void health();const timer=setInterval(()=>void health(),30000)
    if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistration('/').then(r=>{if(active&&r?.waiting)setRegistration(r)})
    return()=>{active=false;clearInterval(timer);display.removeEventListener('change',displayChanged);window.removeEventListener('beforeinstallprompt',captured);window.removeEventListener('appinstalled',done);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('yr:pwa-update',update)}
  },[])
  const install=async()=>{if(!prompt){setInstructions(true);return}await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')setInstalled(window.matchMedia('(display-mode: standalone)').matches);setPrompt(null)}
  return <PwaContext.Provider value={{installed,canInstall:!!prompt,install}}>{children}
    {!online||!serverOk||registration?<aside className="yr-pwa-status" aria-live="polite">{!online||!serverOk?<><WifiOff size={18}/><span>{!online?'Sem internet.':'Servidor temporariamente indisponível.'} Dados privados não são salvos offline. Não reenvie operações; confira o resultado ao voltar.</span><button onClick={()=>window.location.reload()}>Tentar novamente</button></>:<><RefreshCw size={18}/><span>Uma nova versão do CRM está pronta.</span><button onClick={()=>{if(!window.confirm('Salvar alterações em andamento antes de atualizar. Atualizar o CRM agora?'))return;let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloaded){reloaded=true;window.location.reload()}},{once:true});registration?.waiting?.postMessage({type:'SKIP_WAITING'})}}>Atualizar agora</button></>}</aside>:null}
    {instructions?<div className="yr-pwa-overlay" role="dialog" aria-modal="true" aria-labelledby="yr-pwa-title"><section className="yr-care yr-care-card"><div className="yr-care-row"><h2 id="yr-pwa-title">Instalar CRM Grupo YR</h2><button autoFocus aria-label="Fechar instruções de instalação" onClick={()=>setInstructions(false)}><X size={18}/></button></div><p>No Chrome do Android ou computador, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. No iPhone, use Compartilhar e “Adicionar à Tela de Início”.</p><small>A opção depende do navegador. Mesmo instalado, o atendimento precisa de conexão com o servidor.</small></section></div>:null}
  </PwaContext.Provider>
}
export function PwaInstallPanel({compact=false}:{compact?:boolean}) {
  const pwa=useContext(PwaContext)
  if(compact)return <div className="yr-care yr-pwa-compact"><button type="button" disabled={pwa.installed} onClick={()=>void pwa.install()}><Download size={16}/>{pwa.installed?'CRM instalado':'Instalar CRM neste dispositivo'}</button></div>
  return <section className="yr-care yr-care-card"><h2><Smartphone size={20} style={{display:'inline',marginRight:9}}/>CRM como aplicativo</h2><p>Atalho com a identidade do Grupo YR, tela independente e aviso de atualização. Contratos, mensagens e fotos continuam privados e precisam de conexão.</p><button type="button" className="yr-care-primary" disabled={pwa.installed} onClick={()=>void pwa.install()}><Download size={16}/>{pwa.installed?'Aplicativo instalado':pwa.canInstall?'Instalar aplicativo':'Como instalar o CRM'}</button></section>
}

