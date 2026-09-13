import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import TeamBadge from '../components/TeamBadge'
import type { Player, Team } from '../types'

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-5-1']

export default function TeamManager() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!teamId) return
    const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single()
    setTeam(teamData as Team)
    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('position')
    setPlayers((playersData as Player[]) ?? [])
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  if (!team) return <p>Laddar lag…</p>

  const isOwner = user?.id === team.owner_id

  if (!isOwner) {
    return (
      <div>
        <header className="topbar">
          <h1>
            <TeamBadge name={team.name} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
            {team.name}
          </h1>
        </header>
        <section className="card">
          <h2>Trupp</h2>
          <p>Laguppställningen är dold för andra — bara truppen visas.</p>
          <StatsTable players={players} />
        </section>
      </div>
    )
  }

  const starters = players.filter((p) => p.is_starting)
  const bench = players.filter((p) => !p.is_starting)

  async function toggleStarting(player: Player) {
    if (!player.is_starting && starters.length >= 11) {
      setError('Du har redan 11 spelare på plan — ta av någon först.')
      return
    }
    setError(null)
    const { error } = await supabase
      .from('players')
      .update({ is_starting: !player.is_starting })
      .eq('id', player.id)
    if (error) setError(error.message)
    else refresh()
  }

  async function changeFormation(formation: string) {
    if (!team) return
    const { error } = await supabase.from('teams').update({ formation }).eq('id', team.id)
    if (error) setError(error.message)
    else refresh()
  }

  async function changeColors(primary_color: string, secondary_color: string) {
    if (!team) return
    const { error } = await supabase.from('teams').update({ primary_color, secondary_color }).eq('id', team.id)
    if (error) setError(error.message)
    else refresh()
  }

  async function releasePlayer(player: Player) {
    if (!window.confirm(`Släpp ${player.name} till marknaden som fri agent?`)) return
    const { error } = await supabase.rpc('release_player', { p_player_id: player.id })
    if (error) setError(error.message)
    else refresh()
  }

  return (
    <div>
      <header className="topbar">
        <h1>
          <TeamBadge name={team.name} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
          {team.name}
        </h1>
      </header>

      <section className="card">
        <h2>Klubbfärger</h2>
        <p>Syns på lagets märke överallt i spelet (tabellen, matcher, startsidan).</p>
        <label style={{ marginRight: '1rem' }}>
          Huvudfärg{' '}
          <input
            type="color"
            value={team.primary_color}
            onChange={(e) => changeColors(e.target.value, team.secondary_color)}
          />
        </label>
        <label>
          Detaljfärg{' '}
          <input
            type="color"
            value={team.secondary_color}
            onChange={(e) => changeColors(team.primary_color, e.target.value)}
          />
        </label>
      </section>

      <section className="card">
        <h2>Formation</h2>
        <select value={team.formation} onChange={(e) => changeFormation(e.target.value)}>
          {FORMATIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2>Startelva ({starters.length}/11)</h2>
        <PlayerTable players={starters} onToggle={toggleStarting} actionLabel="Ta av" />
      </section>

      <section className="card">
        <h2>Bänk</h2>
        <PlayerTable players={bench} onToggle={toggleStarting} actionLabel="Sätt in" onRelease={releasePlayer} />
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

function PlayerTable({
  players,
  onToggle,
  actionLabel,
  onRelease,
}: {
  players: Player[]
  onToggle: (p: Player) => void
  actionLabel: string
  onRelease?: (p: Player) => void
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Namn</th>
          <th>Position</th>
          <th>Ålder</th>
          <th>Rating</th>
          <th>Stamina</th>
          <th>Mål</th>
          <th>Matcher</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{p.position}</td>
            <td>{p.age}</td>
            <td>{p.rating}</td>
            <td>{Math.round(p.stamina)}%</td>
            <td>{p.goals}</td>
            <td>{p.appearances}</td>
            <td>
              <button onClick={() => onToggle(p)}>{actionLabel}</button>
              {onRelease && (
                <button onClick={() => onRelease(p)} style={{ marginLeft: '0.4rem' }}>
                  Släpp
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatsTable({ players }: { players: Player[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Namn</th>
          <th>Position</th>
          <th>Ålder</th>
          <th>Rating</th>
          <th>Mål</th>
          <th>Matcher</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{p.position}</td>
            <td>{p.age}</td>
            <td>{p.rating}</td>
            <td>{p.goals}</td>
            <td>{p.appearances}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
