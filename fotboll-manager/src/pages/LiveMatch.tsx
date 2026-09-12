import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Fixture, MatchEvent, Player, Team } from '../types'

/**
 * Ren visnings- och kontrollsida. Själva matchsimuleringen sker inte här
 * längre — den körs av supabase/functions/tick-matches på schema (kl
 * 15:00/18:00 GMT, oavsett om någon tittar). Den här sidan bara:
 *  - läser in matchhändelser hittills och prenumererar på nya (realtime)
 *  - låter LAGETS EGEN ägare skicka in byten/taktikändringar under matchen,
 *    som tick-matches sedan applicerar på nästa tick
 * Alla kan titta på alla matcher, men bara på sitt eget lag kan man styra.
 */
export default function LiveMatch() {
  const { fixtureId } = useParams()
  const { user } = useAuth()

  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [homeTeam, setHomeTeam] = useState<Team | null>(null)
  const [awayTeam, setAwayTeam] = useState<Team | null>(null)
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [myPlayers, setMyPlayers] = useState<Player[]>([])
  const [subOut, setSubOut] = useState('')
  const [subIn, setSubIn] = useState('')

  useEffect(() => {
    if (!fixtureId) return
    ;(async () => {
      const { data: fx } = await supabase.from('fixtures').select('*').eq('id', fixtureId).single()
      setFixture(fx as Fixture)
      const { data: home } = await supabase.from('teams').select('*').eq('id', fx.home_team_id).single()
      setHomeTeam(home as Team)
      if (fx.away_team_id) {
        const { data: away } = await supabase.from('teams').select('*').eq('id', fx.away_team_id).single()
        setAwayTeam(away as Team)
      }
      const { data: evs } = await supabase
        .from('match_events')
        .select('*')
        .eq('fixture_id', fixtureId)
        .order('minute', { ascending: true })
      setEvents((evs as MatchEvent[]) ?? [])
    })()
  }, [fixtureId])

  useEffect(() => {
    if (!user || !homeTeam) return
    const myTeamId =
      homeTeam.owner_id === user.id ? homeTeam.id : awayTeam?.owner_id === user.id ? awayTeam.id : null
    if (!myTeamId) return
    supabase
      .from('players')
      .select('*')
      .eq('team_id', myTeamId)
      .then(({ data }) => setMyPlayers((data as Player[]) ?? []))
  }, [user, homeTeam, awayTeam])

  useEffect(() => {
    if (!fixtureId) return
    const channel = supabase
      .channel(`fixture-${fixtureId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_events', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => setEvents((prev) => [...prev, payload.new as MatchEvent])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `id=eq.${fixtureId}` },
        (payload) => setFixture(payload.new as Fixture)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fixtureId])

  async function sendSubstitution() {
    if (!fixture || !user || !subOut || !subIn) return
    const myTeamId =
      homeTeam?.owner_id === user.id ? homeTeam.id : awayTeam?.owner_id === user.id ? awayTeam.id : null
    if (!myTeamId) return
    await supabase.from('match_actions').insert({
      fixture_id: fixture.id,
      team_id: myTeamId,
      type: 'substitution',
      payload: { playerOutId: subOut, playerInId: subIn },
      minute: fixture.minute,
    })
    setSubOut('')
    setSubIn('')
  }

  if (!fixture || !homeTeam) return <p>Laddar match…</p>

  if (!fixture.away_team_id) {
    return (
      <div className="card">
        <h1>{homeTeam.name} går vidare på frilott</h1>
        <p>Ingen match att visa — laget avancerar direkt till nästa cupomgång.</p>
        <Link to="/">Till startsidan</Link>
      </div>
    )
  }

  if (!awayTeam) return <p>Laddar match…</p>

  const myTeamId = user && (homeTeam.owner_id === user.id ? homeTeam.id : awayTeam.owner_id === user.id ? awayTeam.id : null)
  const myStarters = myPlayers.filter((p) => p.is_starting)
  const myBench = myPlayers.filter((p) => !p.is_starting)
  const label =
    fixture.competition === 'cup' ? `Cup, omgång ${fixture.cup_round}` : `Serien, omgång ${fixture.matchday}`

  return (
    <div>
      <header className="topbar">
        <h1>
          {homeTeam.name} {fixture.home_score} - {fixture.away_score} {awayTeam.name}
        </h1>
        <span>
          {label} —{' '}
          {fixture.status === 'live'
            ? `${fixture.minute}'`
            : fixture.status === 'finished'
              ? 'Slut'
              : `Avspark ${new Date(fixture.kickoff_at).toLocaleString('sv-SE', { timeZone: 'UTC' })} (GMT)`}
        </span>
      </header>

      {myTeamId && fixture.status === 'live' && (
        <section className="card">
          <h2>Gör ett byte</h2>
          <p>Skickas in direkt och genomförs vid nästa tick i matchmotorn (inom några sekunder).</p>
          <select value={subOut} onChange={(e) => setSubOut(e.target.value)}>
            <option value="">Ut…</option>
            {myStarters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={subIn} onChange={(e) => setSubIn(e.target.value)}>
            <option value="">In…</option>
            {myBench.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button disabled={!subOut || !subIn} onClick={sendSubstitution}>
            Byt
          </button>
        </section>
      )}

      <section className="card">
        <h2>Matchhändelser</h2>
        <ul className="events">
          {events.map((e) => (
            <li key={e.id}>
              <strong>{e.minute}'</strong> {e.description}
            </li>
          ))}
          {events.length === 0 && <li>Matchen har inte börjat än.</li>}
        </ul>
      </section>
    </div>
  )
}
