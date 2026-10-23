import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, UsersRound, ShieldCheck, Pencil, Power, Save } from 'lucide-react'
import { Modal } from './ui/Modal'
import { TextField, SelectField, FormError } from './ui/Field'
import { SubmitButton } from './ui/Feedback'
import { SCREENS } from '../lib/screens'
import { useAuth } from '../contexts/AuthContext'

type Role = 'admin' | 'vendedor' | 'tecnico'

interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  customScreens: boolean
  screens: string[]
  createdAt: string | null
}

interface Props {
  notify: (tone: 'ok' | 'alert', message: string) => void
}

const ROLE_OPTIONS = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'tecnico', label: 'Técnico / logística' },
  { value: 'admin', label: 'Administrador' },
]
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', vendedor: 'Vendedor', tecnico: 'Técnico' }

// Telas que o perfil já não permite, independente das caixas.
const ROLE_LIMITS: Record<Role, string[]> = {
  admin: [],
  vendedor: ['insights'],
  tecnico: ['insights', 'client-operations'],
}

const ALL_SCREENS = SCREENS.map((screen) => screen.id as string)

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('yr_crm_token') || ''}`,
})

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: authHeaders(), cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Falha de comunicação com o servidor.')
  return data as T
}

const ScreenChecklist: React.FC<{
  role: Role
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  lockedScreens?: string[]
  idPrefix: string
}> = ({ role, value, onChange, disabled, lockedScreens = [], idPrefix }) => {
  const isAdmin = role === 'admin'
  const limited = ROLE_LIMITS[role] || []
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
  }
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {SCREENS.map((screen) => {
          const blockedByRole = limited.includes(screen.id)
          const locked = lockedScreens.includes(screen.id)
          const checked = isAdmin || (!blockedByRole && value.includes(screen.id))
          const inputId = `${idPrefix}-${screen.id}`
          return (
            <label
              key={screen.id}
              htmlFor={inputId}
              className={`flex min-h-10 items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-bold ${disabled || isAdmin || blockedByRole || locked ? 'opacity-70' : 'cursor-pointer'}`}
              style={{ borderColor: 'var(--border-subtle)', background: checked ? 'var(--surface-raised)' : 'transparent', color: 'var(--ink)' }}
              title={blockedByRole ? 'Este perfil não tem acesso a esta tela.' : locked ? 'Você não pode remover o seu próprio acesso às Configurações.' : undefined}
            >
              <input
                id={inputId}
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={checked}
                disabled={disabled || isAdmin || blockedByRole || locked}
                onChange={() => toggle(screen.id)}
              />
              <span className="min-w-0 flex-1 truncate">{screen.label}</span>
            </label>
          )
        })}
      </div>
      {isAdmin && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Administradores sempre veem todas as telas.
        </p>
      )}
      {!isAdmin && limited.length > 0 && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Telas em cinza não estão disponíveis para o perfil {ROLE_LABEL[role]}.
        </p>
      )}
      {!isAdmin && !disabled && (
        <div className="mt-2 flex gap-3 text-[11px] font-bold">
          <button type="button" className="text-blue-700 hover:underline dark:text-blue-300" onClick={() => onChange(ALL_SCREENS.filter((id) => !limited.includes(id)))}>Marcar todas</button>
          <button type="button" className="text-blue-700 hover:underline dark:text-blue-300" onClick={() => onChange(lockedScreens.slice())}>Desmarcar todas</button>
        </div>
      )}
    </div>
  )
}

const emptyForm = { name: '', email: '', password: '', role: 'vendedor' as Role }

export const UsersSettingsPanel: React.FC<Props> = ({ notify }) => {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyForm)
  const [createScreens, setCreateScreens] = useState<string[]>(ALL_SCREENS)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ users: AdminUser[] }>('/api/admin/users')
      setUsers(data.users)
      setDrafts({})
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os usuários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const replaceUser = (next: AdminUser) => {
    setUsers((current) => current.map((item) => (item.id === next.id ? next : item)))
    setDrafts((current) => {
      const copy = { ...current }
      delete copy[next.id]
      return copy
    })
  }

  const sorted = useMemo(
    () => [...users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR')),
    [users],
  )

  const saveScreens = async (target: AdminUser) => {
    const screens = drafts[target.id]
    if (!screens) return
    setSavingId(target.id)
    try {
      const data = await api<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ screens }),
      })
      replaceUser(data.user)
      notify('ok', `Permissões de ${data.user.name} salvas.`)
    } catch (error) {
      notify('alert', error instanceof Error ? error.message : 'Não foi possível salvar as permissões.')
    } finally {
      setSavingId(null)
    }
  }

  const toggleActive = async (target: AdminUser) => {
    const next = !target.active
    if (!next && !window.confirm(`Desativar ${target.name}? O acesso ao CRM é bloqueado na hora, mas nada é apagado.`)) return
    setSavingId(target.id)
    try {
      const data = await api<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ active: next }),
      })
      replaceUser(data.user)
      notify('ok', next ? `${data.user.name} reativado.` : `${data.user.name} desativado.`)
    } catch (error) {
      notify('alert', error instanceof Error ? error.message : 'Não foi possível alterar o usuário.')
    } finally {
      setSavingId(null)
    }
  }

  const openCreate = () => {
    setCreateForm(emptyForm)
    setCreateScreens(ALL_SCREENS)
    setCreateError(null)
    setCreateOpen(true)
  }

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    if (createForm.password.length < 8) {
      setCreateError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setCreating(true)
    try {
      const data = await api<{ user: AdminUser }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...createForm, screens: createScreens }),
      })
      setUsers((current) => [...current, data.user])
      setCreateOpen(false)
      notify('ok', `Usuário ${data.user.name} criado.`)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível criar o usuário.')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (target: AdminUser) => {
    setEditing(target)
    setEditForm({ name: target.name, email: target.email, password: '', role: target.role })
    setEditError(null)
  }

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setEditError(null)
    if (editForm.password && editForm.password.length < 8) {
      setEditError('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setEditSaving(true)
    try {
      const payload: Record<string, string> = { name: editForm.name, email: editForm.email, role: editForm.role }
      if (editForm.password) payload.password = editForm.password
      const data = await api<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      replaceUser(data.user)
      setEditing(null)
      notify('ok', `Dados de ${data.user.name} salvos.`)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Não foi possível salvar.')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="users-settings-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="users-settings-title" className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>
            <UsersRound className="h-4 w-4 text-blue-600" /> Usuários e permissões
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Escolha quais telas cada pessoa pode abrir. Tela desmarcada some do menu e fica bloqueada no servidor. Usuários antigos continuam com acesso total até você alterar.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" /> Adicionar usuário
        </button>
      </div>

      {loadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          {loadError} <button type="button" className="font-bold underline" onClick={() => void load()}>Tentar novamente</button>
        </p>
      )}
      {loading && <p role="status" className="text-xs" style={{ color: 'var(--ink-muted)' }}>Carregando usuários…</p>}

      <ul className="space-y-4">
        {sorted.map((item) => {
          const isSelf = item.id === me?.id
          const draft = drafts[item.id]
          const value = draft || item.screens
          const dirty = Boolean(draft)
          return (
            <li key={item.id} className="card p-5" data-user-id={item.id} style={item.active ? undefined : { opacity: 0.7 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {item.name}
                    {isSelf && <span className="text-[10.5px] font-semibold" style={{ color: 'var(--ink-faint)' }}>(você)</span>}
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: item.role === 'admin' ? 'var(--wait-surface)' : 'var(--surface-raised)', color: item.role === 'admin' ? 'var(--wait)' : 'var(--ink-muted)' }}>
                      {item.role === 'admin' && <ShieldCheck className="mr-1 inline h-3 w-3" />}{ROLE_LABEL[item.role] || item.role}
                    </span>
                    {!item.active && (
                      <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: 'var(--alert-surface)', color: 'var(--alert)' }}>Desativado</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-muted)' }}>{item.email}</p>
                  {item.role !== 'admin' && !item.customScreens && !dirty && (
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>Acesso total (padrão). Desmarque telas para restringir.</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => openEdit(item)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" /> Editar dados
                  </button>
                  {!isSelf && (
                    <button type="button" disabled={savingId === item.id} onClick={() => void toggleActive(item)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50 ${item.active ? 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300'}`}>
                      <Power className="h-3.5 w-3.5" /> {item.active ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.13em]" style={{ color: 'var(--ink-faint)' }}>Telas liberadas</p>
                <ScreenChecklist
                  idPrefix={`perm-${item.id}`}
                  role={item.role}
                  value={value}
                  disabled={!item.active}
                  lockedScreens={isSelf ? ['settings'] : []}
                  onChange={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))}
                />
                {dirty && (
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setDrafts((current) => { const copy = { ...current }; delete copy[item.id]; return copy })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      Descartar
                    </button>
                    <button type="button" disabled={savingId === item.id} onClick={() => void saveScreens(item)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      <Save className="h-3.5 w-3.5" /> {savingId === item.id ? 'Salvando…' : 'Salvar permissões'}
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Adicionar usuário"
        subtitle="Defina a senha inicial e as telas que a pessoa pode abrir"
        icon={<UserPlus className="h-4 w-4" />}
        size="lg"
        footer={
          <div className="flex gap-3">
            <SubmitButton variant="ghost" type="button" loading={false} onClick={() => setCreateOpen(false)} className="flex-1">Cancelar</SubmitButton>
            <SubmitButton type="submit" form="form-novo-usuario" loading={creating} className="flex-[2]">Criar usuário</SubmitButton>
          </div>
        }
      >
        <form id="form-novo-usuario" onSubmit={submitCreate} className="space-y-4">
          <FormError message={createError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nome" required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            <TextField label="E-mail" type="email" required autoComplete="off" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            <TextField label="Senha inicial" type="password" required minLength={8} autoComplete="new-password" hint="Mínimo de 8 caracteres" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            <SelectField label="Perfil" options={ROLE_OPTIONS} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })} />
          </div>
          <div>
            <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.13em]" style={{ color: 'var(--ink-faint)' }}>Telas liberadas</p>
            <ScreenChecklist idPrefix="perm-novo" role={createForm.role} value={createScreens} onChange={setCreateScreens} />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Editar usuário"
        subtitle={editing?.email}
        icon={<Pencil className="h-4 w-4" />}
        footer={
          <div className="flex gap-3">
            <SubmitButton variant="ghost" type="button" loading={false} onClick={() => setEditing(null)} className="flex-1">Cancelar</SubmitButton>
            <SubmitButton type="submit" form="form-editar-usuario" loading={editSaving} className="flex-[2]">Salvar</SubmitButton>
          </div>
        }
      >
        <form id="form-editar-usuario" onSubmit={submitEdit} className="space-y-3">
          <FormError message={editError} />
          <TextField label="Nome" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <TextField label="E-mail" type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <SelectField
            label="Perfil"
            options={ROLE_OPTIONS}
            value={editForm.role}
            disabled={editing?.id === me?.id}
            hint={editing?.id === me?.id ? 'Você não pode remover o seu próprio acesso de administrador.' : undefined}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
          />
          <TextField label="Nova senha (opcional)" type="password" minLength={8} autoComplete="new-password" hint="Deixe em branco para manter a senha atual" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
        </form>
      </Modal>
    </section>
  )
}
