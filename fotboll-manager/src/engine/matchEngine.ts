/**
 * Matchmotor för Fotbollsmanager Online — REFERENSVERSION.
 *
 * Den här filen används inte längre i drift. Matcher simuleras numera på
 * servern av supabase/functions/tick-matches/index.ts, som har en egen kopia
 * av exakt samma logik (Edge Functions paketeras isolerat per mapp och kan
 * inte enkelt importera från src/, se README.md). Den här klientvänliga
 * versionen finns kvar som lättläst referens — om du ändrar matchreglerna,
 * gör det på båda ställena.
 */

import type { MatchEventType, Player, Position } from '../types'

export interface TeamSnapshot {
  teamId: string
  name: string
  formation: string
  starters: Player[]
  bench: Player[]
}

export interface SimTickEvent {
  minute: number
  type: MatchEventType
  teamId: string | null
  description: string
  playerId?: string
}

export interface LiveAction {
  type: 'substitution' | 'tactic_change'
  teamId: string
  minute: number
  payload: {
    // substitution
    playerOutId?: string
    playerInId?: string
    // tactic_change
    formation?: string
  }
}

export interface MatchState {
  minute: number
  homeScore: number
  awayScore: number
  home: TeamSnapshot
  away: TeamSnapshot
  finished: boolean
}

const POSITION_WEIGHT: Record<Position, number> = {
  GK: 0.5,
  DEF: 0.9,
  MID: 1.1,
  FWD: 1.2,
}

/** Ett lags samlade styrka just nu, givet vilka som faktiskt spelar. */
export function teamStrength(team: TeamSnapshot): number {
  if (team.starters.length === 0) return 0
  const sum = team.starters.reduce((acc, p) => {
    const staminaFactor = 0.5 + (p.stamina / 100) * 0.5 // trötta spelare presterar sämre
    return acc + p.rating * POSITION_WEIGHT[p.position] * staminaFactor
  }, 0)
  return sum / team.starters.length
}

function pickWeighted(homeStrength: number, awayStrength: number): 'home' | 'away' {
  const total = homeStrength + awayStrength
  if (total <= 0) return Math.random() < 0.5 ? 'home' : 'away'
  return Math.random() * total < homeStrength ? 'home' : 'away'
}

function randomScorer(team: TeamSnapshot): Player | null {
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

/**
 * Simulerar EN minut av matchen och returnerar ev. händelser den minuten.
 * Anropas upprepade gånger (minut 1..90) av den som driver matchen framåt
 * (klienten i MVP, en cron/Edge Function senare).
 */
export function simulateMinute(state: MatchState): { state: MatchState; events: SimTickEvent[] } {
  if (state.finished) return { state, events: [] }

  const minute = state.minute + 1
  const events: SimTickEvent[] = []

  // Lätt utmattning över tid — påverkar teamStrength minut för minut
  for (const team of [state.home, state.away]) {
    for (const p of team.starters) {
      p.stamina = Math.max(40, p.stamina - 0.15)
    }
  }

  const homeStrength = teamStrength(state.home)
  const awayStrength = teamStrength(state.away)

  // ~ var 9:e minut i snitt inträffar ett "målchans-ögonblick"
  const chanceRoll = Math.random()
  if (chanceRoll < 1 / 9) {
    const side = pickWeighted(homeStrength, awayStrength)
    const team = side === 'home' ? state.home : state.away
    const isGoal = Math.random() < 0.32 // ~32% av chanser blir mål

    if (isGoal) {
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
      events.push({
        minute,
        type: 'chance',
        teamId: team.teamId,
        description: `${team.name} skapar ett läge — men det räddas/missas.`,
      })
    }
  }

  // Sällsynta kort
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
        description: `${red ? '🟥' : '🟨'} ${player.name} (${side.name}) får ${
          red ? 'rött' : 'gult'
        } kort.`,
      })
    }
  }

  if (minute === 1) {
    events.unshift({ minute, type: 'kickoff', teamId: null, description: 'Avspark!' })
  }

  const finished = minute >= 90
  if (finished) {
    events.push({
      minute,
      type: 'fulltime',
      teamId: null,
      description: `Slutsignal: ${state.home.name} ${state.homeScore} - ${state.awayScore} ${state.away.name}`,
    })
  }

  return {
    state: { ...state, minute, finished },
    events,
  }
}

/** Applicerar en live-åtgärd (byte eller taktikändring) skickad av en lagägare. */
export function applyLiveAction(state: MatchState, action: LiveAction): MatchState {
  const team = action.teamId === state.home.teamId ? state.home : state.away

  if (action.type === 'substitution' && action.payload.playerOutId && action.payload.playerInId) {
    const outIdx = team.starters.findIndex((p) => p.id === action.payload.playerOutId)
    const inIdx = team.bench.findIndex((p) => p.id === action.payload.playerInId)
    if (outIdx !== -1 && inIdx !== -1) {
      const [playerOut] = team.starters.splice(outIdx, 1)
      const [playerIn] = team.bench.splice(inIdx, 1)
      playerIn.stamina = 100
      team.starters.push(playerIn)
      team.bench.push(playerOut)
    }
  }

  if (action.type === 'tactic_change' && action.payload.formation) {
    team.formation = action.payload.formation
  }

  return state
}

export function createInitialState(home: TeamSnapshot, away: TeamSnapshot): MatchState {
  return {
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    home,
    away,
    finished: false,
  }
}
