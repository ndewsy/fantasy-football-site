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

// Last-resort fallback for a stat with no market line AND no personal
// history at all (a true rookie) — the per-game rate a player at this
// position actually put up last season, averaged across every rostered
// player at the position (not just starters), computed once from
// player_season_stats via a one-off SQL query. Deliberately NOT an
// ADP-based guess (that would need a calibrated ADP-to-production model we
// don't have) — this is a real historical average, just a broader one than
// the player's own, so it's tagged "league_avg" and kept visibly distinct
// from a personal "estimated" line.
const LEAGUE_AVG_PER_GAME = {
  QB: { passing_yards: 135.7, passing_touchdowns: 0.832 },
  RB: { rushing_yards: 25.4, receiving_yards: 8.2, receiving_receptions: 1.1, anytime_touchdowns: 0.233 },
  WR: { receiving_yards: 23.6, receiving_receptions: 1.9, anytime_touchdowns: 0.148 },
  TE: { receiving_yards: 14.9, receiving_receptions: 1.5, anytime_touchdowns: 0.12 },
};

function leagueAverageEstimate(statId, position) {
  const rate = LEAGUE_AVG_PER_GAME[position]?.[statId];
  if (rate === undefined) return null;
  // anytime_touchdowns is stored as a per-game TD rate above (like the raw
  // stats.rush_td/rec_td counts elsewhere) — run it through the same
  // Poisson inversion as estimateFromSeasonStats so it lands on the same
  // "P(>=1 TD)" scale a market line or personal estimate would.
  if (statId === "anytime_touchdowns") return 1 - Math.exp(-rate);
  return Math.round(rate * 10) / 10;
}

// A true rookie's actual pro debut, not blended in with the whole league
// (dominated by established starters) — computed once from real historical
// data: every player_week_stats row where players.rookie_year matches that
// row's season, narrowed to each such player's earliest week that season
// (their real debut game), averaged by position. Confirmed materially lower
// than LEAGUE_AVG_PER_GAME across the board (e.g. WR debut anytime-TD rate
// 10.7% vs. the league-wide 14.8%; TE rookies scored zero debut-game TDs
// across all 53 sampled) — rookies in game one are a genuinely different
// population than the league as a whole, which is the whole point of this
// tier existing separately. Backfilled from the 2023-2025 seasons via
// scripts/backfill-week-stats.js; same "hardcoded snapshot, not a live
// query" precedent as LEAGUE_AVG_PER_GAME.
const ROOKIE_DEBUT_PER_GAME = {
  QB: { passing_yards: 95.4, passing_touchdowns: 0.208 },
  RB: { rushing_yards: 11.3, receiving_yards: 4.5, receiving_receptions: 0.8, anytime_touchdowns: 0.099 },
  WR: { receiving_yards: 13.3, receiving_receptions: 1.3, anytime_touchdowns: 0.107 },
  TE: { receiving_yards: 9.9, receiving_receptions: 1.0, anytime_touchdowns: 0 },
};

function rookieDebutEstimate(statId, position) {
  const rate = ROOKIE_DEBUT_PER_GAME[position]?.[statId];
  if (rate === undefined) return null;
  if (statId === "anytime_touchdowns") return 1 - Math.exp(-rate);
  return Math.round(rate * 10) / 10;
}

// The actual "most accurate available" projection: real market lines where
// they exist, last season's per-game rate for whatever's still missing (rate
// stats, so a part-season player with games_played is still fair game),
// then — for a stat with no personal history at all — either the
// rookie-debut average (a true rookie making their pro debut) or the
// position's league-wide average (a vet with no stats on file for some
// other reason, e.g. missed all of last season to injury — not a debut, so
// the broader league number is the honest comparison, not the rookie one).
// Either way every position's projection ends up covering the same
// categories as anyone else's rather than silently running shorter. Each
// stat is tagged with where its number came from. Whatever's left after
// every pass has no real basis for a number at all and is reported
// separately rather than guessed at — a fabricated figure would look
// exactly as authoritative as a real one, which is worse than an honest gap.
export function buildProjectionLines(position, marketLines, seasonStats, isRookie = false) {
  const expected = EXPECTED_STATS_BY_POSITION[position] || [];
  const present = new Set(marketLines.map((l) => l.stat_id));
  const lines = marketLines.map((l) => ({ ...l, source: "market" }));
  const noDataStats = [];

  for (const statId of expected) {
    if (present.has(statId)) continue;
    const estimate = estimateFromSeasonStats(statId, seasonStats);
    if (estimate !== null) {
      lines.push({ stat_id: statId, line: estimate, over_odds: null, under_odds: null, source: "estimated" });
      continue;
    }
    // Only reach for the rookie-debut number when there's no personal
    // history at all *and* this specific player is actually making their
    // pro debut — a vet with a gap in seasonStats isn't a debut situation,
    // so they fall straight through to the league average below instead.
    if (!seasonStats && isRookie) {
      const rookieDebut = rookieDebutEstimate(statId, position);
      if (rookieDebut !== null) {
        lines.push({ stat_id: statId, line: rookieDebut, over_odds: null, under_odds: null, source: "rookie_debut" });
        continue;
      }
    }
    const leagueAvg = leagueAverageEstimate(statId, position);
    if (leagueAvg === null) {
      noDataStats.push(statId);
      continue;
    }
    lines.push({ stat_id: statId, line: leagueAvg, over_odds: null, under_odds: null, source: "league_avg" });
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
