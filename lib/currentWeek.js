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
