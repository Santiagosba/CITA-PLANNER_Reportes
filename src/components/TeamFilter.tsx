import type { AdvisorTeam } from '../lib/advisorWorkspace'
import { TEAM_FILTER_ALL, TEAM_FILTER_LOOSE, type TeamFilterId } from '../lib/teamScope'
import FilterSelect from './FilterSelect'

type Props = {
  teams: AdvisorTeam[]
  value: TeamFilterId
  onChange: (filter: TeamFilterId) => void
  showLoose?: boolean
  label?: string
  alwaysShow?: boolean
  emptyHint?: string
  className?: string
}

export default function TeamFilter({
  teams,
  value,
  onChange,
  showLoose = true,
  label = 'Equipo',
  alwaysShow = false,
  emptyHint = 'Crea equipos en Cuentas y equipos para filtrar.',
  className = '',
}: Props) {
  if (teams.length === 0 && !alwaysShow) return null

  const options =
    teams.length === 0
      ? []
      : [
          { id: TEAM_FILTER_ALL, label: 'Todos' },
          ...teams.map((team) => ({ id: team.id, label: team.name })),
          ...(showLoose ? [{ id: TEAM_FILTER_LOOSE, label: 'Sin asignar' }] : []),
        ]

  return (
    <FilterSelect
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      emptyHint={emptyHint}
      className={className}
    />
  )
}
