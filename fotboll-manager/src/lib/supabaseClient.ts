import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Detta är avsiktligt högljutt — utan riktiga nycklar i .env fungerar
  // ingenting som pratar med databasen. Se README.md, steg 1.
  console.warn(
    '[Supabase] VITE_SUPABASE_URL eller VITE_SUPABASE_ANON_KEY saknas. ' +
      'Kopiera .env.example till .env och fyll i värden från ditt Supabase-projekt.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
