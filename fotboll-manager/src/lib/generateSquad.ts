import type { Position } from '../types'

// Namnpooler per nordiskt land — inspirerat av Nordiska Superligan-projektet,
// så truppen känns som ett riktigt nordiskt lag istället för bara svenskt.
const NAME_POOLS: { first: string[]; last: string[] }[] = [
  // Sverige
  {
    first: ['Erik', 'Lucas', 'Oscar', 'William', 'Hugo', 'Liam', 'Elias', 'Axel', 'Leo', 'Anton', 'Filip', 'Melvin', 'Gustav', 'Nils', 'Emil', 'Isak'],
    last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Svensson', 'Gustafsson', 'Pettersson', 'Lindqvist', 'Berg'],
  },
  // Norge
  {
    first: ['Magnus', 'Jonas', 'Sander', 'Mathias', 'Kristian', 'Håkon', 'Emil', 'Ola', 'Bjørn', 'Sindre', 'Odin', 'Tobias'],
    last: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Kristiansen', 'Jensen', 'Karlsen', 'Berg', 'Haugen'],
  },
  // Danmark
  {
    first: ['Mikkel', 'Frederik', 'Lasse', 'Mathias', 'Emil', 'Anders', 'Nikolaj', 'Christian', 'Jonas', 'Rasmus', 'Kasper', 'Magnus'],
    last: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Poulsen', 'Møller', 'Christiansen'],
  },
  // Finland
  {
    first: ['Mikko', 'Juho', 'Aleksi', 'Onni', 'Eetu', 'Väinö', 'Elias', 'Leevi', 'Niklas', 'Joel', 'Aatu', 'Oskari'],
    last: ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Mäkelä', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen', 'Salminen'],
  },
]

function randomName(used: Set<string>): string {
  let name = ''
  do {
    const pool = NAME_POOLS[Math.floor(Math.random() * NAME_POOLS.length)]
    const f = pool.first[Math.floor(Math.random() * pool.first.length)]
    const l = pool.last[Math.floor(Math.random() * pool.last.length)]
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
