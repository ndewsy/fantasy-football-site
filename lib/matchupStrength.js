// "Strength of matchup" the way Sleeper's own app shows it (a red/yellow/
// green style grade) isn't exposed anywhere in Sleeper's public API, so this
// builds an equivalent Defense-vs-Position system ourselves, from the actual
// game stats already synced into player_week_stats (see
// app/api/cron/sync-week-stats/route.js).
//
// For each team+position, this averages how many fantasy points that
// position has scored against them per game played *so far this season*,
// then ranks all 32 teams and buckets them into 5 tiers. A rating shown for
// an upcoming week only ever uses weeks strictly before it — week 4's rating
// is built from 3 weeks of data, week 5 from 4, etc. — since the upcoming
// week hasn't been played yet.
export const MATCHUP_TIERS = ['easy', 'good', 'mid', 'hard', 'very_hard'];

export const MATCHUP_TIER_LABELS = {
  easy: 'EASY',
  good: 'GOOD',
  mid: 'MID',
  hard: 'HARD',
  very_hard: 'VERY HARD',
};

// Tailwind classes for the compact badge used on matchup rows, and a
// slightly bolder variant for the full breakdown table on /matchups.
export const MATCHUP_TIER_CLASSES = {
  easy: 'bg-blue-100 text-blue-700',
  good: 'bg-green-100 text-green-700',
  mid: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
  very_hard: 'bg-red-700 text-white',
};

// Rank is 1-indexed, sorted so rank 1 = most fantasy points allowed = the
// easiest matchup for that position.
function tierForRank(rank) {
  if (rank <= 3) return 'easy';
  if (rank <= 12) return 'good';
  if (rank <= 20) return 'mid';
  if (rank <= 29) return 'hard';
  return 'very_hard';
}

// Builds the full Defense-vs-Position breakdown: for each position, every
// team's average/high/low fantasy points allowed per game, ranked 1-32 and
// bucketed into the 5 tiers above. `upToWeek`, when given, restricts to
// weeks strictly before it.
export function computeMatchupStats(weekStatsRows, upToWeek) {
  // "team|position" -> week -> total fantasy points that position put up
  // against that team's defense that week (summed across every player of
  // that position who faced them, in case more than one had a stat line).
  const byTeamPositionWeek = new Map();
  for (const row of weekStatsRows) {
    if (!row.opponent || !row.position) continue;
    if (upToWeek != null && row.week >= upToWeek) continue;
    const key = `${row.opponent}|${row.position}`;
    const weekMap = byTeamPositionWeek.get(key) || new Map();
    weekMap.set(row.week, (weekMap.get(row.week) || 0) + (row.fantasy_points || 0));
    byTeamPositionWeek.set(key, weekMap);
  }

  const byPosition = {}; // position -> [{ team, avgAllowed, high, low, games }]
  for (const [key, weekMap] of byTeamPositionWeek) {
    const [team, position] = key.split('|');
    const values = [...weekMap.values()];
    const avgAllowed = values.reduce((a, b) => a + b, 0) / values.length;
    (byPosition[position] ??= []).push({
      team,
      avgAllowed,
      high: Math.max(...values),
      low: Math.min(...values),
      games: values.length,
    });
  }

  const result = {};
  for (const [position, teams] of Object.entries(byPosition)) {
    const sorted = [...teams].sort((a, b) => b.avgAllowed - a.avgAllowed);
    result[position] = sorted.map((t, i) => ({ ...t, rank: i + 1, tier: tierForRank(i + 1) }));
  }
  return result;
}

// Compact team -> position -> tier map, for coloring a single matchup badge
// (Weekly Rankings) without needing the full breakdown from above.
export function tiersFromStats(statsByPosition) {
  const tiers = {};
  for (const [position, teams] of Object.entries(statsByPosition)) {
    for (const t of teams) {
      (tiers[t.team] ??= {})[position] = t.tier;
    }
  }
  return tiers;
}
