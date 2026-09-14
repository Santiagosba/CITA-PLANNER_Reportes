import type { AdvisorTeam } from '../lib/advisorWorkspace'
import { TEAM_FILTER_ALL, TEAM_FILTER_LOOSE, type TeamFilterId } from '../lib/teamScope'

type Props = {
  teams: AdvisorTeam[]
  value: TeamFilterId
  onChange: (filter: TeamFilterId) => void
  showLoose?: boolean
  label?: string
}

export default function TeamFilter({
  teams,
  value,
  onChange,
  showLoose = true,
  label = 'Equipo',
}: Props) {
  if (teams.length === 0) return null

  return (
    <div className="filter-field team-filter">
      <span className="filter-field-label">{label}</span>
      <div className="estado-filter" role="group" aria-label={label}>
        <button
          type="button"
          className={`preset-chip ${value === TEAM_FILTER_ALL ? 'is-active' : ''}`}
          onClick={() => onChange(TEAM_FILTER_ALL)}
        >
          Todos
        </button>
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={`preset-chip ${value === team.id ? 'is-active' : ''}`}
            onClick={() => onChange(team.id)}
          >
            {team.name}
          </button>
        ))}
        {showLoose ? (
          <button
            type="button"
            className={`preset-chip ${value === TEAM_FILTER_LOOSE ? 'is-active' : ''}`}
            onClick={() => onChange(TEAM_FILTER_LOOSE)}
          >
            Sin dueño
          </button>
        ) : null}
      </div>
    </div>
  )
}
