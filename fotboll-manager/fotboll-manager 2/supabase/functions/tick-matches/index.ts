// Fotbollsmanager Online — server-driven matchmotor.
//
// Anropas periodiskt av pg_cron (se README och ../../cron-setup.sql). Detta
// är den ENDA plats där matcher faktiskt simuleras och skrivs till
// databasen — klienterna (LiveMatch.tsx) bara läser och visar. Det är det
// som gör att matcher går av kl 15:00/18:00 GMT oavsett om någon tittar, och
// att man kan gå in och se var matchen ligger när man vill.
//
// Tempo: en match (90 simulerade minuter) tar 5 minuter realtid, dvs
// SECONDS_PER_MATCH / 90 sekunder per simulerad minut.
//
// Deploy: `supabase functions deploy tick-matches`
// (SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY finns redan som miljövariabler
// i Edge Function-runtimen, inget extra att sätta för just dem.)

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECONDS_PER_MATCH = 5 * 60
const SECONDS_PER_SIM_MINUTE = SECONDS_PER_MATCH / 90

// ---------- Ren matchmotor (medvetet duplicerad från src/engine/matchEngine.ts — se
// den filens kommentar om varför: Edge Functions paketeras isolerat per mapp) ----------

type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

interface EnginePlayer {
  id: string
  name: string
  position: Position
  rating: number
  stamina: number
}

interface TeamSnapshot {
  teamId: string
  name: string
  arenaLevel: number
  starters: EnginePlayer[]
  bench: EnginePlayer[]
}

interface MatchState {
  minute: number
  homeScore: number
  awayScore: number
  home: TeamSnapshot
  away: TeamSnapshot
  finished: boolean
}

interface SimEvent {
  minute: number
  type: string
  teamId: string | null
  description: string
  playerId?: string
}

const POSITION_WEIGHT: Record<Position, number> = { GK: 0.5, DEF: 0.9, MID: 1.1, FWD: 1.2 }

function teamStrength(team: TeamSnapshot): number {
  if (team.starters.length === 0) return 0
  const sum = team.starters.reduce((acc, p) => {
    const staminaFactor = 0.5 + (p.stamina / 100) * 0.5
    return acc + p.rating * POSITION_WEIGHT[p.position] * staminaFactor
  }, 0)
  return sum / team.starters.length
}

function pickWeighted(homeStrength: number, awayStrength: number): 'home' | 'away' {
  const total = homeStrength + awayStrength
  if (total <= 0) return Math.random() < 0.5 ? 'home' : 'away'
  return Math.random() * total < homeStrength ? 'home' : 'away'
}

function randomScorer(team: TeamSnapshot): EnginePlayer | null {
  const attackers = team.starters.filter((p) => p.position !== 'GK')
  if (attackers.length === 0) return null
  const weights = attackers.map((p) => p.rating * POSITION_WEIGHT[p.position])
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < attackers.length; i++) {
    r -= weights[i]
    if (r <= 0) return attackers[i]
  }
  return attackers[attackers.length - 1]
}

function simulateMinute(state: MatchState): { state: MatchState; events: SimEvent[] } {
  if (state.finished) return { state, events: [] }
  const minute = state.minute + 1
  const events: SimEvent[] = []

  for (const team of [state.home, state.away]) {
    for (const p of team.starters) p.stamina = Math.max(40, p.stamina - 0.15)
  }

  const homeStrength = teamStrength(state.home)
  const awayStrength = teamStrength(state.away)

  if (Math.random() < 1 / 9) {
    const side = pickWeighted(homeStrength, awayStrength)
    const team = side === 'home' ? state.home : state.away
    if (Math.random() < 0.32) {
      const scorer = randomScorer(team)
      if (side === 'home') state.homeScore += 1
      else state.awayScore += 1
      events.push({
        minute,
        type: 'goal',
        teamId: team.teamId,
        playerId: scorer?.id,
        description: scorer
          ? `⚽ MÅL! ${scorer.name} (${team.name}) gör ${state.homeScore}-${state.awayScore}`
          : `⚽ MÅL för ${team.name}! Ställning ${state.homeScore}-${state.awayScore}`,
      })
    } else {
      events.push({ minute, type: 'chance', teamId: team.teamId, description: `${team.name} skapar ett läge — men det räddas/missas.` })
    }
  }

  if (Math.random() < 1 / 45) {
    const side = Math.random() < 0.5 ? state.home : state.away
    const pool = side.starters.filter((p) => p.position !== 'GK')
    const player = pool[Math.floor(Math.random() * pool.length)]
    if (player) {
      const red = Math.random() < 0.08
      events.push({
        minute,
        type: red ? 'red' : 'yellow',
        teamId: side.teamId,
        description: `${red ? '🟥' : '🟨'} ${player.name} (${side.name}) får ${red ? 'rött' : 'gult'} kort.`,
      })
    }
  }

  if (minute === 1) events.unshift({ minute, type: 'kickoff', teamId: null, description: 'Avspark!' })

  const finished = minute >= 90
  if (finished) {
    events.push({
      minute,
      type: 'fulltime',
      teamId: null,
      description: `Slutsignal: ${state.home.name} ${state.homeScore} - ${state.awayScore} ${state.away.name}`,
    })
  }

  return { state: { ...state, minute, finished }, events }
}

function applySubstitution(state: MatchState, teamId: string, playerOutId: string, playerInId: string) {
  const team = teamId === state.home.teamId ? state.home : state.away
  const outIdx = team.starters.findIndex((p) => p.id === playerOutId)
  const inIdx = team.bench.findIndex((p) => p.id === playerInId)
  if (outIdx !== -1 && inIdx !== -1) {
    const [playerOut] = team.starters.splice(outIdx, 1)
    const [playerIn] = team.bench.splice(inIdx, 1)
    playerIn.stamina = 100
    team.starters.push(playerIn)
    team.bench.push(playerOut)
  }
}

// ---------- Edge function ----------

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date()
  const summary: string[] = []

  await kickOffDueFixtures(supabase, now, summary)
  await advanceLiveFixtures(supabase, now, summary)

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function toSnapshot(supabase: SupabaseClient, teamId: string): Promise<TeamSnapshot> {
  const { data: team } = await supabase.from('teams').select('id,name,arena_level').eq('id', teamId).single()
  const { data: players } = await supabase
    .from('players')
    .select('id,name,position,rating,stamina,is_starting')
    .eq('team_id', teamId)
  const all = (players ?? []) as (EnginePlayer & { is_starting: boolean })[]
  return {
    teamId,
    name: team?.name ?? '?',
    arenaLevel: team?.arena_level ?? 1,
    starters: all.filter((p) => p.is_starting),
    bench: all.filter((p) => !p.is_starting),
  }
}

async function kickOffDueFixtures(supabase: SupabaseClient, now: Date, summary: string[]) {
  const { data: due } = await supabase
    .from('fixtures')
    .select('id,home_team_id,away_team_id')
    .eq('status', 'scheduled')
    .not('away_team_id', 'is', null)
    .lte('kickoff_at', now.toISOString())

  for (const fx of due ?? []) {
    const home = await toSnapshot(supabase, fx.home_team_id)
    const away = await toSnapshot(supabase, fx.away_team_id)
    const state: MatchState = { minute: 0, homeScore: 0, awayScore: 0, home, away, finished: false }
    await supabase
      .from('fixtures')
      .update({ status: 'live', minute: 0, home_score: 0, away_score: 0, engine_state: { home: state.home, away: state.away } })
      .eq('id', fx.id)
    summary.push(`kickoff ${fx.id}`)
  }
}

async function advanceLiveFixtures(supabase: SupabaseClient, now: Date, summary: string[]) {
  const { data: live } = await supabase.from('fixtures').select('*').eq('status', 'live')

  for (const fx of live ?? []) {
    if (!fx.engine_state) continue // borde inte hända, men var defensiv
    const elapsedSeconds = (now.getTime() - new Date(fx.kickoff_at).getTime()) / 1000
    const targetMinute = Math.max(0, Math.min(90, Math.floor(elapsedSeconds / SECONDS_PER_SIM_MINUTE)))
    if (targetMinute <= fx.minute) continue

    const state: MatchState = {
      minute: fx.minute,
      homeScore: fx.home_score,
      awayScore: fx.away_score,
      home: fx.engine_state.home,
      away: fx.engine_state.away,
      finished: false,
    }

    // Applicera alla väntande byten/taktikändringar innan vi kör vidare.
    const { data: actions } = await supabase
      .from('match_actions')
      .select('*')
      .eq('fixture_id', fx.id)
      .eq('processed', false)
      .order('created_at', { ascending: true })

    const allEvents: SimEvent[] = []
    for (const a of actions ?? []) {
      if (a.type === 'substitution' && a.payload?.playerOutId && a.payload?.playerInId) {
        applySubstitution(state, a.team_id, a.payload.playerOutId, a.payload.playerInId)
        allEvents.push({ minute: state.minute, type: 'sub', teamId: a.team_id, description: 'Ett byte genomförs.' })
      } else if (a.type === 'tactic_change' && a.payload?.formation) {
        allEvents.push({
          minute: state.minute,
          type: 'tactic',
          teamId: a.team_id,
          description: `Taktikändring: ${a.payload.formation}`,
        })
      }
    }
    if (actions && actions.length > 0) {
      await supabase
        .from('match_actions')
        .update({ processed: true })
        .in('id', actions.map((a) => a.id))
    }

    let goalPlayerIds: string[] = []
    while (state.minute < targetMinute && !state.finished) {
      const { state: nextState, events } = simulateMinute(state)
      Object.assign(state, nextState)
      allEvents.push(...events)
      goalPlayerIds.push(...events.filter((e) => e.type === 'goal' && e.playerId).map((e) => e.playerId!))
    }

    if (allEvents.length > 0) {
      await supabase.from('match_events').insert(
        allEvents.map((e) => ({
          fixture_id: fx.id,
          minute: e.minute,
          type: e.type,
          team_id: e.teamId,
          description: e.description,
        }))
      )
    }

    for (const playerId of goalPlayerIds) {
      await supabase.rpc('record_player_stat', { p_player_id: playerId, p_goals: 1, p_appearance: false })
    }
    if (targetMinute >= 1 && fx.minute === 0) {
      // Första ticken efter avspark: räkna startelvorna som spelade matchen.
      for (const p of [...state.home.starters, ...state.away.starters]) {
        await supabase.rpc('record_player_stat', { p_player_id: p.id, p_goals: 0, p_appearance: true })
      }
    }

    await supabase
      .from('fixtures')
      .update({
        minute: state.minute,
        home_score: state.homeScore,
        away_score: state.awayScore,
        status: state.finished ? 'finished' : 'live',
        engine_state: { home: state.home, away: state.away },
      })
      .eq('id', fx.id)

    if (state.finished) {
      summary.push(`finished ${fx.id}`)
      const { data: fixtureRow } = await supabase
        .from('fixtures')
        .select('competition,cup_round,season_id')
        .eq('id', fx.id)
        .single()
      if (fixtureRow?.competition === 'league') {
        await supabase.rpc('credit_team', {
          p_team_id: fx.home_team_id,
          p_amount: state.home.arenaLevel * 300000,
          p_reason: `Matchdagsintäkter (arenanivå ${state.home.arenaLevel})`,
        })
        await supabase.rpc('credit_team', {
          p_team_id: fx.away_team_id,
          p_amount: state.away.arenaLevel * 100000,
          p_reason: 'Bortasupportrarnas biljettandel',
        })
      }
      if (fixtureRow?.competition === 'cup' && fixtureRow.cup_round) {
        await supabase.rpc('advance_cup_round', { p_season_id: fixtureRow.season_id, p_round: fixtureRow.cup_round })
      }
    }
  }
}
