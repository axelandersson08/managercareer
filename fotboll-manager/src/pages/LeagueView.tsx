import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { computeStandings, type StandingRow } from '../lib/standings'
import TeamBadge from '../components/TeamBadge'
import type { Division, Fixture, Season, Team } from '../types'

interface DivisionBlock {
  division: Division
  standings: StandingRow[]
  fixtures: Fixture[]
  teams: Team[]
}

export default function LeagueView() {
  const [season, setSeason] = useState<Season | null>(null)
  const [blocks, setBlocks] = useState<DivisionBlock[]>([])
  const [cupFixtures, setCupFixtures] = useState<Fixture[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [teamColors, setTeamColors] = useState<Record<string, { primary: string; secondary: string }>>({})

  useEffect(() => {
    ;(async () => {
      const { data: seasonData } = await supabase
        .from('seasons')
        .select('*')
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle()
      const s = seasonData as Season | null
      setSeason(s)
      if (!s) return

      const { data: divisionsData } = await supabase
        .from('divisions')
        .select('*')
        .eq('season_id', s.id)
        .order('tier', { ascending: true })
      const divisions = (divisionsData as Division[]) ?? []

      const newBlocks: DivisionBlock[] = []
      for (const division of divisions) {
        const [{ data: teams }, { data: fixtures }] = await Promise.all([
          supabase.from('teams').select('*').eq('division_id', division.id),
          supabase.from('fixtures').select('*').eq('division_id', division.id).eq('competition', 'league'),
        ])
        newBlocks.push({
          division,
          teams: (teams as Team[]) ?? [],
          fixtures: (fixtures as Fixture[]) ?? [],
          standings: computeStandings((teams as Team[]) ?? [], (fixtures as Fixture[]) ?? []),
        })
      }
      setBlocks(newBlocks)

      const { data: cup } = await supabase
        .from('fixtures')
        .select('*')
        .eq('season_id', s.id)
        .eq('competition', 'cup')
        .order('cup_round', { ascending: true })
      setCupFixtures((cup as Fixture[]) ?? [])

      const { data: allTeams } = await supabase
        .from('teams')
        .select('id,name,primary_color,secondary_color')
      const names: Record<string, string> = {}
      const colors: Record<string, { primary: string; secondary: string }> = {}
      for (const t of allTeams ?? []) {
        names[t.id] = t.name
        colors[t.id] = { primary: t.primary_color, secondary: t.secondary_color }
      }
      setTeamNames(names)
      setTeamColors(colors)
    })()
  }, [])

  if (!season) return <p>Ingen säsong har startat än.</p>

  const cupByRound = new Map<number, Fixture[]>()
  for (const f of cupFixtures) {
    const r = f.cup_round ?? 0
    cupByRound.set(r, [...(cupByRound.get(r) ?? []), f])
  }

  return (
    <div>
      <header className="topbar">
        <h1>Säsong {season.number}</h1>
      </header>

      {blocks.map((block) => (
        <section className="card" key={block.division.id}>
          <h2>{block.division.name}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Lag</th>
                <th>S</th>
                <th>V</th>
                <th>O</th>
                <th>F</th>
                <th>GM</th>
                <th>IM</th>
                <th>P</th>
              </tr>
            </thead>
            <tbody>
              {block.standings.map((row) => (
                <tr key={row.teamId}>
                  <td>
                    <TeamBadge name={row.name} primaryColor={row.primaryColor} secondaryColor={row.secondaryColor} size={20} />
                    {row.name}
                  </td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.gf}</td>
                  <td>{row.ga}</td>
                  <td>
                    <strong>{row.points}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Matcher</summary>
            <ul className="list">
              {block.fixtures
                .sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0))
                .map((f) => (
                  <li key={f.id}>
                    Omg {f.matchday}:{' '}
                    <TeamBadge
                      name={teamNames[f.home_team_id] ?? '?'}
                      primaryColor={teamColors[f.home_team_id]?.primary}
                      secondaryColor={teamColors[f.home_team_id]?.secondary}
                      size={18}
                    />
                    {teamNames[f.home_team_id]} vs{' '}
                    <TeamBadge
                      name={teamNames[f.away_team_id ?? ''] ?? '?'}
                      primaryColor={teamColors[f.away_team_id ?? '']?.primary}
                      secondaryColor={teamColors[f.away_team_id ?? '']?.secondary}
                      size={18}
                    />
                    {teamNames[f.away_team_id ?? '']} —{' '}
                    {f.status === 'finished' ? (
                      <strong>
                        {f.home_score}-{f.away_score}
                      </strong>
                    ) : (
                      <Link to={`/match/${f.id}`}>
                        {f.status === 'live' ? `LIVE ${f.minute}'` : 'ej spelad'}
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        </section>
      ))}

      <section className="card">
        <h2>Cupen</h2>
        {Array.from(cupByRound.keys())
          .sort((a, b) => a - b)
          .map((round) => (
            <div key={round}>
              <h3>Omgång {round}</h3>
              <ul className="list">
                {cupByRound.get(round)!.map((f) => (
                  <li key={f.id}>
                    <TeamBadge
                      name={teamNames[f.home_team_id] ?? '?'}
                      primaryColor={teamColors[f.home_team_id]?.primary}
                      secondaryColor={teamColors[f.home_team_id]?.secondary}
                      size={18}
                    />
                    {teamNames[f.home_team_id]}
                    {f.away_team_id ? (
                      <>
                        {' vs '}
                        <TeamBadge
                          name={teamNames[f.away_team_id] ?? '?'}
                          primaryColor={teamColors[f.away_team_id]?.primary}
                          secondaryColor={teamColors[f.away_team_id]?.secondary}
                          size={18}
                        />
                        {teamNames[f.away_team_id]}
                      </>
                    ) : (
                      ' (frilott)'
                    )}{' '}
                    —{' '}
                    {f.status === 'finished' ? (
                      <strong>
                        {f.away_team_id ? `${f.home_score}-${f.away_score}` : 'vidare'}
                      </strong>
                    ) : (
                      <Link to={`/match/${f.id}`}>{f.status === 'live' ? `LIVE ${f.minute}'` : 'ej spelad'}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {cupFixtures.length === 0 && <p>Cupen är inte lottad än.</p>}
      </section>
    </div>
  )
}
