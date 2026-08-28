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

export function statPoints(statId, line, scoring) {
  if (statId === "receiving_receptions") return line * (RECEPTION_POINTS[scoring] ?? 1);
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
};
export { STAT_LABELS };

// lines: array of { stat_id, line, over_odds, ... }
export function computeProjection(lines, scoring) {
  const breakdown = lines.map((l) => ({
    statId: l.stat_id,
    label: STAT_LABELS[l.stat_id] || l.stat_id,
    line: Number(l.line),
    overOdds: l.over_odds,
    points: Math.round(statPoints(l.stat_id, Number(l.line), scoring) * 100) / 100,
  }));
  const total = Math.round(breakdown.reduce((sum, b) => sum + b.points, 0) * 100) / 100;
  return { total, breakdown };
}
