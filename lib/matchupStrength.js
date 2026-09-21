// "Strength of matchup" the way Sleeper's own app shows it (red/yellow/green)
// isn't exposed anywhere in Sleeper's public API, so this computes the same
// idea ourselves — a Defense-vs-Position ranking — from the actual game
// stats already synced into player_week_stats (see
// app/api/cron/sync-week-stats/route.js). For each team+position, averages
// how many fantasy points that position has scored against them per game
// played so far, then ranks all 32 teams and buckets into thirds: the
// hardest third to score against (red), the middle third (yellow), and the
// easiest third (green).
export function computeMatchupTiers(weekStatsRows) {
  // "team|position" -> week -> total fantasy points that position put up
  // against that team's defense that week (summed across every player of
  // that position who faced them, in case more than one had a stat line).
  const byTeamPositionWeek = new Map();
  for (const row of weekStatsRows) {
    if (!row.opponent || !row.position) continue;
    const key = `${row.opponent}|${row.position}`;
    const weekMap = byTeamPositionWeek.get(key) || new Map();
    weekMap.set(row.week, (weekMap.get(row.week) || 0) + (row.fantasy_points || 0));
    byTeamPositionWeek.set(key, weekMap);
  }

  const byPosition = {}; // position -> [{ team, avgAllowed }]
  for (const [key, weekMap] of byTeamPositionWeek) {
    const [team, position] = key.split('|');
    const values = [...weekMap.values()];
    const avgAllowed = values.reduce((a, b) => a + b, 0) / values.length;
    (byPosition[position] ??= []).push({ team, avgAllowed });
  }

  const tiers = {}; // team -> position -> 'red' | 'yellow' | 'green'
  for (const [position, teams] of Object.entries(byPosition)) {
    const sorted = [...teams].sort((a, b) => a.avgAllowed - b.avgAllowed);
    const n = sorted.length;
    sorted.forEach(({ team }, i) => {
      const tier = i < n / 3 ? 'red' : i < (2 * n) / 3 ? 'yellow' : 'green';
      (tiers[team] ??= {})[position] = tier;
    });
  }
  return tiers;
}
