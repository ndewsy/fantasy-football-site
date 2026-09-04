import { createClient } from '@supabase/supabase-js';
import { parseRanked, computeConsensus, cutoffDate } from '@/lib/consensusMovement';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Reuses the exact same rankings_history snapshots and consensus-averaging logic as
// /api/rankings/movement (the per-row rank-movement arrows) — same "most recent snapshot
// at least that old" lookup per creator, but with a caller-selectable 7 or 14 day window
// instead of the fixed 30. This just aggregates the result down to the top 3
// risers/fallers with player metadata joined in, instead of a full per-player delta map.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  if (!format) return Response.json({ error: 'format required' }, { status: 400 });

  const days = searchParams.get('days') === '14' ? 14 : 7;

  const playersData = [];
  for (let from = 0; ; from += 1000) {
    const { data: batch } = await supabase().from('players').select('id, name, position, team, espn_id, sleeper_id').range(from, from + 999);
    playersData.push(...(batch || []));
    if (!batch || batch.length < 1000) break;
  }
  const idToName = Object.fromEntries(playersData.map(p => [p.id, p.name]));
  const byName = Object.fromEntries(playersData.map(p => [p.name, p]));

  const cutoff = cutoffDate(days);

  const [{ data: currentRows }, { data: histRows }] = await Promise.all([
    supabase().from('rankings').select('creator_id, players').eq('format', format),
    supabase().from('rankings_history')
      .select('creator_id, players, snapshot_date')
      .eq('format', format)
      .lte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: false }),
  ]);

  if (!currentRows || currentRows.length === 0) {
    return Response.json({ risers: [], fallers: [], buildingData: true });
  }

  const currentFormatData = {};
  for (const row of currentRows) {
    const ranked = parseRanked(row.players, idToName);
    if (ranked.length > 0) currentFormatData[row.creator_id] = ranked;
  }

  const histFormatData = {};
  for (const row of (histRows || [])) {
    if (!histFormatData[row.creator_id]) {
      const ranked = parseRanked(row.players, idToName);
      if (ranked.length > 0) histFormatData[row.creator_id] = ranked;
    }
  }

  if (Object.keys(histFormatData).length === 0) {
    return Response.json({ risers: [], fallers: [], buildingData: true });
  }

  const currentConsensus = computeConsensus(currentFormatData);
  const histConsensus = computeConsensus(histFormatData);

  const histRankByName = {};
  histConsensus.forEach((p, i) => { histRankByName[p.name] = i + 1; });

  const movements = currentConsensus
    .map((p, i) => {
      const before = histRankByName[p.name];
      const after = i + 1;
      if (before === undefined || before === after) return null;
      return { name: p.name, before, after, delta: before - after };
    })
    .filter(Boolean);

  if (movements.length === 0) {
    return Response.json({ risers: [], fallers: [], buildingData: false });
  }

  const risers = movements.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const fallers = movements.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

  const attach = (m) => ({ ...m, player: byName[m.name] || null });

  return Response.json({
    risers: risers.map(attach).filter(m => m.player),
    fallers: fallers.map(attach).filter(m => m.player),
    buildingData: false,
    days,
  });
}
