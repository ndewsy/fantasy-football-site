import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function GET() {
  const { data, error } = await supabase()
    .from('profiles')
    .select('creator_id, referral_code')
    .eq('is_creator', true)
    .not('creator_id', 'is', null);

  if (error) {
    console.error('[/api/creators/active] fetch failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ creators: data || [] });
}
