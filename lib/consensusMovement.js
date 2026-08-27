// Parses a rankings.players JSONB value into an ordered array of player objects.
// Handles both the new integer-ID format and the legacy embedded-object format.
export function parseRanked(raw, idToName) {
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

export function computeConsensus(formatData) {
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

// Same lookback logic used for the per-creator/consensus rank-movement arrows
// (default 30 days there), reused here with a configurable window for the
// risers/fallers widget's 7-day / 14-day toggle.
export function cutoffDate(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
