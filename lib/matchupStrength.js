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

// Fixed hex colors rather than named Tailwind shades (bg-red-100, etc.) —
// this site remaps the entire named red/green/amber/blue palette for dark
// mode by swapping light and dark shades (see the `.dark` block in
// app/globals.css), which inverted this exact scale: red-700 rendered
// *lighter* than red-100 once dark mode was live, making "very hard" look
// paler than "hard". These arbitrary values read the same dark-red-means-
// danger heatmap in both themes.
export const MATCHUP_TIER_CLASSES = {
  easy: 'bg-[#2563EB] text-white',
  good: 'bg-[#16A34A] text-white',
  mid: 'bg-[#D97706] text-white',
  hard: 'bg-[#DC2626] text-white',
  very_hard: 'bg-[#7F1D1D] text-white',
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
