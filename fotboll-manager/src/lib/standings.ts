import type { Fixture } from '../types'

export interface StandingRow {
  teamId: string
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

export function computeStandings(
  teams: { id: string; name: string }[],
  fixtures: Fixture[]
): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      name: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
    })
  }

  for (const f of fixtures) {
    if (f.status !== 'finished' || !f.away_team_id) continue
    const home = rows.get(f.home_team_id)
    const away = rows.get(f.away_team_id)
    if (!home || !away) continue

    home.played++
    away.played++
    home.gf += f.home_score
    home.ga += f.away_score
    away.gf += f.away_score
    away.ga += f.home_score

    if (f.home_score > f.away_score) {
      home.won++
      away.lost++
      home.points += 3
    } else if (f.home_score < f.away_score) {
      away.won++
      home.lost++
      away.points += 3
    } else {
      home.drawn++
      away.drawn++
      home.points++
      away.points++
    }
  }

  return Array.from(rows.values()).sort(
    (a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf
  )
}
