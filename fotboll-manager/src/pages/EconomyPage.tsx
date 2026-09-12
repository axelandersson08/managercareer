import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useMyTeam } from '../hooks/useMyTeam'
import type { FinanceTransaction } from '../types'

export default function EconomyPage() {
  const { team, refresh } = useMyTeam()
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadTransactions() {
    if (!team) return
    const { data } = await supabase
      .from('finance_transactions')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setTransactions((data as FinanceTransaction[]) ?? [])
  }

  useEffect(() => {
    loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id])

  async function upgradeArena() {
    if (!team) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('upgrade_arena', { p_team_id: team.id })
    setBusy(false)
    if (error) setError(error.message)
    else {
      refresh()
      loadTransactions()
    }
  }

  async function upgradeAcademy() {
    if (!team) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('upgrade_academy', { p_team_id: team.id })
    setBusy(false)
    if (error) setError(error.message)
    else {
      refresh()
      loadTransactions()
    }
  }

  if (!team) return <p>Laddar…</p>

  const arenaCost = team.arena_level * 2000000
  const academyCost = team.academy_level * 1500000

  return (
    <div>
      <header className="topbar">
        <h1>Ekonomi</h1>
        <span>{team.budget.toLocaleString('sv-SE')} kr</span>
      </header>

      <section className="card">
        <h2>Arena — nivå {team.arena_level}</h2>
        <p>Högre arenanivå ger mer i matchdagsintäkter efter varje ligamatch.</p>
        <button disabled={busy || team.budget < arenaCost} onClick={upgradeArena}>
          Uppgradera till nivå {team.arena_level + 1} ({arenaCost.toLocaleString('sv-SE')} kr)
        </button>
      </section>

      <section className="card">
        <h2>Akademi — nivå {team.academy_level}</h2>
        <p>Varje uppgradering kostar pengar men ger direkt en ny ung spelare till truppen.</p>
        <button disabled={busy || team.budget < academyCost} onClick={upgradeAcademy}>
          Uppgradera till nivå {team.academy_level + 1} ({academyCost.toLocaleString('sv-SE')} kr)
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Pengaflöde</h2>
        <ul className="list">
          {transactions.map((t) => (
            <li key={t.id}>
              {new Date(t.created_at).toLocaleDateString('sv-SE')} — {t.reason}:{' '}
              <strong style={{ color: t.amount >= 0 ? '#3fd67a' : '#ff6b6b' }}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString('sv-SE')} kr
              </strong>
            </li>
          ))}
          {transactions.length === 0 && <li>Inga transaktioner än.</li>}
        </ul>
      </section>
    </div>
  )
}
