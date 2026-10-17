import { createClient } from '@supabase/supabase-js';
import { getAuthedUser } from '@/lib/getUser';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const PROJECTABLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Just finds the player by name — doesn't require an existing prop line.
// Betting lines are fetched on demand the moment a player is actually added
// to a comparison (see lib/ensurePlayerProps.js), so requiring one here
// (as this used to, from the old bulk-sync era where every active player
// already had lines cached) meant almost nobody could ever be found: a
// player only gets a cached line *after* being added via search, so an
// "already has a line" filter left the picker essentially empty once the
// bulk cron was turned off.
export async function GET(request) {
  const authed = await getAuthedUser(request);
  if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  let query = supabase()
    .from('players')
    .select('id, name, position, team, espn_id, sleeper_id')
    .in('position', PROJECTABLE_POSITIONS)
    .neq('team', 'FA')
    .order('name')
    .limit(15);
  if (q.length > 0) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ players: data || [] });
}
