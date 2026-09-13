import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useMyTeam } from '../hooks/useMyTeam'
import type { Player, Position, Team, TransferBid, TransferListing } from '../types'

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD']

export default function MarketPage() {
  const { team, refresh: refreshTeam } = useMyTeam()
  const [freeAgents, setFreeAgents] = useState<Player[]>([])
  const [myPlayers, setMyPlayers] = useState<Player[]>([])
  const [listings, setListings] = useState<TransferListing[]>([])
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [myBids, setMyBids] = useState<Record<string, number>>({}) // listingId -> bidAmount input
  const [agentBids, setAgentBids] = useState<Record<string, number>>({}) // playerId -> bidAmount input
  const [incomingBids, setIncomingBids] = useState<TransferBid[]>([])
  const [inflation, setInflation] = useState(1)

  const [filterPos, setFilterPos] = useState<Position | ''>('')
  const [minRating, setMinRating] = useState(0)
  const [maxPrice, setMaxPrice] = useState(50000000)

  const [listPlayerId, setListPlayerId] = useState('')
  const [listPrice, setListPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    const [{ data: agents }, { data: openListings }, { data: allTeams }] = await Promise.all([
      supabase.from('players').select('*').is('team_id', null).order('rating', { ascending: false }),
      supabase.from('transfer_listings').select('*').eq('status', 'open'),
      supabase.from('teams').select('id,name,budget'),
    ])
    setFreeAgents((agents as Player[]) ?? [])
    setListings((openListings as TransferListing[]) ?? [])

    const names: Record<string, string> = {}
    for (const t of (allTeams as Team[]) ?? []) names[t.id] = t.name
    setTeamNames(names)

    const teamsWithBudget = (allTeams as Team[]) ?? []
    const avgBudget = teamsWithBudget.length
      ? teamsWithBudget.reduce((sum, t) => sum + t.budget, 0) / teamsWithBudget.length
      : 5000000
    setInflation(Math.max(1, avgBudget / 5000000))

    const playerIds = ((openListings as TransferListing[]) ?? []).map((l) => l.player_id)
    if (playerIds.length > 0) {
      const { data: listedPlayers } = await supabase.from('players').select('*').in('id', playerIds)
      const map: Record<string, Player> = {}
      for (const p of (listedPlayers as Player[]) ?? []) map[p.id] = p
      setPlayers(map)
    }

    if (team) {
      const { data: mine } = await supabase.from('players').select('*').eq('team_id', team.id)
      setMyPlayers((mine as Player[]) ?? [])

      const myListingIds = ((openListings as TransferListing[]) ?? [])
        .filter((l) => l.seller_team_id === team.id)
        .map((l) => l.id)
      if (myListingIds.length > 0) {
        const { data: bids } = await supabase
          .from('transfer_bids')
          .select('*')
          .in('listing_id', myListingIds)
          .eq('status', 'pending')
        setIncomingBids((bids as TransferBid[]) ?? [])
      } else {
        setIncomingBids([])
      }
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id])

  async function buyFreeAgentNow(playerId: string) {
    if (!team) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('buy_free_agent_now', { p_player_id: playerId, p_team_id: team.id })
    setBusy(false)
    if (error) setError(error.message)
    else {
      refreshTeam()
      loadAll()
    }
  }

  async function bidOnFreeAgent(playerId: string) {
    if (!team) return
    const amount = agentBids[playerId]
    if (!amount) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('bid_on_free_agent', {
      p_player_id: playerId,
      p_team_id: team.id,
      p_amount: amount,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      refreshTeam()
      loadAll()
    }
  }

  async function createListing(e: React.FormEvent) {
    e.preventDefault()
    if (!team || !listPlayerId || !listPrice) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('transfer_listings').insert({
      player_id: listPlayerId,
      seller_team_id: team.id,
      asking_price: Number(listPrice),
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setListPlayerId('')
      setListPrice('')
      loadAll()
    }
  }

  async function withdrawListing(listingId: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('transfer_listings').update({ status: 'withdrawn' }).eq('id', listingId)
    setBusy(false)
    if (error) setError(error.message)
    else loadAll()
  }

  async function placeBid(listingId: string) {
    if (!team) return
    const amount = myBids[listingId]
    if (!amount) return
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('transfer_bids')
      .insert({ listing_id: listingId, bidder_team_id: team.id, amount })
    setBusy(false)
    if (error) setError(error.message)
    else loadAll()
  }

  async function acceptBid(bidId: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('accept_transfer_bid', { p_bid_id: bidId })
    setBusy(false)
    if (error) setError(error.message)
    else {
      refreshTeam()
      loadAll()
    }
  }

  if (!team) return <p>Laddar…</p>

  const filteredAgents = freeAgents.filter(
    (p) =>
      (filterPos === '' || p.position === filterPos) &&
      p.rating >= minRating &&
      Math.round(p.rating * 30000 * inflation) <= maxPrice
  )
  const othersListings = listings.filter((l) => l.seller_team_id !== team.id)
  const myListings = listings.filter((l) => l.seller_team_id === team.id)

  return (
    <div>
      <header className="topbar">
        <h1>Marknad</h1>
        <span>{team.budget.toLocaleString('sv-SE')} kr att spendera</span>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Scouta fria agenter</h2>
        <form style={{ marginBottom: '0.75rem' }}>
          <select value={filterPos} onChange={(e) => setFilterPos(e.target.value as Position | '')}>
            <option value="">Alla positioner</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label>
            Min rating:{' '}
            <input
              type="number"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              style={{ width: '4rem' }}
            />
          </label>
          <label>
            Max pris:{' '}
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              style={{ width: '7rem' }}
            />
          </label>
        </form>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Priserna stiger med hur mycket pengar som finns i spelet totalt — går inte att pruta hur lågt som
          helst. Köp nu ger garanterat spelaren direkt; ett bud går igenom direkt om det når lägstanivån och
          ingen redan hunnit före.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Pos</th>
              <th>Ålder</th>
              <th>Rating</th>
              <th>Köp nu</th>
              <th>Lägsta bud</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredAgents.map((p) => {
              const buyNow = Math.round(p.rating * 30000 * inflation)
              const minBid = Math.round(p.rating * 18000 * inflation)
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.age}</td>
                  <td>{p.rating}</td>
                  <td>{buyNow.toLocaleString('sv-SE')} kr</td>
                  <td>{minBid.toLocaleString('sv-SE')} kr</td>
                  <td>
                    <button disabled={busy || team.budget < buyNow} onClick={() => buyFreeAgentNow(p.id)}>
                      Köp nu
                    </button>
                    <input
                      type="number"
                      placeholder={`min ${minBid}`}
                      style={{ width: '6rem', marginLeft: '0.4rem' }}
                      value={agentBids[p.id] ?? ''}
                      onChange={(e) => setAgentBids((b) => ({ ...b, [p.id]: Number(e.target.value) }))}
                    />
                    <button
                      disabled={busy || !agentBids[p.id] || agentBids[p.id] < minBid}
                      onClick={() => bidOnFreeAgent(p.id)}
                    >
                      Buda
                    </button>
                  </td>
                </tr>
              )
            })}
            {filteredAgents.length === 0 && (
              <tr>
                <td colSpan={7}>Inga fria agenter matchar filtret.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Listade spelare från andra lag</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Pos</th>
              <th>Rating</th>
              <th>Säljare</th>
              <th>Utrop</th>
              <th>Ditt bud</th>
            </tr>
          </thead>
          <tbody>
            {othersListings.map((l) => {
              const p = players[l.player_id]
              return (
                <tr key={l.id}>
                  <td>{p?.name ?? '…'}</td>
                  <td>{p?.position}</td>
                  <td>{p?.rating}</td>
                  <td>{teamNames[l.seller_team_id]}</td>
                  <td>{l.asking_price.toLocaleString('sv-SE')} kr</td>
                  <td>
                    <input
                      type="number"
                      placeholder="Bud"
                      style={{ width: '6rem' }}
                      value={myBids[l.id] ?? ''}
                      onChange={(e) => setMyBids((b) => ({ ...b, [l.id]: Number(e.target.value) }))}
                    />
                    <button disabled={busy} onClick={() => placeBid(l.id)}>
                      Buda
                    </button>
                  </td>
                </tr>
              )
            })}
            {othersListings.length === 0 && (
              <tr>
                <td colSpan={6}>Inga spelare listade av andra lag just nu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Lista en egen spelare</h2>
        <form onSubmit={createListing}>
          <select value={listPlayerId} onChange={(e) => setListPlayerId(e.target.value)} required>
            <option value="">Välj spelare…</option>
            {myPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.position}, {p.rating})
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Utropspris"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            required
          />
          <button disabled={busy} type="submit">
            Lista till försäljning
          </button>
        </form>

        {myListings.length > 0 && (
          <>
            <h3>Dina listningar</h3>
            <ul className="list">
              {myListings.map((l) => (
                <li key={l.id}>
                  {players[l.player_id]?.name ?? l.player_id} — utrop {l.asking_price.toLocaleString('sv-SE')} kr{' '}
                  <button disabled={busy} onClick={() => withdrawListing(l.id)}>
                    Dra tillbaka
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {incomingBids.length > 0 && (
          <>
            <h3>Bud på dina spelare</h3>
            <ul className="list">
              {incomingBids.map((b) => (
                <li key={b.id}>
                  {teamNames[b.bidder_team_id]} bjuder {b.amount.toLocaleString('sv-SE')} kr{' '}
                  <button disabled={busy} onClick={() => acceptBid(b.id)}>
                    Acceptera
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
