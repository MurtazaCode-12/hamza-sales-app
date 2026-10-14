import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://htpkgmwofntbndxrqyqk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_SOCX1766s8uI1yFrLLIjww_z7CabsHT';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
