import React, { useId } from 'react'

// A transicao cobre SO a borda (realce do foco). `transition-colors` incluia
// background-color, e o fundo do campo aparecia "saindo do transparente" toda
// vez que o dialogo abria.
const CONTROL =
  'field-control w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none placeholder:text-[var(--ink-faint)]'

const controlStyle: React.CSSProperties = {
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--ink)',
}

interface FieldShellProps {
  label: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
  className?: string
}

const FieldShell: React.FC<FieldShellProps> = ({ label, hint, htmlFor, children, className = '' }) => (
  <div className={className}>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[12px] font-bold"
      style={{ color: 'var(--ink-muted)' }}
    >
      {label}
    </label>
    {children}
    {hint && (
      <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        {hint}
      </p>
    )}
  </div>
)

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  wrapperClassName?: string
}

export const TextField: React.FC<InputProps> = ({ label, hint, wrapperClassName, ...rest }) => {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} htmlFor={id} className={wrapperClassName}>
      <input
        id={id}
        {...rest}
        className={`${CONTROL} ${rest.type === 'number' ? 'tnum' : ''}`}
        style={controlStyle}
      />
    </FieldShell>
  )
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  wrapperClassName?: string
  options: { value: string; label: string }[]
}

export const SelectField: React.FC<SelectProps> = ({
  label,
  hint,
  wrapperClassName,
  options,
  ...rest
}) => {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} htmlFor={id} className={wrapperClassName}>
      <select id={id} {...rest} className={CONTROL} style={controlStyle}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  hint?: string
  wrapperClassName?: string
}

export const TextAreaField: React.FC<TextAreaProps> = ({
  label,
  hint,
  wrapperClassName,
  ...rest
}) => {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} htmlFor={id} className={wrapperClassName}>
      <textarea id={id} {...rest} className={`${CONTROL} resize-y`} style={controlStyle} />
    </FieldShell>
  )
}

/** Mensagem de erro de formulario, com papel de alerta para leitor de tela. */
export const FormError: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-[10px] px-3 py-2 text-[12px] font-semibold"
      style={{
        background: 'var(--alert-surface)',
        color: 'var(--alert)',
        border: '1px solid var(--alert-border)',
      }}
    >
      {message}
    </p>
  )
}
