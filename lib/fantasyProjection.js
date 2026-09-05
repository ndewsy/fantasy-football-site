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

// lines: array of { stat_id, line, over_odds, ... }
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
      points: Math.round(statPoints(l.stat_id, line, scoring) * 100) / 100,
    };
  });
  const total = Math.round(breakdown.reduce((sum, b) => sum + b.points, 0) * 100) / 100;
  return { total, breakdown };
}

// Stats a position normally has lines posted for, once a book has gotten to
// that player's game. Used to flag a projection as partial when the market
// just hasn't posted one of them yet, rather than silently understating the
// total relative to a player whose props are fully posted.
const EXPECTED_STATS_BY_POSITION = {
  QB: ["passing_yards", "passing_touchdowns"],
  RB: ["rushing_yards", "receiving_yards", "receiving_receptions", "anytime_touchdowns"],
  WR: ["receiving_yards", "receiving_receptions", "anytime_touchdowns"],
  TE: ["receiving_yards", "receiving_receptions", "anytime_touchdowns"],
};

// lines: the same array passed to computeProjection. Returns labels for any
// normally-posted stat that's still missing (e.g. ["Receptions"]).
export function missingStatLabels(position, lines) {
  const expected = EXPECTED_STATS_BY_POSITION[position] || [];
  const present = new Set(lines.map((l) => l.stat_id));
  return expected.filter((statId) => !present.has(statId)).map((statId) => STAT_LABELS[statId] || statId);
}

// How confident a start/sit recommendation should feel, as a 50-99% score.
// 50% when the two projections are dead even (a genuine toss-up), scaling up
// toward 99% as the gap grows relative to the size of the projections
// themselves — a 5-point gap between two ~10pt projections is a much
// stronger signal than the same 5-point gap between two ~30pt projections.
export function computeConfidence(totalA, totalB) {
  const avg = (totalA + totalB) / 2;
  if (avg <= 0) return 50;
  const diff = Math.abs(totalA - totalB);
  const pct = 50 + (diff / avg) * 100;
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
