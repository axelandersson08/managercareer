/**
 * Säsongsschemaläggning: delar in lag i divisioner, lottar ligaspelschema
 * (dubbelmöten, en omgång per dag kl 15:00 GMT) och en cupsluttavla
 * (rakt slutspel, kl 18:00 GMT, med frilotter om antalet lag inte är en
 * jämn tvåpotens).
 *
 * Körs en gång av admin när säsongen startar — se AdminPage.tsx.
 * Ren logik, inga Supabase-anrop härifrån (den som anropar sköter inserten).
 */


export interface PreviousDivisionStandings {
  tier: number
  /** Lag-id:n i den här divisionen, sorterade bäst (index 0) till sämst. */
  teamIdsBestFirst: string[]
}

/**
 * Bygger nästa säsongs divisionsindelning utifrån föregående säsongs
 * tabeller: de tre sämsta i varje division flyttas ner, de tre bästa i
 * divisionen under flyttas upp. Nya lag (som aldrig spelat en säsong förut)
 * läggs längst ner, och en ny lägsta division skapas om den nuvarande blir
 * full.
 */
export function planTierAssignments(
  previousDivisions: PreviousDivisionStandings[],
  newTeamIds: string[],
  divisionSize: number
): Map<string, number> {
  const assignment = new Map<string, number>()
  if (previousDivisions.length === 0) {
    // Ingen tidigare säsong — ren anmälningsordning, högsta divisionen fylls först.
    for (const [i, teamId] of newTeamIds.entries()) {
      assignment.set(teamId, Math.floor(i / divisionSize) + 1)
    }
    return assignment
  }

  const sorted = [...previousDivisions].sort((a, b) => a.tier - b.tier)
  const maxTier = sorted[sorted.length - 1].tier

  for (const d of sorted) {
    for (const teamId of d.teamIdsBestFirst) assignment.set(teamId, d.tier)
  }

  for (const d of sorted) {
    if (d.tier === maxTier) continue
    const below = sorted.find((x) => x.tier === d.tier + 1)
    if (!below) continue
    const relegateCount = Math.min(3, d.teamIdsBestFirst.length)
    const promoteCount = Math.min(3, below.teamIdsBestFirst.length)
    const relegated = d.teamIdsBestFirst.slice(-relegateCount)
    const promoted = below.teamIdsBestFirst.slice(0, promoteCount)
    for (const teamId of relegated) assignment.set(teamId, d.tier + 1)
    for (const teamId of promoted) assignment.set(teamId, d.tier)
  }

  let bottomTier = maxTier
  let bottomTierCount = sorted.find((d) => d.tier === bottomTier)?.teamIdsBestFirst.length ?? 0
  for (const teamId of newTeamIds) {
    if (bottomTierCount >= divisionSize) {
      bottomTier += 1
      bottomTierCount = 0
    }
    assignment.set(teamId, bottomTier)
    bottomTierCount++
  }

  return assignment
}

export interface LeagueFixtureDraft {
  divisionTier: number
  matchday: number
  homeTeamId: string
  awayTeamId: string
  kickoffAt: string // ISO
}

function atUtc(baseDate: Date, dayOffset: number, hourUtc: number): string {
  const d = new Date(
    Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate() + dayOffset,
      hourUtc,
      0,
      0
    )
  )
  return d.toISOString()
}

/** Dubbelmöten (hemma+borta) för ett enskilt lags divisionslag, en omgång/dag kl 15:00 GMT. */
export function buildLeagueFixturesForDivision(
  divisionTier: number,
  teamIds: string[],
  seasonStart: Date
): LeagueFixtureDraft[] {
  const ids = [...teamIds]
  const hasBye = ids.length % 2 !== 0
  if (hasBye) ids.push('BYE')
  const n = ids.length
  const legRounds: [string, string][][] = []

  const rotation = [...ids]
  for (let round = 0; round < n - 1; round++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = rotation[i]
      const away = rotation[n - 1 - i]
      if (home !== 'BYE' && away !== 'BYE') {
        pairs.push(round % 2 === 0 ? [home, away] : [away, home])
      }
    }
    legRounds.push(pairs)
    rotation.splice(1, 0, rotation.pop() as string)
  }

  // Andra halvan av säsongen: samma möten, omvänd planhalva (retur).
  const secondLeg = legRounds.map((round) => round.map(([h, a]) => [a, h] as [string, string]))
  const allRounds = [...legRounds, ...secondLeg]

  const drafts: LeagueFixtureDraft[] = []
  allRounds.forEach((round, idx) => {
    const matchday = idx + 1
    const kickoffAt = atUtc(seasonStart, idx, 15)
    round.forEach(([homeTeamId, awayTeamId]) => {
      drafts.push({ divisionTier, matchday, homeTeamId, awayTeamId, kickoffAt })
    })
  })
  return drafts
}

export interface CupRound1Draft {
  byeTeamIds: string[]
  matches: { homeTeamId: string; awayTeamId: string }[]
  kickoffAt: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/** Slumpar fram cupens första omgång, med frilotter så att fältet blir en tvåpotens. */
export function buildCupRound1(teamIds: string[], seasonStart: Date): CupRound1Draft {
  const shuffled = shuffle(teamIds)
  const bracketSize = nextPowerOfTwo(shuffled.length)
  const byes = bracketSize - shuffled.length
  const byeTeamIds = shuffled.slice(0, byes)
  const playing = shuffled.slice(byes)
  const matches: { homeTeamId: string; awayTeamId: string }[] = []
  for (let i = 0; i < playing.length; i += 2) {
    matches.push({ homeTeamId: playing[i], awayTeamId: playing[i + 1] })
  }
  return { byeTeamIds, matches, kickoffAt: atUtc(seasonStart, 0, 18) }
}

/** Nästa cupomgångs kickoff: en vecka efter föregående omgångs kickoff. */
export function nextCupRoundKickoff(previousKickoffAt: string): string {
  const prev = new Date(previousKickoffAt)
  return atUtc(prev, 7, 18)
}

export function pairWinnersForNextRound(winnerTeamIds: string[]): { homeTeamId: string; awayTeamId: string }[] {
  const shuffled = shuffle(winnerTeamIds)
  const matches: { homeTeamId: string; awayTeamId: string }[] = []
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({ homeTeamId: shuffled[i], awayTeamId: shuffled[i + 1] })
  }
  return matches
}
