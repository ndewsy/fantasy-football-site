// Shared between the Rankings page and the player card modal (which computes
// its own per-format ranking positions independently of the page's active tab).

// Converts a player array from integer IDs (new format) or objects (legacy) to player objects.
export function expandIds(arr, byId) {
  if (!arr?.length) return [];
  if (typeof arr[0] === "number") return arr.map(id => byId[id]).filter(Boolean);
  return arr;
}

export function normalizeName(name) {
  return name.toLowerCase().replace(/\./g, ' ').trim().replace(/\s+/g, ' ');
}

export function computeConsensus(formatData) {
  const creatorLists = Object.values(formatData);
  if (creatorLists.length === 0) return null;

  const playerMap = {};
  for (const players of creatorLists) {
    players.forEach((player, i) => {
      const key = normalizeName(player.name);
      if (!playerMap[key]) playerMap[key] = { ...player, totalRank: 0, count: 0 };
      playerMap[key].totalRank += i + 1;
      playerMap[key].count++;
    });
  }

  return Object.values(playerMap)
    .map(p => ({ ...p, avgRank: p.totalRank / p.count }))
    .sort((a, b) => a.avgRank - b.avgRank);
}
