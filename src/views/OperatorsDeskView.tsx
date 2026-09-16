import { useMemo, useRef, useState } from 'react'
import { Camera, Search } from 'lucide-react'
import AdvisorTicketList from '../components/AdvisorTicketList'
import ApiStatusBanner from '../components/ApiStatusBanner'
import OperatorAvatar from '../components/OperatorAvatar'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import {
  computeAdvisorStats,
  isPersonPendingDelete,
  normalizeEmail,
  personById,
  personMatchesQuery,
  teamNamesForPerson,
} from '../lib/advisorWorkspace'
import { isSuperAdminEmail } from '../lib/crmAccess'
import { resolveDateRange } from '../lib/dateRangePresets'
import { resizeImageFile } from '../lib/lauraProfile'
import { ticketsOwnedByEmail } from '../lib/ownerScope'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  readOnly?: boolean
  onOpenLead?: (peticion: PeticionPendiente) => void
}

function roleLabel(person: { email: string; role?: string }): string {
  if (isSuperAdminEmail(person.email)) return 'Super admin'
  return person.role === 'taller_admin' ? 'Admin' : 'Asesor'
}

export default function OperatorsDeskView({ workshop, currentUser, readOnly = false, onOpenLead }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, loading: workspaceLoading, persistError, updateAdvisor, assignTicketTeam } = useAdvisorWorkspace(
    workshopId,
    currentUser,
    true,
  )
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const peticionEmails = useMemo(() => {
    const map = new Map<string, { total: number; hechas: number }>()
    for (const item of items) {
      const email = normalizeEmail(item.gestionemail || '')
      if (!email) continue
      const prev = map.get(email) ?? { total: 0, hechas: 0 }
      prev.total += 1
      if (item.gestionado) prev.hechas += 1
      map.set(email, prev)
    }
    return map
  }, [items])

  const stats = useMemo(
    () =>
      computeAdvisorStats(workspace, {
        fromIso: range.from?.slice(0, 10),
        toIso: range.to?.slice(0, 10),
        peticionEmails,
      }),
    [workspace, range.from, range.to, peticionEmails],
  )

  const people = useMemo(
    () => workspace.people.filter((person) => !isPersonPendingDelete(person)),
    [workspace.people],
  )

  const visible = useMemo(
    () => people.filter((person) => personMatchesQuery(person, query)),
    [people, query],
  )

  const selected = selectedId ? personById(workspace, selectedId) : undefined
  const selectedStats = selected ? stats.find((row) => row.person.id === selected.id) : undefined
  const selectedTickets = selected ? ticketsOwnedByEmail(items, selected.email) : []
  const selectedOpen = selectedTickets.filter((item) => !item.gestionado).length

  const totals = stats.reduce(
    (acc, row) => {
      acc.assigned += row.assigned
      acc.done += row.done
      acc.pending += row.pending
      acc.peticiones += row.peticiones
      return acc
    },
    { assigned: 0, done: 0, pending: 0, peticiones: 0 },
  )

  const onUpload = async (file: File | undefined) => {
    if (!selected || readOnly || !file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Elige una imagen (JPG, PNG o WebP).')
      return
    }
    try {
      const dataUrl = await resizeImageFile(file, 360)
      updateAdvisor(selected.id, { photoUrl: dataUrl })
      setPhotoError(null)
    } catch {
      setPhotoError('No se pudo guardar la foto.')
    }
  }

  if (workspaceLoading && people.length === 0) {
    return (
      <div className="dashboard-page role-desk">
        <HexLoaderScreen size="md" label="Cargando operadores…" />
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk operator-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}
      {persistError ? <ApiStatusBanner message={persistError} variant="warning" /> : null}

      <section className="operator-desk-kpis" aria-label="Resumen de operadores">
        <article className="metric glass glass-lite">
          <span>Operadores</span>
          <strong>{people.length}</strong>
          <small>En este taller</small>
        </article>
        <article className="metric glass glass-lite">
          <span>Tareas del mes</span>
          <strong>{loading ? '—' : totals.assigned}</strong>
          <small>{totals.pending} pendientes</small>
        </article>
        <article className="metric glass glass-lite">
          <span>Hechas</span>
          <strong>{loading ? '—' : totals.done}</strong>
          <small>{totals.peticiones} consultas gestionadas</small>
        </article>
      </section>

      {selected ? (
        <Card className="operator-desk-ficha" padding="lg">
          <button type="button" className="ghost-button teams-guide-back" onClick={() => setSelectedId(null)}>
            Volver a operadores
          </button>
          <div className="operator-desk-head">
            <div className="operator-desk-photo">
              <OperatorAvatar name={selected.name} photoUrl={selected.photoUrl} size="lg" />
              {readOnly ? null : (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void onUpload(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="ghost-button operator-desk-photo-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera size={16} aria-hidden />
                    {selected.photoUrl ? 'Cambiar' : 'Foto'}
                  </button>
                  {selected.photoUrl ? (
                    <button
                      type="button"
                      className="ghost-button operator-desk-photo-btn"
                      onClick={() => updateAdvisor(selected.id, { photoUrl: '' })}
                    >
                      Quitar
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <div className="operator-desk-head-copy">
              <p className="section-eyebrow">Identidad</p>
              <h2 className="ops-card-title">{selected.name}</h2>
              <p className="section-subtitle">{selected.email}</p>
              <div className="operator-desk-head-meta">
                <span className="badge tone-info">{roleLabel(selected)}</span>
                <span className="badge">
                  {teamNamesForPerson(workspace, selected.id) || 'Sin equipo'}
                </span>
              </div>
              {photoError ? <ApiStatusBanner message={photoError} variant="error" /> : null}
            </div>
          </div>

          {readOnly ? (
            <dl className="operator-desk-facts">
              <div>
                <dt>Puesto</dt>
                <dd>{selected.jobTitle || 'Sin puesto'}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{selected.phone || 'Sin teléfono'}</dd>
              </div>
            </dl>
          ) : (
            <div className="operator-desk-fields">
              <div className="operator-desk-field">
                <label className="field-label" htmlFor="op-name">
                  Nombre
                </label>
                <input
                  id="op-name"
                  className="field-input"
                  value={selected.name}
                  onChange={(event) => updateAdvisor(selected.id, { name: event.target.value })}
                />
              </div>
              <div className="operator-desk-field">
                <label className="field-label" htmlFor="op-job">
                  Puesto
                </label>
                <input
                  id="op-job"
                  className="field-input"
                  value={selected.jobTitle || ''}
                  onChange={(event) => updateAdvisor(selected.id, { jobTitle: event.target.value })}
                  placeholder="Recepción, comercial…"
                />
              </div>
              <div className="operator-desk-field">
                <label className="field-label" htmlFor="op-phone">
                  Teléfono
                </label>
                <input
                  id="op-phone"
                  className="field-input"
                  value={selected.phone || ''}
                  onChange={(event) => updateAdvisor(selected.id, { phone: event.target.value })}
                  placeholder="600 000 000"
                  inputMode="tel"
                />
              </div>
            </div>
          )}

          <section className="operator-desk-kpis" aria-label={`Rendimiento de ${selected.name}`}>
            <article className="metric glass glass-lite">
              <span>Tickets abiertos</span>
              <strong>{loading ? '—' : selectedOpen}</strong>
            </article>
            <article className="metric glass glass-lite">
              <span>Consultas del mes</span>
              <strong>
                {loading ? '—' : `${selectedStats?.peticionesHechas ?? 0}/${selectedStats?.peticiones ?? 0}`}
              </strong>
            </article>
            <article className="metric glass glass-lite">
              <span>Tareas hechas</span>
              <strong>{`${selectedStats?.done ?? 0}/${selectedStats?.assigned ?? 0}`}</strong>
            </article>
          </section>

          <AdvisorTicketList
            person={selected}
            workshop={workshop}
            workspace={workspace}
            currentUser={currentUser}
            tickets={items}
            loading={loading}
            readOnly={readOnly}
            onAssignTeam={assignTicketTeam}
            onOpenLead={onOpenLead}
            showOpenButton={false}
          />
        </Card>
      ) : (
        <Card padding="lg">
          <div className="operator-desk-toolbar">
            <p className="section-subtitle operator-desk-toolbar-copy">
              {people.length === 1 ? '1 persona en este taller.' : `${people.length} personas en este taller.`}
            </p>
            <div className="view-page-search-field">
              <Search size={20} aria-hidden className="view-page-search-icon" />
              <input
                className="view-page-search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, correo o puesto"
                aria-label="Buscar operador"
              />
            </div>
          </div>

          {people.length === 0 ? (
            <p className="section-subtitle">Añade gente en Cuentas y equipos para ver su ficha aquí.</p>
          ) : visible.length === 0 ? (
            <p className="section-subtitle">Nadie coincide con «{query.trim()}».</p>
          ) : (
            <ul className="operator-desk-grid">
              {visible.map((person) => {
                const row = stats.find((item) => item.person.id === person.id)
                const open = ticketsOwnedByEmail(items, person.email).filter((item) => !item.gestionado).length
                const team = teamNamesForPerson(workspace, person.id)
                return (
                  <li key={person.id}>
                    <button type="button" className="operator-desk-card" onClick={() => setSelectedId(person.id)}>
                      <OperatorAvatar name={person.name} photoUrl={person.photoUrl} />
                      <span className="operator-desk-card-copy">
                        <strong>{person.name}</strong>
                        <small>{person.jobTitle || roleLabel(person)}</small>
                        <small>{person.phone || person.email}</small>
                        <small>{team || 'Sin equipo'}</small>
                      </span>
                      <span className="operator-desk-card-stats">
                        <span className="badge">
                          {loading ? '—' : open === 1 ? '1 ticket' : `${open} tickets`}
                        </span>
                        <span className="badge">
                          {row ? `${row.done}/${row.assigned} tareas` : 'Sin tareas'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
