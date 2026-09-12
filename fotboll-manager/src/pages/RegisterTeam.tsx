import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useMyTeam } from '../hooks/useMyTeam'
import { generateSquad } from '../lib/generateSquad'

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
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ owner_id: user.id, name: teamName.trim() })
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
