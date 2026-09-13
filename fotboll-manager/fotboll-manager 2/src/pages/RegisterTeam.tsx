import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useMyTeam } from '../hooks/useMyTeam'
import { generateSquad } from '../lib/generateSquad'

// Slumpade dräktfärgspar så nya lag inte alla blir likadant blåa —
// coachen kan sen ändra dem själv på lagsidan.
const COLOR_PRESETS: [string, string][] = [
  ['#1d4ed8', '#ffffff'],
  ['#dc2626', '#facc15'],
  ['#15803d', '#ffffff'],
  ['#0f172a', '#38bdf8'],
  ['#7c2d12', '#fbbf24'],
  ['#4c1d95', '#f5f3ff'],
  ['#164e63', '#f97316'],
  ['#831843', '#fce7f3'],
]

export default function RegisterTeam() {
  const { user, profile } = useAuth()
  const { refresh } = useMyTeam()
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createTeam(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    const [primary_color, secondary_color] = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ owner_id: user.id, name: teamName.trim(), primary_color, secondary_color })
      .select()
      .single()
    if (teamError) {
      setError(teamError.message)
      setBusy(false)
      return
    }
    const squad = generateSquad().map((p) => ({ ...p, team_id: team.id }))
    const { error: playersError } = await supabase.from('players').insert(squad)
    setBusy(false)
    if (playersError) setError(playersError.message)
    else refresh()
  }

  return (
    <div className="card">
      <h1>Välkommen, {profile?.username}!</h1>
      <p>
        Skapa din klubb för att gå med i nästa säsong. Du får en trupp på 18 spelare direkt, och när
        admin startar säsongen placeras du in i en division.
      </p>
      <form onSubmit={createTeam}>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Klubbnamn"
          required
          minLength={2}
        />
        <button disabled={busy} type="submit">
          Skapa klubb
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
