import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const EMOJIS = [
  ['😀', 'sorriso'], ['😃', 'alegria'], ['😊', 'feliz'], ['🙂', 'sorrindo'], ['😉', 'piscando'], ['😍', 'apaixonado'],
  ['🥰', 'carinho'], ['😘', 'beijo'], ['😂', 'rindo'], ['🤣', 'gargalhada'], ['😅', 'alívio'], ['🥹', 'emocionado'],
  ['🤔', 'pensando'], ['😔', 'triste'], ['😢', 'chorando'], ['😭', 'choro'], ['😮', 'surpresa'], ['😴', 'sono'],
  ['😎', 'óculos'], ['🤗', 'abraço'], ['🤩', 'estrelas'], ['🥳', 'festa'], ['🙏', 'obrigado oração'], ['👍', 'sim positivo'],
  ['👎', 'não negativo'], ['👌', 'ok'], ['👏', 'palmas'], ['🙌', 'comemorar'], ['🤝', 'acordo aperto de mãos'], ['👋', 'olá tchau'],
  ['❤️', 'amor coração vermelho'], ['💙', 'coração azul'], ['💚', 'coração verde'], ['💛', 'coração amarelo'], ['💕', 'corações'], ['💐', 'flores'],
  ['✅', 'confirmado certo'], ['✔️', 'confirmação'], ['❌', 'cancelado'], ['⚠️', 'atenção'], ['❓', 'pergunta dúvida'], ['💬', 'mensagem'],
  ['📞', 'telefone ligação'], ['📱', 'celular'], ['📧', 'email'], ['📍', 'local endereço'], ['🏠', 'casa'], ['🏥', 'hospital'],
  ['🛏️', 'cama'], ['♿', 'cadeira acessibilidade'], ['🚚', 'entrega caminhão'], ['📦', 'caixa equipamento'], ['📄', 'documento'], ['📝', 'anotação'],
  ['📅', 'agenda data'], ['⏰', 'horário'], ['⏳', 'aguardando'], ['💰', 'valor dinheiro'], ['🎉', 'celebração'], ['✨', 'brilho'],
  ['🌞', 'bom dia'], ['🌙', 'boa noite'], ['☕', 'café'], ['💪', 'força'], ['🫶', 'cuidado'], ['🎂', 'aniversário'],
]
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function ChatEmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus() }, [])
  return (
    <div role="dialog" aria-label="Escolher emoji" onKeyDown={event => { if (event.key === 'Escape') onClose() }}
      className="absolute bottom-full left-3 right-3 z-30 mb-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:right-auto sm:w-80 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar emoji" aria-label="Buscar emoji"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <button type="button" onClick={onClose} aria-label="Fechar emojis" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
        {EMOJIS.filter(([emoji, name]) => searchable(`${emoji} ${name}`).includes(searchable(search))).map(([emoji, name]) => (
          <button key={emoji} type="button" onClick={() => onSelect(emoji)} title={name} aria-label={name}
            className="rounded-lg p-2 text-2xl leading-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800">{emoji}</button>
        ))}
      </div>
    </div>
  )
}
