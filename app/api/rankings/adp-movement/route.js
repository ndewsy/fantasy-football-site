import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Compares the two most recent distinct snapshot dates (not a fixed lookback window)
// so movement shows up as soon as adp_rank actually changes, rather than being
// blurred across — or hidden behind — an arbitrary multi-week window.
export async function GET() {
  const { data: dateRows, error: datesError } = await supabase()
    .from('player_adp_history')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false });

  if (datesError) {
    console.error('[adp-movement] dates fetch failed:', datesError);
    return Response.json({ error: datesError.message }, { status: 500 });
  }

  const distinctDates = [...new Set((dateRows || []).map(d => d.snapshot_date))];
  if (distinctDates.length < 2) {
    return Response.json({ risers: [], fallers: [], buildingData: true });
  }

  const [latestDate, previousDate] = distinctDates;

  const [{ data: latestRows, error: latestError }, { data: previousRows, error: previousError }] = await Promise.all([
    supabase().from('player_adp_history').select('player_id, adp_rank').eq('snapshot_date', latestDate),
    supabase().from('player_adp_history').select('player_id, adp_rank').eq('snapshot_date', previousDate),
  ]);

  if (latestError || previousError) {
    console.error('[adp-movement] snapshot fetch failed:', latestError || previousError);
    return Response.json({ error: (latestError || previousError).message }, { status: 500 });
  }

  const prevByPlayer = Object.fromEntries((previousRows || []).map(r => [r.player_id, r.adp_rank]));

  const movements = (latestRows || [])
    .map(r => {
      const before = prevByPlayer[r.player_id];
      if (before === undefined || before === r.adp_rank) return null;
      return { player_id: r.player_id, before, after: r.adp_rank, delta: before - r.adp_rank };
    })
    .filter(Boolean);

  if (movements.length === 0) {
    return Response.json({ risers: [], fallers: [], buildingData: false });
  }

  const risers = movements.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const fallers = movements.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

  const playerIds = [...risers, ...fallers].map(m => m.player_id);
  const { data: players, error: playersError } = await supabase()
    .from('players')
    .select('id, name, position, team, espn_id, sleeper_id')
    .in('id', playerIds);

  if (playersError) {
    console.error('[adp-movement] players fetch failed:', playersError);
    return Response.json({ error: playersError.message }, { status: 500 });
  }

  const playersById = Object.fromEntries((players || []).map(p => [p.id, p]));
  const attach = (m) => ({ ...m, player: playersById[m.player_id] || null });

  return Response.json({
    risers: risers.map(attach).filter(m => m.player),
    fallers: fallers.map(attach).filter(m => m.player),
    buildingData: false,
  });
}
