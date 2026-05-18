import { createClient } from '@supabase/supabase-js'

export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
)
