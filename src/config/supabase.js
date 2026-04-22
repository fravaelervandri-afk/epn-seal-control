import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://omquaygcohibqzkehavk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_a9_5QcTZlx3jYLKN6AM9dw__iB1uQ14';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);