import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useMyTeam } from '../hooks/useMyTeam'
import { computeStandings } from '../lib/standings'
import TeamBadge from '../components/TeamBadge'
import type { Division, Fixture, Player, Team } from '../types'

export default function HomePage() {
  const { team } = useMyTeam()
  const [division, setDivision] = useState<Division | null>(null)
  const [nextFixture, setNextFixture] = useState<(Fixture & { opponentName: string }) | null>(null)
  const [standingRow, setStandingRow] = useState<{ position: number; points: number; played: number } | null>(
    null
  )
  const [starters, setStarters] = useState<Player[]>([])

  useEffect(() => {
    if (!team) return
    ;(async () => {
      // Nästa match (liga eller cup)
      const { data: upcoming } = await supabase
        .from('fixtures')
        .select('*')
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .neq('status', 'finished')
        .order('kickoff_at', { ascending: true })
        .limit(1)

      if (upcoming && upcoming[0]) {
        const fx = upcoming[0] as Fixture
        const opponentId = fx.home_team_id === team.id ? fx.away_team_id : fx.home_team_id
        if (opponentId) {
          const { data: opp } = await supabase.from('teams').select('name').eq('id', opponentId).single()
          setNextFixture({ ...fx, opponentName: opp?.name ?? '?' })
        }
      } else {
        setNextFixture(null)
      }

      // Tabellplacering
      if (team.division_id) {
        const { data: div } = await supabase.from('divisions').select('*').eq('id', team.division_id).single()
        setDivision(div as Division)
        const [{ data: divTeams }, { data: divFixtures }] = await Promise.all([
          supabase.from('teams').select('id,name').eq('division_id', team.division_id),
          supabase
            .from('fixtures')
            .select('*')
            .eq('division_id', team.division_id)
            .eq('competition', 'league'),
        ])
        const standings = computeStandings((divTeams as Team[]) ?? [], (divFixtures as Fixture[]) ?? [])
        const idx = standings.findIndex((r) => r.teamId === team.id)
        if (idx !== -1) {
          setStandingRow({ position: idx + 1, points: standings[idx].points, played: standings[idx].played })
        }
      }

      // Uttagen elva
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', team.id)
        .eq('is_starting', true)
      setStarters((players as Player[]) ?? [])
    })()
  }, [team])

  if (!team) return <p>Laddar…</p>

  return (
    <div>
      <header className="topbar">
        <h1>
          <TeamBadge name={team.name} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
          {team.name}
        </h1>
      </header>

      <section className="card">
        <h2>Nästa match</h2>
        {nextFixture ? (
          <p>
            {nextFixture.competition === 'cup' ? `Cup, omgång ${nextFixture.cup_round}` : `Serien, omgång ${nextFixture.matchday}`}{' '}
            vs <strong>{nextFixture.opponentName}</strong> —{' '}
            {new Date(nextFixture.kickoff_at).toLocaleString('sv-SE', { timeZone: 'UTC' })} (GMT)
            {' — '}
            <Link to={`/match/${nextFixture.id}`}>till matchen</Link>
          </p>
        ) : (
          <p>Ingen match inbokad just nu.</p>
        )}
      </section>

      <section className="card">
        <h2>Tabellen</h2>
        {division && standingRow ? (
          <p>
            {division.name}: <strong>{standingRow.position}:a plats</strong>, {standingRow.points} poäng på{' '}
            {standingRow.played} matcher. <Link to="/league">Visa hela tabellen</Link>
          </p>
        ) : (
          <p>Du är inte placerad i någon division ännu — väntar på att admin startar säsongen.</p>
        )}
      </section>

      <section className="card">
        <h2>Uttagen elva</h2>
        <p>
          {starters.length}/11 valda, formation {team.formation}.{' '}
          <Link to={`/team/${team.id}`}>Ändra laguppställning</Link>
        </p>
      </section>

      <section className="card">
        <h2>Ekonomi</h2>
        <p>
          {team.budget.toLocaleString('sv-SE')} kr i kassan. Arena nivå {team.arena_level}, akademi nivå{' '}
          {team.academy_level}. <Link to="/economy">Till ekonomisidan</Link>
        </p>
      </section>
    </div>
  )
}
