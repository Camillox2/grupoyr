import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileText, Image as ImageIcon, RefreshCw, Search, Settings, Video } from 'lucide-react'
import type { MessageTemplate, TemplateSelection } from '../types'
import { authHeaders } from '../lib/conversation'
import { Skeleton } from './ui/Feedback'

interface TemplatePickerProps {
  onChange: (selection: TemplateSelection | null) => void
  /** Valores prontos para preencher variavel com um toque (nome do contato). */
  suggestions?: string[]
}

const CATEGORY: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
  AUTHENTICATION: 'Autenticação',
}

const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

// boas_vindas_locacao -> "Boas vindas locacao": a equipe le nome, nao slug.
const humanize = (name: string) => {
  const text = name.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Texto do template com as variaveis pintadas: azul preenchida, ambar faltando. */
const FilledText: React.FC<{ text: string; names: string[]; values: string[] }> = ({ text, names, values }) => {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(VARIABLE)) {
    const start = match.index ?? 0
    if (start > cursor) parts.push(text.slice(cursor, start))
    const value = values[names.indexOf(match[1])]?.trim()
    parts.push(
      <span key={start} className={value ? 'tpl-var is-filled' : 'tpl-var'}>
        {value || `{{${match[1]}}}`}
      </span>,
    )
    cursor = start + match[0].length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

const MEDIA_ICON: Record<string, typeof ImageIcon> = { IMAGE: ImageIcon, VIDEO: Video, DOCUMENT: FileText }
const MEDIA_LABEL: Record<string, string> = { IMAGE: 'imagem', VIDEO: 'vídeo', DOCUMENT: 'documento' }

export const TemplatePicker: React.FC<TemplatePickerProps> = ({ onChange, suggestions = [] }) => {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [bodyValues, setBodyValues] = useState<string[]>([])
  const [headerValues, setHeaderValues] = useState<string[]>([])
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/whatsapp/templates${refresh ? '?refresh=1' : ''}`, { headers: authHeaders(false) })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setTemplates(null)
        setError({ message: data?.error || 'Não foi possível carregar os templates.', code: data?.code })
        return
      }
      setTemplates(Array.isArray(data?.templates) ? data.templates : [])
    } catch {
      setTemplates(null)
      setError({ message: 'Sem conexão com o servidor. Tente de novo.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const selected = useMemo(() => templates?.find((item) => item.id === selectedId) ?? null, [templates, selectedId])

  const select = (template: MessageTemplate) => {
    if (!template.supported) return
    setSelectedId(template.id)
    setBodyValues(template.body.variables.map(() => ''))
    setHeaderValues(template.header.variables.map(() => ''))
    setHeaderMediaUrl('')
  }

  // Quem usa o seletor so precisa saber: qual template, com que valores, e se
  // ja da para enviar.
  useEffect(() => {
    if (!selected) {
      onChange(null)
      return
    }
    const filled = (values: string[]) => values.every((value) => value.trim().length > 0)
    const mediaOk = !selected.header.needsMedia || /^https:\/\/\S+$/i.test(headerMediaUrl.trim())
    onChange({
      templateId: selected.id,
      bodyValues,
      headerValues,
      headerMediaUrl: headerMediaUrl.trim(),
      ready: filled(bodyValues) && filled(headerValues) && mediaOk,
    })
  }, [selected, bodyValues, headerValues, headerMediaUrl, onChange])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!templates) return []
    return term
      ? templates.filter((item) => `${item.name} ${item.body.text}`.toLowerCase().includes(term))
      : templates
  }, [templates, search])

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Carregando templates">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (error) {
    const needsSetup = error.code === 'meta_not_configured' || error.code === 'meta_token_invalid'
    return (
      <div className="tpl-empty" role="alert">
        <Settings className="h-5 w-5" style={{ color: 'var(--wait)' }} />
        <p className="tpl-empty-title">{needsSetup ? 'Falta configurar a Meta' : 'Não deu para carregar os templates'}</p>
        <p className="tpl-empty-text">{error.message}</p>
        {needsSetup && <p className="tpl-empty-text">Abra Ajustes, na seção do WhatsApp, e preencha os dados da API oficial.</p>}
        <button type="button" onClick={() => load(true)} className="action-btn action-btn--ghost mt-1 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-extrabold">
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar de novo
        </button>
      </div>
    )
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="tpl-empty">
        <FileText className="h-5 w-5" style={{ color: 'var(--ink-faint)' }} />
        <p className="tpl-empty-title">Nenhum template aprovado</p>
        <p className="tpl-empty-text">Crie o template no Gerenciador do WhatsApp da Meta. Ele aparece aqui assim que for aprovado.</p>
        <button type="button" onClick={() => load(true)} className="action-btn action-btn--ghost mt-1 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-extrabold">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar lista
        </button>
      </div>
    )
  }

  const MediaIcon = selected ? MEDIA_ICON[selected.header.format] : undefined

  return (
    <div className="tpl-grid">
      {/* Lista */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          {templates.length > 5 ? (
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar template"
                aria-label="Buscar template"
                className="field-control w-full rounded-[10px] py-2 pl-8 pr-3 text-[16px] sm:text-[12px]"
                style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--ink)' }}
              />
            </div>
          ) : (
            <p className="flex-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
              {templates.length} {templates.length === 1 ? 'template aprovado' : 'templates aprovados'}
            </p>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--ink-muted)' }}
            title="Buscar de novo na Meta"
            aria-label="Atualizar lista de templates"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <ul className="tpl-list" role="listbox" aria-label="Templates aprovados">
          {visible.length === 0 && (
            <li className="px-3 py-4 text-center text-[11px]" style={{ color: 'var(--ink-faint)' }}>Nada com esse nome.</li>
          )}
          {visible.map((template) => {
            const active = template.id === selectedId
            return (
              <li key={template.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => select(template)}
                  disabled={!template.supported}
                  className={`tpl-item ${active ? 'is-active' : ''}`}
                  title={template.supported ? undefined : template.unsupportedReason}
                >
                  <span className="tpl-item-tick" aria-hidden="true">{active && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-extrabold" style={{ color: 'var(--ink)' }}>{humanize(template.name)}</span>
                    <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {template.supported ? template.body.text : template.unsupportedReason}
                    </span>
                  </span>
                  <span className="tpl-chip">{CATEGORY[template.category] || template.category}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Variaveis + previa */}
      <div className="min-w-0">
        {!selected ? (
          <div className="tpl-preview-empty">
            <p>Escolha um template ao lado para ver como a mensagem chega no WhatsApp do cliente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="tpl-phone" aria-label="Prévia da mensagem">
              <div className="tpl-bubble">
                {selected.header.needsMedia && MediaIcon && (
                  <div className="tpl-media">
                    <MediaIcon className="h-5 w-5" />
                    <span>Cabeçalho com {MEDIA_LABEL[selected.header.format]}</span>
                  </div>
                )}
                {selected.header.text && (
                  <p className="tpl-bubble-head">
                    <FilledText text={selected.header.text} names={selected.header.variables} values={headerValues} />
                  </p>
                )}
                <p className="whitespace-pre-wrap">
                  <FilledText text={selected.body.text} names={selected.body.variables} values={bodyValues} />
                </p>
                {selected.footer && <p className="tpl-bubble-foot">{selected.footer}</p>}
              </div>
              {selected.buttons.length > 0 && (
                <div className="tpl-buttons">
                  {selected.buttons.map((button, index) => (
                    <span key={`${button.text}-${index}`}>{button.text}</span>
                  ))}
                </div>
              )}
            </div>

            {selected.header.needsMedia && (
              <label className="block">
                <span className="tpl-label">Link do arquivo do cabeçalho ({MEDIA_LABEL[selected.header.format]})</span>
                <input
                  type="url"
                  inputMode="url"
                  value={headerMediaUrl}
                  onChange={(event) => setHeaderMediaUrl(event.target.value)}
                  placeholder="https://..."
                  className="field-control mt-1 w-full rounded-[10px] px-3 py-2.5 text-[16px] sm:text-[12px]"
                  style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--ink)' }}
                />
                <span className="mt-1 block text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>Precisa ser um link https público: é a Meta que baixa o arquivo.</span>
              </label>
            )}

            {([
              ['cabeçalho', selected.header.variables, headerValues, setHeaderValues],
              ['texto', selected.body.variables, bodyValues, setBodyValues],
            ] as const).map(([where, names, values, setValues]) =>
              names.map((name, index) => (
                <label key={`${where}-${name}`} className="block">
                  <span className="tpl-label">
                    Variável <code>{`{{${name}}}`}</code> do {where}
                  </span>
                  <input
                    value={values[index] ?? ''}
                    onChange={(event) => setValues(values.map((item, position) => (position === index ? event.target.value : item)))}
                    maxLength={200}
                    placeholder={index === 0 && where === 'texto' ? 'Ex.: nome do cliente' : 'Preencha o valor'}
                    className="field-control mt-1 w-full rounded-[10px] px-3 py-2.5 text-[16px] sm:text-[12px]"
                    style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--ink)' }}
                  />
                  {suggestions.length > 0 && !values[index] && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setValues(values.map((item, position) => (position === index ? suggestion : item)))}
                          className="tpl-suggest"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </span>
                  )}
                </label>
              )),
            )}

            {selected.body.variables.length + selected.header.variables.length === 0 && !selected.header.needsMedia && (
              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Este template não tem variável: vai exatamente como está na prévia.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
