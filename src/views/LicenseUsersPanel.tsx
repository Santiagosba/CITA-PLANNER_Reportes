import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronRight, Search, UserPlus } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import { MIN_ACCOUNT_PASSWORD, passwordError } from '../lib/accountPasswords'
import {
  fetchLicenseUsers,
  setLicenseUserAccess,
  type LicenseDeskRow,
  type LicenseDeskUser,
} from '../lib/licenseDesk'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  groups: LicenseDeskRow[]
}

type AccessCenter = { id: string; name: string }
type AccessLicense = { id: string; name: string; allCenters: boolean; centers: AccessCenter[] }
type AccessGroup = { id: string; name: string; licenses: AccessLicense[] }

function roleLabel(role: LicenseDeskUser['role']): string {
  return role === 'taller_admin' ? 'Admin' : 'Asesor'
}

function sameId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function hasId(ids: string[], id: string): boolean {
  return ids.some((item) => sameId(item, id))
}

function addId(ids: string[], id: string): string[] {
  return hasId(ids, id) ? ids : [...ids, id]
}

function dropId(ids: string[], id: string): string[] {
  return ids.filter((item) => !sameId(item, id))
}

function dropMany(ids: string[], remove: string[]): string[] {
  return ids.filter((item) => !remove.some((value) => sameId(item, value)))
}

/** Licencia activa y sin lista de centros = todos los de esa licencia (igual que al entrar). */
function isCenterActive(
  centerId: string,
  licenseId: string,
  centerIds: string[],
  licenseIds: string[],
): boolean {
  if (hasId(centerIds, centerId)) return true
  return centerIds.length === 0 && hasId(licenseIds, licenseId)
}

function centersOfLicenses(catalog: LicenseDeskRow[], licenseIds: string[]): string[] {
  return catalog.flatMap((group) =>
    group.workshops
      .filter((shop) => hasId(licenseIds, shop.idtaller))
      .flatMap((shop) => (shop.centros || []).map((center) => center.idcentro)),
  )
}

function userAccessTree(user: Pick<LicenseDeskUser, 'groupIds' | 'licenseIds' | 'centerIds'>, catalog: LicenseDeskRow[]): AccessGroup[] {
  const groupOn = (id: string) => hasId(user.groupIds, id)
  const licenseOn = (id: string) => hasId(user.licenseIds, id)
  const centerOn = (id: string) => hasId(user.centerIds, id)
  const everyCenter = user.centerIds.length === 0

  return catalog
    .map((group) => {
      const licenses = group.workshops
        .map((shop) => {
          const centros = shop.centros || []
          if (licenseOn(shop.idtaller)) {
            const picked = everyCenter ? centros : centros.filter((center) => centerOn(center.idcentro))
            return {
              id: shop.idtaller,
              name: shop.nombre,
              allCenters: everyCenter || (centros.length > 0 && picked.length === centros.length),
              centers: (everyCenter ? centros : picked).map((center) => ({ id: center.idcentro, name: center.nombre })),
            }
          }
          const picked = centros.filter((center) => centerOn(center.idcentro))
          if (picked.length === 0) return null
          return {
            id: shop.idtaller,
            name: shop.nombre,
            allCenters: centros.length > 0 && picked.length === centros.length,
            centers: picked.map((center) => ({ id: center.idcentro, name: center.nombre })),
          }
        })
        .filter((item): item is AccessLicense => item !== null)

      if (!groupOn(group.containerId) && licenses.length === 0) return null
      return { id: group.containerId, name: group.nombre, licenses }
    })
    .filter((item): item is AccessGroup => item !== null)
}

function treeCounts(tree: AccessGroup[]): string {
  const licenses = tree.reduce((sum, group) => sum + group.licenses.length, 0)
  const centers = tree.reduce(
    (sum, group) => sum + group.licenses.reduce((inner, shop) => inner + shop.centers.length, 0),
    0,
  )
  const groups = tree.length
  return [
    groups === 1 ? '1 grupo' : `${groups} grupos`,
    licenses === 1 ? '1 licencia' : `${licenses} licencias`,
    centers === 1 ? '1 centro' : `${centers} centros`,
  ].join(' · ')
}

function accessSearchText(user: LicenseDeskUser, tree: AccessGroup[]): string {
  return [
    user.name,
    user.email,
    roleLabel(user.role),
    ...tree.flatMap((group) => [
      group.name,
      ...group.licenses.flatMap((shop) => [shop.name, ...shop.centers.map((center) => center.name)]),
    ]),
  ]
    .join(' ')
    .toLowerCase()
}

function AccessTree({ tree }: { tree: AccessGroup[] }) {
  if (tree.length === 0) {
    return <p className="license-user-hint">Nada activo todavía.</p>
  }

  return (
    <ul className="license-user-tree">
      {tree.map((group) => (
        <li key={group.id} className="license-user-branch">
          <div className="license-user-branch-head">
            <span className="badge tone-neutral">Grupo</span>
            <strong>{group.name}</strong>
          </div>
          {group.licenses.length === 0 ? (
            <p className="license-user-hint">Sin licencias en este grupo.</p>
          ) : (
            <ul className="license-user-tree-licenses">
              {group.licenses.map((shop) => (
                <li key={shop.id} className="license-user-branch is-license">
                  <div className="license-user-branch-head">
                    <span className="badge tone-neutral">Licencia</span>
                    <strong>{shop.name}</strong>
                    <small>{shop.allCenters ? 'Todos los centros' : `${shop.centers.length} centros`}</small>
                  </div>
                  {shop.centers.length === 0 ? (
                    <p className="license-user-hint">Sin centros en esta licencia.</p>
                  ) : (
                    <ul className="license-user-chips">
                      {shop.centers.map((center) => (
                        <li key={center.id}>
                          <span className="badge tone-positive">{center.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function LicenseUsersPanel({ workshop, groups }: Props) {
  const [users, setUsers] = useState<LicenseDeskUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<LicenseDeskUser['role']>('asesor')
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [licenseIds, setLicenseIds] = useState<string[]>([])
  const [centerIds, setCenterIds] = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState<ActionStatus>('idle')
  const [formError, setFormError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await fetchLicenseUsers(workshop))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshop.containerIdTaller, workshop.id])

  const selected = useMemo(
    () => users.find((item) => item.email === selectedEmail) ?? null,
    [users, selectedEmail],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users
      .map((item) => ({ user: item, tree: userAccessTree(item, groups) }))
      .filter(({ user, tree }) => !needle || accessSearchText(user, tree).includes(needle))
  }, [users, query, groups])

  const liveTree = useMemo(
    () => userAccessTree({ groupIds, licenseIds, centerIds }, groups),
    [groupIds, licenseIds, centerIds, groups],
  )

  const openUser = (user: LicenseDeskUser | null) => {
    setCreating(!user)
    setSelectedEmail(user?.email ?? '')
    setName(user?.name || '')
    setEmail(user?.email || '')
    setPassword('')
    setConfirm('')
    setRole(user?.role || 'asesor')
    setGroupIds(user?.groupIds || [])
    setLicenseIds(user?.licenseIds || [])
    setCenterIds(
      user
        ? user.centerIds.length
          ? user.centerIds
          : centersOfLicenses(groups, user.licenseIds)
        : [],
    )
    setFormError(null)
    setSaveStatus('idle')
  }

  const toggleGroup = (containerId: string, row: LicenseDeskRow) => {
    if (hasId(groupIds, containerId)) {
      const shopIds = row.workshops.map((item) => item.idtaller)
      const centroIds = row.workshops.flatMap((item) => (item.centros || []).map((center) => center.idcentro))
      setGroupIds((current) => dropId(current, containerId))
      setLicenseIds((current) => dropMany(current, shopIds))
      setCenterIds((current) => dropMany(current, centroIds))
      return
    }
    setGroupIds((current) => addId(current, containerId))
  }

  const toggleLicense = (containerId: string, idtaller: string, centros: Array<{ idcentro: string }>) => {
    if (hasId(licenseIds, idtaller)) {
      const centroIds = centros.map((item) => item.idcentro)
      setLicenseIds((current) => dropId(current, idtaller))
      setCenterIds((current) => dropMany(current, centroIds))
      return
    }
    setGroupIds((current) => addId(current, containerId))
    setLicenseIds((current) => addId(current, idtaller))
    setCenterIds((current) => [...centros.map((item) => item.idcentro).reduce((list, id) => addId(list, id), current)])
  }

  const toggleCenter = (containerId: string, idtaller: string, idcentro: string) => {
    if (hasId(centerIds, idcentro)) {
      setCenterIds((current) => dropId(current, idcentro))
      return
    }
    setGroupIds((current) => addId(current, containerId))
    setLicenseIds((current) => addId(current, idtaller))
    setCenterIds((current) => addId(current, idcentro))
  }

  const onSave = async (event: FormEvent) => {
    event.preventDefault()
    const nextEmail = email.trim().toLowerCase()
    const nextName = name.trim()
    if (!nextName || !nextEmail.includes('@')) {
      setFormError('Escribe el nombre y un correo con @.')
      return
    }
    if (creating || password || confirm) {
      const invalid = passwordError(password, confirm)
      if (invalid) {
        setFormError(invalid)
        return
      }
    }
    if (groupIds.length === 0) {
      setFormError('Activa al menos un grupo.')
      return
    }
    setSaveStatus('loading')
    setFormError(null)
    try {
      const saved = await setLicenseUserAccess(
        {
          email: nextEmail,
          name: nextName,
          ...(password ? { password } : {}),
          role,
          groupIds,
          licenseIds,
          centerIds,
        },
        workshop,
      )
      setUsers((current) => [...current.filter((item) => item.email !== saved.email), saved])
      setSaveStatus('success')
      setNotice(`${saved.name} ya tiene sus grupos, licencias y centros.`)
      setCreating(false)
      setSelectedEmail(saved.email)
      setPassword('')
      setConfirm('')
    } catch (err) {
      setSaveStatus('idle')
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el usuario.')
    }
  }

  if (loading && users.length === 0) {
    return <HexLoaderScreen size="md" label="Cargando usuarios…" />
  }

  if (selectedEmail !== null) {
    const title = creating ? 'Nuevo usuario' : selected?.name || name || email
    return (
      <Card className="license-user-detail" padding="lg">
        <button type="button" className="ghost-button teams-guide-back" onClick={() => setSelectedEmail(null)}>
          Volver a usuarios
        </button>

        <header className="license-user-detail-head">
          <span className="license-desk-mark" aria-hidden>
            {(title || '?').slice(0, 2).toUpperCase()}
          </span>
          <div className="license-desk-copy">
            <p className="section-eyebrow">{creating ? 'Crear cuenta' : 'Ficha'}</p>
            <h2 className="ops-card-title">{title}</h2>
            <small>{creating ? 'Pon nombre, correo y lo que puede ver.' : `${email} · ${roleLabel(role)}`}</small>
          </div>
        </header>

        {!creating ? (
          <section className="license-user-section" aria-label="Qué tiene activo">
            <div className="license-user-section-head">
              <h3 className="license-user-section-title">Así entra ahora</h3>
              <p className="section-subtitle">{liveTree.length ? treeCounts(liveTree) : 'Nada activo todavía.'}</p>
            </div>
            <AccessTree tree={liveTree} />
          </section>
        ) : null}

        <form className="license-user-form" onSubmit={(event) => void onSave(event)}>
          <section className="license-user-section" aria-label="Cuenta">
            <h3 className="license-user-section-title">Cuenta</h3>
            <div className="license-user-fields">
              <div className="license-desk-field">
                <label className="field-label" htmlFor="license-user-name">
                  Nombre
                </label>
                <input
                  id="license-user-name"
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="license-desk-field">
                <label className="field-label" htmlFor="license-user-email">
                  Correo
                </label>
                <input
                  id="license-user-email"
                  className="field-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                  disabled={!creating}
                />
              </div>
            </div>
            <div className="license-desk-field">
              <p className="field-label" id="license-user-role">
                Rol
              </p>
              <div className="assign-pills" role="group" aria-labelledby="license-user-role">
                <button
                  type="button"
                  className={role === 'taller_admin' ? 'client-submit' : 'ghost-button'}
                  onClick={() => setRole('taller_admin')}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className={role === 'asesor' ? 'client-submit' : 'ghost-button'}
                  onClick={() => setRole('asesor')}
                >
                  Asesor
                </button>
              </div>
            </div>
            {creating ? (
              <div className="license-user-fields">
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-user-pass">
                    Contraseña
                  </label>
                  <input
                    id="license-user-pass"
                    className="field-input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={MIN_ACCOUNT_PASSWORD}
                  />
                </div>
                <div className="license-desk-field">
                  <label className="field-label" htmlFor="license-user-confirm">
                    Repite la contraseña
                  </label>
                  <input
                    id="license-user-confirm"
                    className="field-input"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            ) : (
              <details className="license-user-more">
                <summary>Cambiar contraseña</summary>
                <div className="license-user-fields">
                  <div className="license-desk-field">
                    <label className="field-label" htmlFor="license-user-pass">
                      Nueva contraseña
                    </label>
                    <input
                      id="license-user-pass"
                      className="field-input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="license-desk-field">
                    <label className="field-label" htmlFor="license-user-confirm">
                      Repítela
                    </label>
                    <input
                      id="license-user-confirm"
                      className="field-input"
                      type="password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </details>
            )}
          </section>

          <section className="license-user-section" aria-label="Activar o quitar accesos">
            <div className="license-user-section-head">
              <h3 className="license-user-section-title">Activar o quitar</h3>
              <p className="section-subtitle">Verde es lo que puede usar. Gris está apagado.</p>
            </div>
            <ul className="license-user-editor">
              {groups.map((group) => {
                const groupOn = hasId(groupIds, group.containerId)
                return (
                  <li key={group.containerId} className={`license-user-block${groupOn ? ' is-on' : ''}`}>
                    <label className={`license-user-switch${groupOn ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={groupOn}
                        onChange={() => toggleGroup(group.containerId, group)}
                      />
                      <span className="license-user-switch-copy">
                        <small>Grupo</small>
                        <strong>{group.nombre}</strong>
                      </span>
                      <span className={`badge ${groupOn ? 'tone-positive' : 'tone-warning'}`}>
                        {groupOn ? 'Activo' : 'Apagado'}
                      </span>
                    </label>
                    {groupOn ? (
                      <ul className="license-user-nest">
                        {group.workshops.map((shop) => {
                          const shopOn = hasId(licenseIds, shop.idtaller)
                          const centros = shop.centros || []
                          return (
                            <li key={shop.idtaller} className={`license-user-block is-nested${shopOn ? ' is-on' : ''}`}>
                              <label className={`license-user-switch${shopOn ? ' is-on' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={shopOn}
                                  onChange={() => toggleLicense(group.containerId, shop.idtaller, centros)}
                                />
                                <span className="license-user-switch-copy">
                                  <small>Licencia</small>
                                  <strong>{shop.nombre}</strong>
                                </span>
                                <span className={`badge ${shopOn ? 'tone-positive' : 'tone-warning'}`}>
                                  {shopOn ? 'Activa' : 'Apagada'}
                                </span>
                              </label>
                              {shopOn ? (
                                centros.length ? (
                                  <ul className="license-user-chips">
                                    {centros.map((center) => {
                                      const centerOn = isCenterActive(
                                        center.idcentro,
                                        shop.idtaller,
                                        centerIds,
                                        licenseIds,
                                      )
                                      return (
                                        <li key={center.idcentro}>
                                          <label className={`license-user-chip${centerOn ? ' is-on' : ''}`}>
                                            <input
                                              type="checkbox"
                                              checked={centerOn}
                                              onChange={() =>
                                                toggleCenter(group.containerId, shop.idtaller, center.idcentro)
                                              }
                                            />
                                            {center.nombre}
                                          </label>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                ) : (
                                  <p className="license-user-hint">Esta licencia no tiene centros.</p>
                                )
                              ) : (
                                <p className="license-user-hint">Activa la licencia para ver sus centros.</p>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="license-user-hint">Activa el grupo para ver sus licencias.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {formError ? <ApiStatusBanner message={formError} variant="error" /> : null}
          <ActionButton type="submit" status={saveStatus}>
            {creating ? 'Crear usuario' : 'Guardar cambios'}
          </ActionButton>
        </form>
      </Card>
    )
  }

  return (
    <>
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {notice ? (
        <p className="assign-success" role="status">
          {notice}
        </p>
      ) : null}
      <Card className="license-user-panel" padding="lg">
        <div className="license-user-toolbar">
          <div className="view-page-search-field">
            <Search size={20} aria-hidden className="view-page-search-icon" />
            <input
              className="view-page-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar persona, grupo, licencia o centro"
              aria-label="Buscar persona, grupo, licencia o centro"
            />
          </div>
          <button type="button" className="client-submit" onClick={() => openUser(null)}>
            <UserPlus size={18} aria-hidden />
            Nuevo usuario
          </button>
        </div>
        {filtered.length === 0 ? (
          <p className="section-subtitle">
            {users.length === 0 ? 'Aún no hay usuarios en estos grupos.' : 'Nadie coincide con esa búsqueda.'}
          </p>
        ) : (
          <ul className="license-desk-list">
            {filtered.map(({ user, tree }) => (
              <li key={user.email}>
                <button type="button" className="license-user-card" onClick={() => openUser(user)}>
                  <div className="license-user-card-head">
                    <span className="license-desk-mark" aria-hidden>
                      {(user.name || user.email).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="license-desk-copy">
                      <strong>{user.name || user.email}</strong>
                      <small>
                        {user.email} · {roleLabel(user.role)}
                        {tree.length ? ` · ${treeCounts(tree)}` : ''}
                      </small>
                    </div>
                    <span className="license-user-card-go">
                      Ver
                      <ChevronRight size={18} aria-hidden />
                    </span>
                  </div>
                  <AccessTree tree={tree} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
