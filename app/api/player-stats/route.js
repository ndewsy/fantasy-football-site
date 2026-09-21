import { createClient } from '@supabase/supabase-js';
import { fantasyPointsFromRealStats } from '@/lib/fantasyProjection';
import { computeMatchupStats } from '@/lib/matchupStrength';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
// Matches the constant in app/api/cron/sync-week-stats/route.js.
const CURRENT_SEASON = 2026;
// Years with real player_week_stats coverage (2023-2025 backfilled via
// scripts/backfill-week-stats.js, 2026 ongoing via the weekly cron).
const AVAILABLE_SEASONS = [2026, 2025, 2024, 2023];
const TOTAL_WEEKS = 18;

function statsFantasyPoints(s) {
  return fantasyPointsFromRealStats({
    passYd: s.pass_yd, passTd: s.pass_td,
    rushYd: s.rush_yd, rushTd: s.rush_td,
    recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec,
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  if (!playerId) return Response.json({ error: 'playerId is required' }, { status: 400 });
  const requestedSeason = Number(searchParams.get('season'));
  const season = AVAILABLE_SEASONS.includes(requestedSeason) ? requestedSeason : CURRENT_SEASON;
  const numericPlayerId = Number(playerId);

  const [playerResult, weekStatsResult] = await Promise.all([
    supabase().from('players').select('team').eq('id', playerId).maybeSingle(),
    supabase()
      .from('player_week_stats')
      .select('week, position, stats, opponent')
      .eq('player_id', playerId)
      .eq('season', season)
      .eq('season_type', 'regular')
      .order('week', { ascending: true }),
  ]);

  if (weekStatsResult.error) return Response.json({ error: weekStatsResult.error.message }, { status: 500 });

  const rowsByWeek = new Map((weekStatsResult.data || []).map((r) => [r.week, r]));
  const position = weekStatsResult.data?.[0]?.position || null;

  // The current season's real schedule (opponent/home-away for *every*
  // week, including ones that haven't happened yet, plus real bye weeks) —
  // only available for the season in progress; season_games has no year
  // column of its own and always reflects "this season," so it can't tell
  // us a past year's schedule.
  const scheduleByWeek = new Map();
  if (season === CURRENT_SEASON) {
    const { data: games, error: gamesError } = await supabase()
      .from('season_games')
      .select('week, home_team, away_team');
    if (gamesError) return Response.json({ error: gamesError.message }, { status: 500 });
    const team = playerResult.data?.team;
    for (const g of games || []) {
      if (g.home_team === team) scheduleByWeek.set(g.week, { opponent: g.away_team, homeAway: 'home' });
      else if (g.away_team === team) scheduleByWeek.set(g.week, { opponent: g.home_team, homeAway: 'away' });
    }
  }

  // One query for the whole position/season (every player, every week) —
  // drives both each week's positional finish and, summed per player, the
  // season-long positional finish, rather than a separate query for each.
  const weeklyRankRows = new Map(); // week -> [{player_id, points}]
  const seasonTotalsByPlayer = new Map(); // player_id -> points
  // Every player-week row at this position, reshaped for
  // computeMatchupStats — reused below to grade each game-log week's
  // opponent the same way the Matchups tab does, just re-run per week so
  // week W's grade only ever reflects weeks 1..W-1 (see lib/matchupStrength.js).
  const positionWeekStatsForMatchup = [];
  if (position) {
    const { data: positionRows, error: positionError } = await supabase()
      .from('player_week_stats')
      .select('player_id, week, stats, opponent')
      .eq('season', season)
      .eq('season_type', 'regular')
      .eq('position', position);
    if (positionError) return Response.json({ error: positionError.message }, { status: 500 });

    for (const row of positionRows || []) {
      const points = statsFantasyPoints(row.stats || {});
      if (!weeklyRankRows.has(row.week)) weeklyRankRows.set(row.week, []);
      weeklyRankRows.get(row.week).push({ player_id: row.player_id, points });
      seasonTotalsByPlayer.set(row.player_id, (seasonTotalsByPlayer.get(row.player_id) || 0) + points);
      positionWeekStatsForMatchup.push({ position, opponent: row.opponent, week: row.week, fantasy_points: points });
    }
    for (const list of weeklyRankRows.values()) list.sort((a, b) => b.points - a.points);
  }

  const gameLog = [];
  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    const row = rowsByWeek.get(week);
    const sched = scheduleByWeek.get(week);
    const isCurrentSeason = season === CURRENT_SEASON;
    const isBye = isCurrentSeason && !sched;
    const opponent = row?.opponent || sched?.opponent || null;
    const homeAway = sched?.homeAway || null;

    // Skip weeks with genuinely nothing to say about them — a past season
    // this player didn't have any row for beyond their real bye (already
    // covered above for the current season) isn't worth a blank row, and a
    // future current-season week we have no schedule entry for yet (rare,
    // schedule not seeded that far) is the same story.
    if (!row && !opponent && !isBye) continue;

    const hasStats = !!row;
    const stats = row?.stats || {};
    const fantasyPoints = hasStats ? Math.round(statsFantasyPoints(stats) * 100) / 100 : null;
    let positionalFinish = null;
    if (hasStats) {
      const weekRanked = weeklyRankRows.get(week) || [];
      const idx = weekRanked.findIndex((r) => r.player_id === numericPlayerId);
      positionalFinish = idx >= 0 ? idx + 1 : null;
    }

    // Graded from weeks 1..week-1 only, same as the Matchups tab — so this
    // reflects what was actually knowable entering that week, not a
    // look-ahead computed with data that didn't exist yet.
    let matchupTier = null;
    let matchupRank = null;
    if (opponent && position) {
      const statsThroughWeek = computeMatchupStats(positionWeekStatsForMatchup, week);
      const opponentStats = (statsThroughWeek[position] || []).find((t) => t.team === opponent);
      if (opponentStats) {
        matchupTier = opponentStats.tier;
        matchupRank = opponentStats.rank;
      }
    }

    gameLog.push({ week, opponent, homeAway, isBye, hasStats, stats, fantasyPoints, positionalFinish, matchupTier, matchupRank });
  }

  // Season totals + season-long positional finish, computed live from the
  // same weekly data rather than the separate (only ever synced for one
  // year) player_season_stats table — so every backfilled season works
  // identically, not just whichever one sync-season-stats last ran for.
  let seasonTotals = null;
  if (weekStatsResult.data?.length > 0) {
    const sums = {};
    for (const row of weekStatsResult.data) {
      for (const [k, v] of Object.entries(row.stats || {})) {
        sums[k] = (sums[k] || 0) + (Number(v) || 0);
      }
    }
    const fantasy_points = Math.round(
      weekStatsResult.data.reduce((sum, r) => sum + statsFantasyPoints(r.stats || {}), 0) * 100
    ) / 100;
    const sortedSeasonTotals = [...seasonTotalsByPlayer.entries()].sort((a, b) => b[1] - a[1]);
    const finishIdx = sortedSeasonTotals.findIndex(([pid]) => pid === numericPlayerId);
    seasonTotals = {
      season,
      position,
      games_played: weekStatsResult.data.length,
      stats: sums,
      fantasy_points,
      fantasy_finish: finishIdx >= 0 ? finishIdx + 1 : null,
    };
  }

  return Response.json({
    season,
    availableSeasons: AVAILABLE_SEASONS,
    seasonTotals,
    gameLog,
  });
}
