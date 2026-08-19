import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

function parseRanked(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(p => !p.unranked).map(({ unranked: _, ...p }) => p);
  return Array.isArray(raw.ranked) ? raw.ranked : [];
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: rows, error } = await supabase()
    .from('rankings')
    .select('creator_id, format, players');

  if (error) {
    console.error('[snapshot-rankings] fetch failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const snapshots = (rows || [])
    .map(row => ({ creator_id: row.creator_id, format: row.format, players: parseRanked(row.players), snapshot_date: today }))
    .filter(s => s.players.length > 0);

  if (snapshots.length === 0) {
    return Response.json({ ok: true, inserted: 0 });
  }

  const { error: upsertError } = await supabase()
    .from('rankings_history')
    .upsert(snapshots, { onConflict: 'creator_id,format,snapshot_date', ignoreDuplicates: true });

  if (upsertError) {
    console.error('[snapshot-rankings] upsert failed:', upsertError);
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  console.log(`[snapshot-rankings] inserted ${snapshots.length} snapshots for ${today}`);

  // Same daily job also records each player's current adp_rank, so ADP movement
  // (risers/fallers) can be computed against yesterday's snapshot once history exists.
  const { data: playersWithAdp, error: playersError } = await supabase()
    .from('players')
    .select('id, adp_rank')
    .not('adp_rank', 'is', null);

  let adpInserted = 0;
  if (playersError) {
    console.error('[snapshot-rankings] players fetch failed:', playersError);
  } else {
    const adpSnapshots = (playersWithAdp || []).map(p => ({
      player_id: p.id,
      adp_rank: p.adp_rank,
      snapshot_date: today,
    }));
    if (adpSnapshots.length > 0) {
      const { error: adpUpsertError } = await supabase()
        .from('player_adp_history')
        .upsert(adpSnapshots, { onConflict: 'player_id,snapshot_date', ignoreDuplicates: true });
      if (adpUpsertError) {
        console.error('[snapshot-rankings] adp upsert failed:', adpUpsertError);
      } else {
        adpInserted = adpSnapshots.length;
      }
    }
  }

  console.log(`[snapshot-rankings] inserted ${adpInserted} adp snapshots for ${today}`);
  return Response.json({ ok: true, inserted: snapshots.length, adpInserted });
}
