import { useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, UserRound } from 'lucide-react'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import {
  MIN_ACCOUNT_PASSWORD,
  passwordError,
  updateAccountPassword,
  updateOwnPassword,
} from '../lib/accountPasswords'
import { normalizeEmail } from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
}

type FormState = {
  current: string
  next: string
  confirm: string
  show: boolean
  status: ActionStatus
  notice: string | null
  error: string | null
}

const emptyForm = (): FormState => ({
  current: '',
  next: '',
  confirm: '',
  show: false,
  status: 'idle',
  notice: null,
  error: null,
})

function PasswordFields({
  id,
  form,
  onChange,
  needCurrent,
}: {
  id: string
  form: FormState
  onChange: (patch: Partial<FormState>) => void
  needCurrent: boolean
}) {
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
            onChange={(event) => onChange({ current: event.target.value, error: null, notice: null })}
            required
          />
        </>
      ) : null}
      <label className="field-label" htmlFor={`${id}-next`}>
        Contraseña nueva
      </label>
      <div className="relative">
        <input
          id={`${id}-next`}
          className="field-input pr-14"
          type={type}
          autoComplete="new-password"
          value={form.next}
          onChange={(event) => onChange({ next: event.target.value, error: null, notice: null })}
          minLength={MIN_ACCOUNT_PASSWORD}
          required
        />
        <button
          type="button"
          className="ghost-button absolute right-1 top-1/2 min-h-0 -translate-y-1/2 border-0 bg-transparent px-2 py-2"
          aria-label={form.show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => onChange({ show: !form.show })}
        >
          {form.show ? <EyeOff size={20} /> : <Eye size={20} />}
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
        onChange={(event) => onChange({ confirm: event.target.value, error: null, notice: null })}
        minLength={MIN_ACCOUNT_PASSWORD}
        required
      />
    </>
  )
}

export default function PasswordsAdminView({ workshop, currentUser }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, loading } = useAdvisorWorkspace(workshopId, currentUser, true)
  const myEmail = normalizeEmail(currentUser.email)
  const localPreview = isLocalPreviewWorkshop(workshop)

  const advisors = useMemo(
    () => workspace.people.filter((person) => normalizeEmail(person.email) !== myEmail),
    [workspace.people, myEmail],
  )

  const [own, setOwn] = useState<FormState>(emptyForm)
  const [byEmail, setByEmail] = useState<Record<string, FormState>>({})

  const advisorForm = (email: string) => byEmail[email] ?? emptyForm()
  const patchAdvisor = (email: string, patch: Partial<FormState>) => {
    setByEmail((current) => ({ ...current, [email]: { ...advisorForm(email), ...patch } }))
  }

  const saveOwn = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = passwordError(own.next, own.confirm)
    if (invalid) {
      setOwn((current) => ({ ...current, error: invalid }))
      return
    }
    if (!own.current.trim()) {
      setOwn((current) => ({ ...current, error: 'Escribe tu contraseña actual.' }))
      return
    }
    setOwn((current) => ({ ...current, status: 'loading', error: null, notice: null }))
    try {
      await updateOwnPassword(own.current, own.next)
      setOwn({ ...emptyForm(), status: 'success', notice: 'Ya está. Tu contraseña se ha cambiado.' })
    } catch (error) {
      setOwn((current) => ({
        ...current,
        status: 'idle',
        error: error instanceof Error ? error.message : 'No se pudo cambiar tu contraseña.',
      }))
    }
  }

  const saveAdvisor = async (event: FormEvent, email: string, name: string) => {
    event.preventDefault()
    const form = advisorForm(email)
    const invalid = passwordError(form.next, form.confirm)
    if (invalid) {
      patchAdvisor(email, { error: invalid })
      return
    }
    patchAdvisor(email, { status: 'loading', error: null, notice: null })
    try {
      await updateAccountPassword(email, form.next)
      patchAdvisor(email, {
        ...emptyForm(),
        status: 'success',
        notice: `Ya está. Dile a ${name} la nueva contraseña.`,
      })
    } catch (error) {
      patchAdvisor(email, {
        status: 'idle',
        error: error instanceof Error ? error.message : 'No se pudo cambiar esa contraseña.',
      })
    }
  }

  if (loading && workspace.people.length === 0) {
    return (
      <div className="dashboard-page role-desk">
        <HexLoaderScreen size="md" label="Cargando cuentas…" />
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk">
      {localPreview ? (
        <p className="alert alert-info" role="status">
          En la prueba local no hay cuentas reales. Entra con tu correo para cambiar contraseñas de verdad.
        </p>
      ) : null}

      <div className="password-account-grid">
        <Card>
          <p className="section-eyebrow">Admin</p>
          <h2 className="ops-card-title">Tu contraseña</h2>
          <p className="section-subtitle">
            {currentUser.name || myEmail}
            {myEmail ? ` · ${myEmail}` : ''}
          </p>
          <form className="role-stack-form" onSubmit={(event) => void saveOwn(event)}>
            <PasswordFields
              id="admin-own"
              form={own}
              needCurrent
              onChange={(patch) => setOwn((current) => ({ ...current, ...patch }))}
            />
            {own.error ? (
              <p className="alert alert-error" role="alert">
                {own.error}
              </p>
            ) : null}
            {own.notice ? (
              <p className="alert alert-info" role="status">
                {own.notice}
              </p>
            ) : null}
            <ActionButton type="submit" status={own.status} successLabel="Guardada" disabled={localPreview}>
              Guardar la mía
            </ActionButton>
          </form>
        </Card>

        <section className="password-advisor-list" aria-label="Asesores">
          <p className="section-eyebrow">Asesores</p>
          <h2 className="ops-card-title">Cuentas del taller</h2>
          <p className="section-subtitle">
            Las cuentas salen de Equipos. La persona entra después con el mismo correo y la contraseña nueva.
          </p>
          {advisors.length === 0 ? (
            <p className="section-subtitle">Añade asesores en Equipos para poder cambiarles la contraseña.</p>
          ) : (
            <ul className="password-advisor-cards">
              {advisors.map((person) => {
                const email = normalizeEmail(person.email)
                const form = advisorForm(email)
                return (
                  <li key={person.id}>
                    <Card>
                      <div className="password-advisor-head">
                        <span className="password-advisor-avatar" aria-hidden>
                          <UserRound size={18} />
                        </span>
                        <div>
                          <strong>{person.name}</strong>
                          <p className="section-subtitle" style={{ margin: 0 }}>
                            {email}
                          </p>
                        </div>
                      </div>
                      <form className="role-stack-form" onSubmit={(event) => void saveAdvisor(event, email, person.name)}>
                        <PasswordFields
                          id={`advisor-${person.id}`}
                          form={form}
                          needCurrent={false}
                          onChange={(patch) => patchAdvisor(email, patch)}
                        />
                        {form.error ? (
                          <p className="alert alert-error" role="alert">
                            {form.error}
                          </p>
                        ) : null}
                        {form.notice ? (
                          <p className="alert alert-info" role="status">
                            {form.notice}
                          </p>
                        ) : null}
                        <ActionButton
                          type="submit"
                          status={form.status}
                          successLabel="Guardada"
                          disabled={localPreview}
                        >
                          <KeyRound size={18} aria-hidden />
                          Guardar para {person.name.split(' ')[0] || 'el asesor'}
                        </ActionButton>
                      </form>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
