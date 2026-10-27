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

// Compact team -> position -> { tier, rank } map, for coloring a single
// matchup badge and showing its rank number (Weekly Rankings) without
// needing the full breakdown from above.
export function tiersFromStats(statsByPosition) {
  const tiers = {};
  for (const [position, teams] of Object.entries(statsByPosition)) {
    for (const t of teams) {
      (tiers[t.team] ??= {})[position] = { tier: t.tier, rank: t.rank };
    }
  }
  return tiers;
}

// RB/WR/TE games against a defense below this many PPR points aren't worth
// listing in the per-team drill-down — every defense faces a handful of
// 1-2 point depth-chart guys a week. QBs show just the starter instead.
export const NOTABLE_MIN_POINTS = 10;

// Weekly positional finish cutoffs for grading a single performance, from
// the offense's point of view: [elite, good, mid, poor] — anything past the
// last is a dud. Reuses the matchup tier colors so a blue game against a
// defense reads the same as a blue "EASY" grade.
const FINISH_CUTOFFS = {
  QB: [5, 12, 20, 28],
  RB: [6, 24, 36, 48],
  WR: [6, 24, 36, 48],
  TE: [3, 12, 18, 24],
};
const PERFORMANCE_TIERS = ['easy', 'good', 'mid', 'hard', 'very_hard'];

function performanceTier(position, finish) {
  const cutoffs = FINISH_CUTOFFS[position];
  if (!cutoffs) return 'mid';
  const idx = cutoffs.findIndex((c) => finish <= c);
  return PERFORMANCE_TIERS[idx === -1 ? cutoffs.length : idx];
}

// Per-team drill-down for the Matchups tab: position -> team -> weeks
// (newest first), each with the players at that position who faced that
// defense, what they scored, and where that finished among every player at
// the position that week (e.g. QB4). Same `upToWeek` cutoff as
// computeMatchupStats. `namesById` maps player_id -> name, and
// `offenseByWeekTeam` maps "week|defense" -> the team they played, so each
// line can say who the player suited up for. QB rows should carry
// `pass_att` so the starter can be picked out.
export function computeMatchupHistory(weekStatsRows, upToWeek, namesById, offenseByWeekTeam) {
  const grouped = new Map(); // "position|team|week" -> [{ playerId, points, passAtt }]
  const pointsByPositionWeek = new Map(); // "position|week" -> [points], for finishes
  for (const row of weekStatsRows) {
    if (!row.position) continue;
    if (upToWeek != null && row.week >= upToWeek) continue;
    const points = row.fantasy_points || 0;
    const pwKey = `${row.position}|${row.week}`;
    const all = pointsByPositionWeek.get(pwKey) || [];
    all.push(points);
    pointsByPositionWeek.set(pwKey, all);

    if (!row.opponent) continue;
    const key = `${row.position}|${row.opponent}|${row.week}`;
    const list = grouped.get(key) || [];
    list.push({ playerId: row.player_id, points, passAtt: Number(row.pass_att) || 0 });
    grouped.set(key, list);
  }
  for (const all of pointsByPositionWeek.values()) all.sort((a, b) => b - a);

  const history = {};
  for (const [key, list] of grouped) {
    const [position, team, weekStr] = key.split('|');
    const week = Number(weekStr);
    list.sort((a, b) => b.points - a.points);
    // QBs: just the starter — whoever threw the most passes, so a backup
    // who mopped up (or a starter knocked out early) doesn't misattribute
    // the game. Others: only the notable games, but always keep the top
    // scorer so a stifling week doesn't just vanish.
    const shown = position === 'QB'
      ? [list.reduce((best, p) => (p.passAtt > best.passAtt ? p : best), list[0])]
      : list.filter((p, i) => i === 0 || p.points >= NOTABLE_MIN_POINTS);
    const weekPoints = pointsByPositionWeek.get(`${position}|${week}`) || [];
    const players = shown.map((p) => {
      const finish = weekPoints.indexOf(p.points) + 1;
      return {
        name: namesById[p.playerId] || 'Unknown',
        points: Math.round(p.points * 10) / 10,
        finish,
        tier: performanceTier(position, finish),
      };
    });
    ((history[position] ??= {})[team] ??= []).push({
      week,
      offense: offenseByWeekTeam[`${week}|${team}`] || null,
      players,
    });
  }
  for (const teams of Object.values(history)) {
    for (const weeks of Object.values(teams)) weeks.sort((a, b) => b.week - a.week);
  }
  return history;
}
