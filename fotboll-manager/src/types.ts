export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export interface Profile {
  id: string
  username: string
  is_admin: boolean
  created_at: string
}

export type SeasonStatus = 'registration' | 'active' | 'finished'

export interface Season {
  id: string
  number: number
  status: SeasonStatus
  division_size: number
  start_date: string | null
  created_at: string
}

export interface Division {
  id: string
  season_id: string
  tier: number
  name: string
  created_at: string
}

export interface Team {
  id: string
  owner_id: string
  name: string
  formation: string
  division_id: string | null
  budget: number
  arena_level: number
  academy_level: number
  primary_color: string
  secondary_color: string
  created_at: string
}

export interface Player {
  id: string
  team_id: string | null // null = fri agent
  name: string
  position: Position
  age: number
  rating: number
  stamina: number
  is_starting: boolean
  slot: number | null
  goals: number
  appearances: number
  asking_price: number | null
  created_at: string
}

export type Competition = 'league' | 'cup'
export type FixtureStatus = 'scheduled' | 'live' | 'finished'

export interface Fixture {
  id: string
  season_id: string
  competition: Competition
  division_id: string | null
  matchday: number | null
  cup_round: number | null
  home_team_id: string
  away_team_id: string | null // null = frilott i cupen
  kickoff_at: string
  status: FixtureStatus
  minute: number
  home_score: number
  away_score: number
  created_at: string
}

export type MatchEventType =
  | 'kickoff'
  | 'chance'
  | 'goal'
  | 'yellow'
  | 'red'
  | 'sub'
  | 'tactic'
  | 'fulltime'
  | 'bye'

export interface MatchEvent {
  id: string
  fixture_id: string
  minute: number
  type: MatchEventType
  team_id: string | null
  description: string
  created_at: string
}

export type MatchActionType = 'substitution' | 'tactic_change'

export interface MatchAction {
  id: string
  fixture_id: string
  team_id: string
  type: MatchActionType
  payload: Record<string, unknown>
  minute: number | null
  created_at: string
}

export interface FinanceTransaction {
  id: string
  team_id: string
  amount: number
  reason: string
  created_at: string
}

export type ListingStatus = 'open' | 'completed' | 'withdrawn'

export interface TransferListing {
  id: string
  player_id: string
  seller_team_id: string
  asking_price: number
  status: ListingStatus
  created_at: string
}

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'

export interface TransferBid {
  id: string
  listing_id: string
  bidder_team_id: string
  amount: number
  status: BidStatus
  created_at: string
}
