// Derives the "active" NFL week from a list of season_games rows (same
// algorithm already used client-side in app/picks/page.js) — the week of
// whichever game is currently in progress, else the week of the next
// upcoming kickoff, else week 1. Callers fetch season_games themselves
// (ordered by kickoff_at) and pass the array in; this is a pure function so
// it works the same whether the games came from the public page or a
// creator-only editor.
export function getCurrentWeekFromGames(games) {
  const inProgress = (games || []).find((g) => g.status === "in_progress");
  if (inProgress) return inProgress.week;
  const now = Date.now();
  const upcoming = (games || []).find((g) => g.kickoff_at && new Date(g.kickoff_at).getTime() > now);
  return upcoming ? upcoming.week : 1;
}

// Same idea as getCurrentWeekFromGames, but for displays that should hold on
// the old week through the last game rather than flipping ahead as soon as
// this week's final kickoff time has passed — e.g. Matchups' "next matchup"
// column, which should still show this week's games until the following
// week's own Tuesday morning, not swap the instant Monday Night Football
// kicks off. Driven by each week's actual earliest kickoff (not a fixed
// 7-day assumption), so it holds up against bye weeks or schedule quirks —
// a week becomes "active" at ~4am ET on the Tuesday on/before its first game.
export function getTuesdayResetWeek(games, now = new Date()) {
  const byWeek = new Map();
  for (const g of games || []) {
    if (!g.kickoff_at) continue;
    const kickoff = new Date(g.kickoff_at);
    const existing = byWeek.get(g.week);
    if (!existing || kickoff < existing) byWeek.set(g.week, kickoff);
  }

  let active = null;
  for (const [week, earliestKickoff] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    const day = earliestKickoff.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceTuesday = (day - 2 + 7) % 7;
    const weekStart = new Date(earliestKickoff);
    weekStart.setUTCDate(earliestKickoff.getUTCDate() - daysSinceTuesday);
    weekStart.setUTCHours(8, 0, 0, 0); // ~4am ET
    if (now >= weekStart) active = week;
  }
  return active ?? 1;
}
