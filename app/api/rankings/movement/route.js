import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Parses a rankings.players JSONB value into an ordered array of player objects.
// Handles both the new integer-ID format and the legacy embedded-object format.
function parseRanked(raw, idToName) {
  if (!raw) return [];
  const ranked = Array.isArray(raw) ? raw.filter(p => !p?.unranked) : (raw.ranked || []);
  if (ranked.length === 0) return [];
  if (typeof ranked[0] === 'number') {
    return ranked.map(id => {
      const name = idToName[id];
      return name ? { name } : null;
    }).filter(Boolean);
  }
  // Legacy: embedded objects
  return ranked.map(({ unranked: _, ...p }) => p);
}

function computeConsensus(formatData) {
  const playerMap = {};
  for (const players of Object.values(formatData)) {
    players.forEach((p, i) => {
      if (!playerMap[p.name]) playerMap[p.name] = { name: p.name, totalRank: 0, count: 0 };
      playerMap[p.name].totalRank += i + 1;
      playerMap[p.name].count++;
    });
  }
  return Object.values(playerMap)
    .map(p => ({ name: p.name, avgRank: p.totalRank / p.count }))
    .sort((a, b) => a.avgRank - b.avgRank);
}

function cutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function buildMovement(currentRanked, historicalRanked) {
  const histMap = {};
  historicalRanked.forEach((p, i) => { histMap[p.name] = i + 1; });
  const movement = {};
  currentRanked.forEach((p, i) => {
    const oldRank = histMap[p.name];
    if (oldRank !== undefined) {
      const delta = oldRank - (i + 1);
      if (delta !== 0) movement[p.name] = delta;
    }
  });
  return movement;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const format = searchParams.get('format');

  if (!format) return Response.json({ error: 'format required' }, { status: 400 });

  // Build id→name lookup for expanding integer arrays
  const { data: playersData } = await supabase.from('players').select('id, name');
  const idToName = Object.fromEntries((playersData || []).map(p => [p.id, p.name]));

  const cutoff = cutoffDate();

  if (creator_id) {
    const [{ data: current }, { data: hist }] = await Promise.all([
      supabase.from('rankings').select('players').eq('creator_id', creator_id).eq('format', format).maybeSingle(),
      supabase.from('rankings_history')
        .select('players')
        .eq('creator_id', creator_id)
        .eq('format', format)
        .lte('snapshot_date', cutoff)
        .order('snapshot_date', { ascending: false })
        .limit(1),
    ]);

    if (!current || !hist || hist.length === 0) return Response.json({ movement: {} });

    const currentRanked = parseRanked(current.players, idToName);
    const histRanked = parseRanked(hist[0].players, idToName);
    return Response.json({ movement: buildMovement(currentRanked, histRanked) });
  }

  // Consensus
  const [{ data: currentRows }, { data: histRows }] = await Promise.all([
    supabase.from('rankings').select('creator_id, players').eq('format', format),
    supabase.from('rankings_history')
      .select('creator_id, players, snapshot_date')
      .eq('format', format)
      .lte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: false }),
  ]);

  if (!currentRows || currentRows.length === 0) return Response.json({ movement: {} });

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

  if (Object.keys(histFormatData).length === 0) return Response.json({ movement: {} });

  const currentConsensus = computeConsensus(currentFormatData);
  const histConsensus = computeConsensus(histFormatData);

  return Response.json({ movement: buildMovement(currentConsensus, histConsensus) });
}
