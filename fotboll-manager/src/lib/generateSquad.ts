import type { Position } from '../types'

const FIRST_NAMES = [
  'Erik', 'Lucas', 'Oscar', 'Noah', 'William', 'Hugo', 'Liam', 'Elias',
  'Axel', 'Leo', 'Adam', 'Theo', 'Anton', 'Filip', 'Alve', 'Melvin',
  'Vincent', 'Alexander', 'Gustav', 'Charlie', 'Nils', 'Emil', 'Isak', 'Viggo',
]
const LAST_NAMES = [
  'Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson',
  'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jonsson',
  'Jansson', 'Hansson', 'Bengtsson', 'Lindqvist', 'Berg', 'Lindberg',
]

function randomName(used: Set<string>): string {
  let name = ''
  do {
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
    const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
    name = `${f} ${l}`
  } while (used.has(name))
  used.add(name)
  return name
}

function randomRating(): number {
  return 55 + Math.floor(Math.random() * 30) // 55–84
}

export interface GeneratedPlayer {
  name: string
  position: Position
  rating: number
  stamina: number
  is_starting: boolean
  slot: number | null
}

/** Genererar en trupp på 18 spelare och sätter en startelva i 4-4-2. */
export function generateSquad(): GeneratedPlayer[] {
  const used = new Set<string>()
  const counts: Record<Position, number> = { GK: 3, DEF: 6, MID: 6, FWD: 3 }
  const startingCounts: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }

  const players: GeneratedPlayer[] = []
  let slot = 0

  ;(Object.keys(counts) as Position[]).forEach((pos) => {
    for (let i = 0; i < counts[pos]; i++) {
      const isStarting = i < startingCounts[pos]
      players.push({
        name: randomName(used),
        position: pos,
        rating: randomRating(),
        stamina: 100,
        is_starting: isStarting,
        slot: isStarting ? slot++ : null,
      })
    }
  })

  return players
}

export interface GeneratedFreeAgent {
  name: string
  position: Position
  rating: number
  asking_price: number
}

/** Genererar en pool fria agenter till marknaden, med pris kopplat till rating. */
export function generateFreeAgentPool(count: number): GeneratedFreeAgent[] {
  const used = new Set<string>()
  const positions: Position[] = ['GK', 'DEF', 'MID', 'FWD']
  const agents: GeneratedFreeAgent[] = []
  for (let i = 0; i < count; i++) {
    const rating = randomRating()
    agents.push({
      name: randomName(used),
      position: positions[Math.floor(Math.random() * positions.length)],
      rating,
      asking_price: rating * 20000 + Math.floor(Math.random() * 300000),
    })
  }
  return agents
}
