import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { checkAndAdvanceCupRound } from '../lib/cupProgress'
import {
  buildCupRound1,
  buildLeagueFixturesForDivision,
  planTierAssignments,
  type PreviousDivisionStandings,
} from '../lib/seasonEngine'
import { computeStandings } from '../lib/standings'
import { generateFreeAgentPool } from '../lib/generateSquad'
import type { Division, Fixture, Season, Team } from '../types'

export default function AdminPage() {
  const { profile } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [pendingTeams, setPendingTeams] = useState<Team[]>([])
  const [divisionSize, setDivisionSize] = useState(20)
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const { data: seasonData } = await supabase
      .from('seasons')
      .select('*')
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSeason(seasonData as Season | null)

    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .is('division_id', null)
      .order('created_at', { ascending: true })
    setPendingTeams((teamsData as Team[]) ?? [])
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!profile?.is_admin) {
    return (
      <div className="card">
        <p>Den här sidan är bara för admin.</p>
      </div>
    )
  }

  async function createSeason() {
    setBusy(true)
    setError(null)
    const nextNumber = (season?.number ?? 0) + 1
    const { error } = await supabase
      .from('seasons')
      .insert({ number: nextNumber, status: 'registration', division_size: divisionSize })
    setBusy(false)
    if (error) setError(error.message)
    else refresh()
  }

  async function startSeason() {
    if (!season) return
    setBusy(true)
    setError(null)
    setLog([])
    const addLog = (msg: string) => setLog((l) => [...l, msg])

    try {
      const start = new Date(startDate + 'T00:00:00Z')
      const newTeamIds = pendingTeams.map((t) => t.id)

      addLog('Kollar om det finns en tidigare säsong att utgå ifrån…')
      const { data: previousSeason } = await supabase
        .from('seasons')
        .select('*')
        .eq('number', season.number - 1)
        .maybeSingle()

      const previousStandings: PreviousDivisionStandings[] = []
      if (previousSeason) {
        const { data: prevDivisions } = await supabase
          .from('divisions')
          .select('*')
          .eq('season_id', previousSeason.id)
          .order('tier', { ascending: true })
        for (const div of (prevDivisions as Division[]) ?? []) {
          const [{ data: divTeams }, { data: divFixtures }] = await Promise.all([
            supabase.from('teams').select('id,name').eq('division_id', div.id),
            supabase.from('fixtures').select('*').eq('division_id', div.id).eq('competition', 'league'),
          ])
          const standings = computeStandings((divTeams as Team[]) ?? [], (divFixtures as Fixture[]) ?? [])
          previousStandings.push({ tier: div.tier, teamIdsBestFirst: standings.map((s) => s.teamId) })
        }
        addLog(
          `Utgår från säsong ${previousSeason.number}: tre sämsta i varje division ner, tre bästa i divisionen under upp.`
        )
      } else {
        addLog('Ingen tidigare säsong — fyller divisionerna i anmälningsordning.')
      }

      const tierByTeam = planTierAssignments(previousStandings, newTeamIds, season.division_size)
      if (tierByTeam.size < 2) {
        throw new Error('Minst två lag totalt (nya + återvändande) krävs för att starta säsongen.')
      }
      const assignments = Array.from(tierByTeam.entries()).map(([teamId, tier]) => ({ teamId, tier }))
      const tiers = Array.from(new Set(assignments.map((a) => a.tier))).sort((a, b) => a - b)
      addLog('Delar in lag i divisioner…')

      const divisionIdByTier = new Map<number, string>()
      for (const tier of tiers) {
        const { data: div, error: divError } = await supabase
          .from('divisions')
          .insert({ season_id: season.id, tier, name: `Division ${tier}` })
          .select()
          .single()
        if (divError) throw new Error(divError.message)
        divisionIdByTier.set(tier, div.id)
      }
      addLog(`${tiers.length} division(er) skapade.`)

      addLog('Sätter lagens division…')
      for (const a of assignments) {
        const { error: teamError } = await supabase
          .from('teams')
          .update({ division_id: divisionIdByTier.get(a.tier) })
          .eq('id', a.teamId)
        if (teamError) throw new Error(teamError.message)
      }

      addLog('Lottar ligaspelschema…')
      for (const tier of tiers) {
        const teamsInTier = assignments.filter((a) => a.tier === tier).map((a) => a.teamId)
        const drafts = buildLeagueFixturesForDivision(tier, teamsInTier, start)
        const rows = drafts.map((d) => ({
          season_id: season.id,
          competition: 'league',
          division_id: divisionIdByTier.get(tier),
          matchday: d.matchday,
          home_team_id: d.homeTeamId,
          away_team_id: d.awayTeamId,
          kickoff_at: d.kickoffAt,
        }))
        // Supabase har en gräns på antal rader per insert — dela upp i klumpar.
        for (let i = 0; i < rows.length; i += 200) {
          const { error: fxError } = await supabase.from('fixtures').insert(rows.slice(i, i + 200))
          if (fxError) throw new Error(fxError.message)
        }
      }
      addLog('Ligaspelschema klart.')

      addLog('Lottar cupen…')
      const allTeamIds = Array.from(tierByTeam.keys())
      const cup = buildCupRound1(allTeamIds, start)
      if (cup.byeTeamIds.length > 0) {
        const byeRows = cup.byeTeamIds.map((teamId) => ({
          season_id: season.id,
          competition: 'cup',
          cup_round: 1,
          home_team_id: teamId,
          away_team_id: null,
          kickoff_at: cup.kickoffAt,
          status: 'finished',
        }))
        const { data: inserted, error: byeError } = await supabase.from('fixtures').insert(byeRows).select()
        if (byeError) throw new Error(byeError.message)
        for (const fx of inserted ?? []) {
          await supabase.from('match_events').insert({
            fixture_id: fx.id,
            minute: 0,
            type: 'bye',
            team_id: fx.home_team_id,
            description: 'Frilott till nästa omgång.',
          })
        }
      }
      if (cup.matches.length > 0) {
        const matchRows = cup.matches.map((m) => ({
          season_id: season.id,
          competition: 'cup',
          cup_round: 1,
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          kickoff_at: cup.kickoffAt,
        }))
        const { error: cupError } = await supabase.from('fixtures').insert(matchRows)
        if (cupError) throw new Error(cupError.message)
      }
      addLog('Cupen lottad.')

      const { count: existingAgents } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .is('team_id', null)
      if ((existingAgents ?? 0) === 0) {
        addLog('Fyller på marknaden med fria agenter…')
        const pool = generateFreeAgentPool(24)
        const { error: agentsError } = await supabase.from('players').insert(pool)
        if (agentsError) throw new Error(agentsError.message)
      }

      const { error: seasonError } = await supabase
        .from('seasons')
        .update({ status: 'active', start_date: startDate })
        .eq('id', season.id)
      if (seasonError) throw new Error(seasonError.message)

      addLog('Säsongen är igång!')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function finishSeason() {
    if (!season) return
    if (!window.confirm('Avsluta säsongen? Det går inte att lotta fler matcher i den efteråt.')) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('seasons').update({ status: 'finished' }).eq('id', season.id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setLog((l) => [...l, 'Säsongen avslutad. Du kan nu skapa nästa säsong.'])
      refresh()
    }
  }

  async function checkCupRounds() {
    if (!season) return
    setBusy(true)
    setError(null)
    const { data: rounds } = await supabase
      .from('fixtures')
      .select('cup_round')
      .eq('season_id', season.id)
      .eq('competition', 'cup')
    const highest = Math.max(0, ...((rounds ?? []).map((r) => r.cup_round ?? 0)))
    for (let round = 1; round <= highest; round++) {
      await checkAndAdvanceCupRound(season.id, round)
    }
    setBusy(false)
    setLog((l) => [...l, 'Cupomgångarna kontrollerade.'])
  }

  return (
    <div>
      <header className="topbar">
        <h1>Admin</h1>
      </header>

      <section className="card">
        <h2>Säsong</h2>
        {!season || season.status === 'finished' ? (
          <>
            <p>Ingen säsong pågår just nu.</p>
            <label>
              Lag per division:{' '}
              <input
                type="number"
                min={2}
                value={divisionSize}
                onChange={(e) => setDivisionSize(Number(e.target.value))}
                style={{ width: '5rem' }}
              />
            </label>
            <button disabled={busy} onClick={createSeason}>
              Skapa säsong {(season?.number ?? 0) + 1} (anmälan öppnas)
            </button>
          </>
        ) : season.status === 'registration' ? (
          <>
            <p>
              Säsong {season.number} — anmälan öppen. {pendingTeams.length} nya lag anmälda.{' '}
              {season.number === 1
                ? `Fyller högsta divisionen först, ${season.division_size} lag åt gången.`
                : 'Nya lag läggs längst ner i pyramiden. Tre sämsta i varje division flyttas ner, tre bästa i divisionen under flyttas upp, baserat på förra säsongens tabeller.'}
            </p>
            <ul className="list">
              {pendingTeams.map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
            </ul>
            <label>
              Startdatum:{' '}
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <button disabled={busy} onClick={startSeason}>
              Starta säsongen
            </button>
          </>
        ) : (
          <>
            <p>
              Säsong {season.number} pågår (start {season.start_date}).
            </p>
            <button disabled={busy} onClick={checkCupRounds}>
              Kontrollera cupomgångar
            </button>
            <button disabled={busy} onClick={finishSeason} style={{ marginLeft: '0.5rem' }}>
              Avsluta säsongen
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {log.length > 0 && (
          <ul className="list">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
