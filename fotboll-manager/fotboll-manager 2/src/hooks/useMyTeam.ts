import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Team } from '../types'

export function useMyTeam() {
  const { user } = useAuth()
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setTeam(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.from('teams').select('*').eq('owner_id', user.id).maybeSingle()
    setTeam((data as Team) ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { team, loading, refresh }
}
