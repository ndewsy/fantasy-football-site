// Converts Vegas player-prop lines into a projected fantasy point total.
// Standard scoring conventions: 1pt/25 pass yds, 1pt/10 rush or rec yds,
// 6pts rush/rec TD, 4pts pass TD. Receptions vary by format.
export const SCORING_FORMATS = ["ppr", "half_ppr", "standard"];

const RECEPTION_POINTS = { ppr: 1, half_ppr: 0.5, standard: 0 };

const STAT_WEIGHTS = {
  passing_yards: 1 / 25,
  passing_touchdowns: 4,
  rushing_yards: 1 / 10,
  rushing_touchdowns: 6,
  receiving_yards: 1 / 10,
  receiving_touchdowns: 6,
};

const NON_PASSING_TD_POINTS = 6;

// Anytime-TD lines store the DraftKings implied probability of >=1 TD, not
// a count — touchdowns are a rare, binary-ish event, so a straight P(>=1)
// understates expected value (it ignores multi-TD games). Assuming TDs land
// as a Poisson process, P(>=1) = 1 - e^-lambda, so lambda = -ln(1 - P(>=1))
// recovers the actual expected TD count, which is what variance-aware
// projections should be built on instead of the raw probability.
export function expectedTdsFromProbability(prob) {
  const p = Math.min(Math.max(prob, 0), 0.995);
  return -Math.log(1 - p);
}

export function statPoints(statId, line, scoring) {
  if (statId === "receiving_receptions") return line * (RECEPTION_POINTS[scoring] ?? 1);
  if (statId === "anytime_touchdowns") return expectedTdsFromProbability(line) * NON_PASSING_TD_POINTS;
  const weight = STAT_WEIGHTS[statId];
  return weight ? line * weight : 0;
}

const STAT_LABELS = {
  passing_yards: "Pass Yds",
  passing_touchdowns: "Pass TDs",
  rushing_yards: "Rush Yds",
  rushing_touchdowns: "Rush TDs",
  receiving_yards: "Rec Yds",
  receiving_touchdowns: "Rec TDs",
  receiving_receptions: "Receptions",
  anytime_touchdowns: "Anytime TD",
};
export { STAT_LABELS };

// Fixed display order so two players being compared always line up row for
// row (Receptions across from Receptions, etc.) instead of each card
// ordering its own stats by whatever order they happened to load in.
const STAT_ORDER = [
  "passing_yards",
  "passing_touchdowns",
  "rushing_yards",
  "rushing_touchdowns",
  "receiving_yards",
  "receiving_receptions",
  "receiving_touchdowns",
  "anytime_touchdowns",
];

// lines: array of { stat_id, line, over_odds, source? }. source defaults to
// "market" (a real Vegas line) — buildProjectionLines below tags the ones it
// synthesizes from season averages as "estimated" instead.
export function computeProjection(lines, scoring) {
  const breakdown = lines.map((l) => {
    const line = Number(l.line);
    return {
      statId: l.stat_id,
      label: STAT_LABELS[l.stat_id] || l.stat_id,
      line,
      // Anytime-TD lines store a probability (0-1) rather than a stat count
      // — show it as a percentage instead of a raw decimal like "0.38".
      display: l.stat_id === "anytime_touchdowns" ? `${Math.round(line * 100)}%` : String(line),
      overOdds: l.over_odds,
      source: l.source || "market",
      points: Math.round(statPoints(l.stat_id, line, scoring) * 100) / 100,
    };
  });
  breakdown.sort((a, b) => {
    const ai = STAT_ORDER.indexOf(a.statId);
    const bi = STAT_ORDER.indexOf(b.statId);
    return (ai === -1 ? STAT_ORDER.length : ai) - (bi === -1 ? STAT_ORDER.length : bi);
  });
  const total = Math.round(breakdown.reduce((sum, b) => sum + b.points, 0) * 100) / 100;
  return { total, breakdown };
}

// Stats a position's projection should normally include. Drives both what
// buildProjectionLines below tries to estimate when the market hasn't
// posted a line, and marketCompleteness (how much of that profile is real
// market data vs. an estimate).
const EXPECTED_STATS_BY_POSITION = {
  QB: ["passing_yards", "passing_touchdowns"],
  RB: ["rushing_yards", "receiving_yards", "receiving_receptions", "anytime_touchdowns"],
  WR: ["receiving_yards", "receiving_receptions", "anytime_touchdowns"],
  TE: ["receiving_yards", "receiving_receptions", "anytime_touchdowns"],
};

// Maps a prop stat_id to the matching key in player_season_stats.stats —
// the two tables predate each other and settled on different naming.
const SEASON_STAT_KEYS = {
  passing_yards: "pass_yd",
  passing_touchdowns: "pass_td",
  rushing_yards: "rush_yd",
  receiving_yards: "rec_yd",
  receiving_receptions: "rec",
};

// Same idea as buildProjectionLines below, for one stat: last season's
// per-game rate as a stand-in for a market line that hasn't posted. Returns
// null (not 0) when there's nothing to base an estimate on, so callers can
// tell "estimated at zero" apart from "no history to estimate from at all."
function estimateFromSeasonStats(statId, seasonStats) {
  const gp = seasonStats?.games_played;
  if (!gp || gp <= 0) return null;
  const stats = seasonStats.stats || {};
  if (statId === "anytime_touchdowns") {
    const tds = (Number(stats.rush_td) || 0) + (Number(stats.rec_td) || 0);
    // Inverse of expectedTdsFromProbability — same Poisson assumption, run
    // backwards from a per-game TD rate to the equivalent "P(>=1 TD)" a
    // market line would show, so it flows through statPoints identically.
    return 1 - Math.exp(-(tds / gp));
  }
  const key = SEASON_STAT_KEYS[statId];
  const raw = key ? stats[key] : undefined;
  if (raw === undefined || raw === null) return null;
  // Rounded here (not just at display time) — a per-game division has no
  // real precision past 1 decimal, and an unrounded value would carry
  // through into the points math and the breakdown row's displayed line.
  return Math.round((Number(raw) / gp) * 10) / 10;
}

// The actual "most accurate available" projection: real market lines where
// they exist, last season's per-game rate for whatever's still missing (rate
// stats, so a rookie or part-season player with games_played is still fair
// game), each stat tagged with where its number came from. Whatever's left
// after both passes has no real basis for a number at all and is reported
// separately rather than guessed at — a fabricated figure would look exactly
// as authoritative as a real one, which is worse than an honest gap.
export function buildProjectionLines(position, marketLines, seasonStats) {
  const expected = EXPECTED_STATS_BY_POSITION[position] || [];
  const present = new Set(marketLines.map((l) => l.stat_id));
  const lines = marketLines.map((l) => ({ ...l, source: "market" }));
  const noDataStats = [];

  for (const statId of expected) {
    if (present.has(statId)) continue;
    const estimate = estimateFromSeasonStats(statId, seasonStats);
    if (estimate === null) {
      noDataStats.push(statId);
      continue;
    }
    lines.push({ stat_id: statId, line: estimate, over_odds: null, under_odds: null, source: "estimated" });
  }

  // Fraction of this position's expected stat profile backed by a real
  // market line — lets computeConfidence tell "confident because the market
  // agrees" apart from "confident because we guessed in the same direction
  // twice."
  const marketCompleteness = expected.length > 0
    ? expected.filter((statId) => present.has(statId)).length / expected.length
    : 1;

  return {
    lines,
    noDataLabels: noDataStats.map((statId) => STAT_LABELS[statId] || statId),
    marketCompleteness,
  };
}

// How confident a start/sit recommendation should feel, as a 50-99% score.
// 50% when the two projections are dead even (a genuine toss-up), scaling up
// toward 99% as the gap grows relative to the size of the projections
// themselves — a 5-point gap between two ~10pt projections is a much
// stronger signal than the same 5-point gap between two ~30pt projections.
// completenessA/B (0-1, fraction of the projection backed by real market
// lines rather than season-average estimates) dampen that toward 50 — a big
// gap is a much weaker signal when one side of it is mostly a guess.
export function computeConfidence(totalA, totalB, completenessA = 1, completenessB = 1) {
  const avg = (totalA + totalB) / 2;
  if (avg <= 0) return 50;
  const diff = Math.abs(totalA - totalB);
  const rawPct = 50 + (diff / avg) * 100;
  const dataQuality = Math.min(completenessA, completenessB);
  const pct = 50 + (rawPct - 50) * dataQuality;
  return Math.round(Math.min(99, Math.max(50, pct)));
}

// Same scoring weights, applied to actual final stats (e.g. from a season
// stat line) instead of a Vegas prop line. Always full PPR, matching the
// "previous season" stats shown on player cards.
export function fantasyPointsFromRealStats({ passYd = 0, passTd = 0, rushYd = 0, rushTd = 0, recYd = 0, recTd = 0, rec = 0 }) {
  const total =
    statPoints("passing_yards", passYd, "ppr") +
    statPoints("passing_touchdowns", passTd, "ppr") +
    statPoints("rushing_yards", rushYd, "ppr") +
    statPoints("rushing_touchdowns", rushTd, "ppr") +
    statPoints("receiving_yards", recYd, "ppr") +
    statPoints("receiving_touchdowns", recTd, "ppr") +
    statPoints("receiving_receptions", rec, "ppr");
  return Math.round(total * 100) / 100;
}
