import { Eye, EyeOff } from 'lucide-react'
import { MIN_ACCOUNT_PASSWORD } from '../lib/accountPasswords'

export type AccountPasswordForm = {
  current: string
  next: string
  confirm: string
  show: boolean
}

type Props = {
  id: string
  form: AccountPasswordForm
  needCurrent?: boolean
  onChange: (patch: Partial<AccountPasswordForm>) => void
}

export default function AccountPasswordFields({ id, form, needCurrent = false, onChange }: Props) {
  const type = form.show ? 'text' : 'password'
  return (
    <>
      {needCurrent ? (
        <>
          <label className="field-label" htmlFor={`${id}-current`}>
            Contraseña actual
          </label>
          <input
            id={`${id}-current`}
            className="field-input"
            type={type}
            autoComplete="current-password"
            value={form.current}
            onChange={(event) => onChange({ current: event.target.value })}
          />
        </>
      ) : null}
      <label className="field-label" htmlFor={`${id}-next`}>
        Contraseña nueva
      </label>
      <div className="teams-guide-password">
        <input
          id={`${id}-next`}
          className="field-input"
          type={type}
          autoComplete="new-password"
          value={form.next}
          onChange={(event) => onChange({ next: event.target.value })}
          minLength={MIN_ACCOUNT_PASSWORD}
        />
        <button
          type="button"
          className="ghost-button"
          aria-label={form.show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => onChange({ show: !form.show })}
        >
          {form.show ? <EyeOff size={20} /> : <Eye size={20} />}
          {form.show ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      <label className="field-label" htmlFor={`${id}-confirm`}>
        Repite la nueva
      </label>
      <input
        id={`${id}-confirm`}
        className="field-input"
        type={type}
        autoComplete="new-password"
        value={form.confirm}
        onChange={(event) => onChange({ confirm: event.target.value })}
        minLength={MIN_ACCOUNT_PASSWORD}
      />
    </>
  )
}
