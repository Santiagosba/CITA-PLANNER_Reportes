import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, ChevronRight, Search } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import { MIN_ACCOUNT_PASSWORD, passwordError, updateAccountPassword } from '../lib/accountPasswords'
import { getCrmHubWebIdFromEnv } from '../lib/hubWebEnv'
import { DEFAULT_LICENSE_VIEWS, LICENSE_VIEW_CATALOG, type LicenseViewId } from '../lib/crmViews'
import {
  fetchLicenseDesk,
  isLicenseDeskPreview,
  setLicenseCrmActive,
  setLicenseViews,
  setLicenseWorkshopActive,
  viewsLabel,
  type LicenseDeskRow,
} from '../lib/licenseDesk'
import type { Workshop } from '../types'
import LicenseUsersPanel from './LicenseUsersPanel'

type Props = {
  workshop: Workshop
}

type ListFilter = 'todas' | 'activas' | 'apagadas' | 'sin-admin'

function licenseCount(row: LicenseDeskRow): string {
  const total = row.workshops.length
  const on = row.workshops.filter((item) => item.activo).length
  if (total === 0) return 'Sin licencias'
  if (total === 1) return on ? '1 licencia' : '1 licencia, apagada'
  if (on === total) return `${total} licencias`
  return `${on} de ${total} licencias`
}

function centerCount(row: LicenseDeskRow): string {
  const total = row.workshops.reduce((sum, item) => sum + (item.centros?.length ?? 0), 0)
  if (total === 0) return 'Sin centros'
  if (total === 1) return '1 centro'
  return `${total} centros`
}

function adminLabel(row: LicenseDeskRow): string {
  if (row.admins.length === 0) return 'Sin admin'
  if (row.admins.length === 1) return row.admins[0].name
  return `${row.admins.length} admins`
}

function needsAdmin(row: LicenseDeskRow): boolean {
  return row.admins.length === 0
}

function matchesFilter(row: LicenseDeskRow, filter: ListFilter): boolean {
  if (filter === 'activas') return row.crmActivo
  if (filter === 'apagadas') return !row.crmActivo
  if (filter === 'sin-admin') return needsAdmin(row)
  return true
}

export default function LicensesDeskView({ workshop }: Props) {
  const localPreview = isLicenseDeskPreview(workshop)
  const [rows, setRows] = useState<LicenseDeskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ListFilter>('todas')
  const [deskTab, setDeskTab] = useState<'grupos' | 'usuarios'>('usuarios')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminConfirm, setAdminConfirm] = useState('')
  const [adminStatus, setAdminStatus] = useState<ActionStatus>('idle')
  const [adminError, setAdminError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchLicenseDesk(workshop)
      setRows(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las licencias.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshop.containerIdTaller, workshop.id])

  useEffect(() => {
    setAdminName('')
    setAdminEmail('')
    setAdminPassword('')
    setAdminConfirm('')
    setAdminError(null)
    setAdminStatus('idle')
  }, [selectedId])

  const selected = useMemo(
    () => rows.find((row) => row.containerId === selectedId) ?? null,
    [rows, selectedId],
  )

  const counts = useMemo(
    () => ({
      todas: rows.length,
      activas: rows.filter((row) => row.crmActivo).length,
      apagadas: rows.filter((row) => !row.crmActivo).length,
      sinAdmin: rows.filter(needsAdmin).length,
    }),
    [rows],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false
      if (!needle) return true
      return `${row.nombre} ${row.slug || ''} ${adminLabel(row)} ${row.workshops
        .map((item) => `${item.nombre} ${(item.centros || []).map((center) => center.nombre).join(' ')}`)
        .join(' ')}`
        .toLowerCase()
        .includes(needle)
    })
  }, [rows, query, filter])

  const patchRow = (containerId: string, patch: Partial<LicenseDeskRow>) => {
    setRows((current) => current.map((row) => (row.containerId === containerId ? { ...row, ...patch } : row)))
  }

  const onToggleLicense = async (row: LicenseDeskRow) => {
    const next = !row.crmActivo
    setBusyId(row.containerId)
    setError(null)
    try {
      await setLicenseCrmActive(row.containerId, next, workshop)
      patchRow(row.containerId, { crmActivo: next })
      setNotice(
        next
          ? `${row.nombre} ya está activo. Dale un admin para que el cliente entre y elija licencia y centro.`
          : `${row.nombre} está apagado. Sus admins no podrán entrar.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar el grupo.')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleView = async (viewId: LicenseViewId) => {
    if (!selected) return
    const current = selected.views ?? DEFAULT_LICENSE_VIEWS
    const next = current.includes(viewId) ? current.filter((id) => id !== viewId) : [...current, viewId]
    setBusyId(selected.containerId)
    setError(null)
    try {
      await setLicenseViews(selected.containerId, next, workshop)
      patchRow(selected.containerId, { views: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las vistas.')
    } finally {
      setBusyId(null)
    }
  }

  const onAllViews = async (all: boolean) => {
    if (!selected) return
    const next = all ? [...DEFAULT_LICENSE_VIEWS] : []
    setBusyId(selected.containerId)
    setError(null)
    try {
      await setLicenseViews(selected.containerId, next, workshop)
      patchRow(selected.containerId, { views: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las vistas.')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleWorkshop = async (idtaller: string, activo: boolean) => {
    if (!selected?.idlicenciagrupo) return
    setBusyId(selected.containerId)
    setError(null)
    try {
      await setLicenseWorkshopActive({
        idlicenciagrupo: selected.idlicenciagrupo,
        idtaller,
        active: !activo,
        workshop,
      })
      patchRow(selected.containerId, {
        workshops: selected.workshops.map((item) =>
          item.idtaller === idtaller ? { ...item, activo: !activo } : item,
        ),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la licencia.')
    } finally {
      setBusyId(null)
    }
  }

  const onCreateAdmin = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    const name = adminName.trim()
    const email = adminEmail.trim().toLowerCase()
    if (!name || !email.includes('@')) {
      setAdminError('Escribe el nombre y un correo con @.')
      return
    }
    const invalid = passwordError(adminPassword, adminConfirm)
    if (invalid) {
      setAdminError(invalid)
      return
    }
    setAdminStatus('loading')
    setAdminError(null)
    try {
      if (!selected.crmActivo) {
        await setLicenseCrmActive(selected.containerId, true, workshop)
        patchRow(selected.containerId, { crmActivo: true })
      }
      if (localPreview) {
        patchRow(selected.containerId, {
          admins: [...selected.admins.filter((item) => item.email !== email), { name, email, role: 'admin' }],
        })
        setAdminStatus('success')
        setNotice(`En local no se crea la cuenta. ${name} sería admin de ${selected.nombre} y el grupo quedaría activo.`)
        setAdminName('')
        setAdminEmail('')
        setAdminPassword('')
        setAdminConfirm('')
        return
      }
      await updateAccountPassword(email, adminPassword, {
        name,
        idtaller: selected.containerId,
        crmIdtaller: selected.containerId,
        crmIdtalleres: [selected.containerId, ...selected.workshops.map((item) => item.idtaller)],
        role: 'taller_admin',
        hubWebId: getCrmHubWebIdFromEnv(),
      })
      patchRow(selected.containerId, {
        admins: [...selected.admins.filter((item) => item.email !== email), { name, email, role: 'admin' }],
      })
      setAdminStatus('success')
      setNotice(`${name} ya es admin de ${selected.nombre}. Puede entrar y elegir licencia, con los centros listos.`)
      setAdminName('')
      setAdminEmail('')
      setAdminPassword('')
      setAdminConfirm('')
    } catch (err) {
      setAdminStatus('idle')
      setAdminError(err instanceof Error ? err.message : 'No se pudo crear el admin.')
    }
  }

  const busy = Boolean(busyId)
  const filters: { id: ListFilter; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: counts.todas },
    { id: 'apagadas', label: 'Apagados', count: counts.apagadas },
    { id: 'activas', label: 'Activos', count: counts.activas },
    { id: 'sin-admin', label: 'Sin admin', count: counts.sinAdmin },
  ]

  if (loading && rows.length === 0) {
    return (
      <div className="dashboard-page role-desk">
        <HexLoaderScreen size="md" label="Cargando grupos…" />
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk license-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {localPreview ? (
        <ApiStatusBanner
          message="Esto es una prueba local. Para activar de verdad, quita «Ver como» y entra con santy@gmail.com."
          variant="warning"
        />
      ) : null}
      {notice ? (
        <p className="assign-success" role="status">
          {notice}
        </p>
      ) : null}

      {selected ? (
        <Card className="license-desk-detail" padding="lg">
          <button type="button" className="ghost-button teams-guide-back" onClick={() => setSelectedId(null)}>
            Volver a grupos
          </button>

          <div className="license-desk-head">
            <div>
              <p className="section-eyebrow">Grupo</p>
              <h2 className="ops-card-title">{selected.nombre}</h2>
              <p className="section-subtitle">
                {selected.slug ? `/${selected.slug} · ` : ''}
                {licenseCount(selected)} · {centerCount(selected)}
                {selected.grupoActivo ? '' : ' · El grupo está apagado en Hub'}
              </p>
            </div>
            <span className={`badge ${selected.crmActivo ? 'tone-positive' : 'tone-warning'}`}>
              {selected.crmActivo ? 'Activo' : 'Apagado'}
            </span>
          </div>

          <ol className="license-desk-steps">
            <li className={`license-desk-step${selected.crmActivo ? ' is-done' : ''}`}>
              <p className="license-desk-step-kicker">1. Activar</p>
              <h3 className="teams-guide-block-title">Grupo en este CRM</h3>
              <p className="section-subtitle">
                {selected.crmActivo
                  ? 'El admin de este cliente ya puede entrar y elegir licencia, con los centros listos.'
                  : 'Está apagado. Actívalo o créale un admin: al crearlo se activa solo.'}
              </p>
              <button
                type="button"
                className={selected.crmActivo ? 'ghost-button' : 'client-submit'}
                disabled={busy}
                onClick={() => void onToggleLicense(selected)}
              >
                {selected.crmActivo ? 'Apagar grupo' : 'Activar ahora'}
              </button>
            </li>

            <li className={`license-desk-step${selected.admins.length ? ' is-done' : ''}`}>
              <p className="license-desk-step-kicker">2. Admin del cliente</p>
              <h3 className="teams-guide-block-title">Quién entra</h3>
              <p className="section-subtitle">
                Crea al admin del grupo. Él elige licencia y entra con sus centros. Si el grupo está apagado, se activa al crearlo.
              </p>
              {selected.admins.length === 0 ? (
                <p className="section-subtitle">Aún no hay admin.</p>
              ) : (
                <ul className="license-desk-admins">
                  {selected.admins.map((admin) => (
                    <li key={admin.email}>
                      <strong>{admin.name}</strong>
                      <small>{admin.email}</small>
                    </li>
                  ))}
                </ul>
              )}
              <form className="license-desk-admin-form" onSubmit={onCreateAdmin}>
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-admin-name">
                    Nombre
                  </label>
                  <input
                    id="license-admin-name"
                    className="field-input"
                    value={adminName}
                    onChange={(event) => setAdminName(event.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-admin-email">
                    Correo
                  </label>
                  <input
                    id="license-admin-email"
                    className="field-input"
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-admin-pass">
                    Contraseña
                  </label>
                  <input
                    id="license-admin-pass"
                    className="field-input"
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={MIN_ACCOUNT_PASSWORD}
                  />
                </div>
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-admin-confirm">
                    Repite la contraseña
                  </label>
                  <input
                    id="license-admin-confirm"
                    className="field-input"
                    type="password"
                    value={adminConfirm}
                    onChange={(event) => setAdminConfirm(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {adminError ? (
                  <div className="license-desk-field-full">
                    <ApiStatusBanner message={adminError} variant="error" />
                  </div>
                ) : null}
                <div className="license-desk-field-full">
                  <ActionButton type="submit" status={adminStatus}>
                    {selected.crmActivo ? 'Crear admin' : 'Crear admin y activar grupo'}
                  </ActionButton>
                </div>
              </form>
            </li>

            <li className="license-desk-step">
              <p className="license-desk-step-kicker">3. Licencias</p>
              <h3 className="teams-guide-block-title">Cuáles puede elegir</h3>
              <p className="section-subtitle">
                Deja encendidas solo las licencias de este grupo. Debajo de cada una van sus centros.
              </p>
              {selected.workshops.length === 0 ? (
                <p className="section-subtitle">Este grupo no tiene licencias enlazadas.</p>
              ) : (
                <ul className="license-desk-shops">
                  {selected.workshops.map((item) => (
                    <li key={item.idtaller} className="license-desk-shop">
                      <label className={`license-desk-check${item.activo ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={item.activo}
                          disabled={busy || !selected.idlicenciagrupo}
                          onChange={() => void onToggleWorkshop(item.idtaller, item.activo)}
                        />
                        <span>
                          <strong>{item.nombre}</strong>
                          <small>
                            {[
                              item.poblacion || 'Licencia del grupo',
                              item.centros?.length
                                ? item.centros.length === 1
                                  ? '1 centro'
                                  : `${item.centros.length} centros`
                                : 'Sin centros',
                            ].join(' · ')}
                          </small>
                        </span>
                      </label>
                      {(item.centros || []).length === 0 ? (
                        <p className="license-desk-centers-empty">Sin centros</p>
                      ) : (
                        <ul className="license-desk-centers">
                          {(item.centros || []).map((center) => (
                            <li key={center.idcentro}>
                              <strong>{center.nombre}</strong>
                              <small>{center.poblacion || 'Centro de esta licencia'}</small>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li className="license-desk-step">
              <div className="license-desk-block-head">
                <div>
                  <p className="license-desk-step-kicker">4. Pantallas</p>
                  <h3 className="teams-guide-block-title">Qué verá el admin</h3>
                  <p className="section-subtitle">{viewsLabel(selected.views)}.</p>
                </div>
                <div className="assign-pills">
                  <button type="button" className="ghost-button" disabled={busy} onClick={() => void onAllViews(true)}>
                    Todas
                  </button>
                  <button type="button" className="ghost-button" disabled={busy} onClick={() => void onAllViews(false)}>
                    Ninguna
                  </button>
                </div>
              </div>
              <ul className="license-desk-views">
                {LICENSE_VIEW_CATALOG.map((item) => {
                  const on = (selected.views ?? DEFAULT_LICENSE_VIEWS).includes(item.id)
                  return (
                    <li key={item.id}>
                      <label className={`license-desk-check${on ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy}
                          onChange={() => void onToggleView(item.id)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </li>
          </ol>
        </Card>
      ) : (
        <>
          <div className="license-desk-filters" role="tablist" aria-label="Apartados">
            <button
              type="button"
              role="tab"
              aria-selected={deskTab === 'usuarios'}
              className={`license-desk-filter${deskTab === 'usuarios' ? ' is-on' : ''}`}
              onClick={() => setDeskTab('usuarios')}
            >
              Usuarios
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={deskTab === 'grupos'}
              className={`license-desk-filter${deskTab === 'grupos' ? ' is-on' : ''}`}
              onClick={() => setDeskTab('grupos')}
            >
              Grupos
            </button>
          </div>
          {deskTab === 'usuarios' ? (
            <LicenseUsersPanel workshop={workshop} groups={rows} />
          ) : (
            <>
          <section className="license-desk-kpis" aria-label="Resumen de grupos">
            <article className="metric glass glass-lite">
              <span>Grupos</span>
              <strong>{counts.todas}</strong>
              <small>Cada uno con sus licencias</small>
            </article>
            <article className="metric glass glass-lite">
              <span>Activos</span>
              <strong>{counts.activas}</strong>
              <small>Ya pueden entrar</small>
            </article>
            <article className="metric glass glass-lite">
              <span>Sin admin</span>
              <strong>{counts.sinAdmin}</strong>
              <small>Falta la cuenta del cliente</small>
            </article>
          </section>

          <Card padding="lg">
            <div className="license-desk-toolbar">
              <div className="license-desk-filters" role="tablist" aria-label="Filtrar grupos">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.id}
                    className={`license-desk-filter${filter === item.id ? ' is-on' : ''}`}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} {item.count}
                  </button>
                ))}
              </div>
              <div className="view-page-search-field">
                <Search size={20} aria-hidden className="view-page-search-icon" />
                <input
                  className="view-page-search-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar grupo, licencia o centro"
                  aria-label="Buscar grupo"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="section-subtitle">
                {rows.length === 0
                  ? 'No hay grupos en esta web.'
                  : 'Nadie coincide con ese filtro o búsqueda.'}
              </p>
            ) : (
              <ul className="license-desk-list">
                {filtered.map((row) => (
                  <li key={row.containerId}>
                    <div className={`license-desk-card${row.crmActivo ? ' is-on' : ''}${needsAdmin(row) ? ' needs-admin' : ''}`}>
                      <span className="license-desk-mark" aria-hidden>
                        <Building2 size={20} />
                      </span>
                      <div className="license-desk-copy">
                        <strong>{row.nombre}</strong>
                        <small>
                          {licenseCount(row)} · {centerCount(row)} · {adminLabel(row)}
                        </small>
                        <span className="license-desk-card-tags">
                          <span className={`badge ${row.crmActivo ? 'tone-positive' : 'tone-warning'}`}>
                            {row.crmActivo ? 'Activo' : 'Apagado'}
                          </span>
                          {needsAdmin(row) ? <span className="badge tone-warning">Sin admin</span> : null}
                        </span>
                      </div>
                      <div className="license-desk-card-actions">
                        <button
                          type="button"
                          className={!row.crmActivo && !needsAdmin(row) ? 'client-submit' : 'ghost-button'}
                          disabled={busy}
                          onClick={() => void onToggleLicense(row)}
                        >
                          {row.crmActivo ? 'Apagar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className={needsAdmin(row) ? 'client-submit' : 'ghost-button'}
                          onClick={() => setSelectedId(row.containerId)}
                        >
                          {needsAdmin(row) ? 'Dar admin' : 'Abrir'}
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
