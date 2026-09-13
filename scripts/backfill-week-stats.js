// One-off backfill of historical per-week player stats from Sleeper, so the
// Start/Sit rookie-debut fallback (lib/fantasyProjection.js) has real
// historical rookie debut-game performances to average, not just this
// season going forward via the sync-week-stats cron.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/backfill-week-stats.js
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SEASONS = [2023, 2024, 2025];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const SEASON_TYPE = "regular";
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

function extractStats(raw) {
  return {
    pass_att: raw.pass_att ?? 0,
    pass_cmp: raw.pass_cmp ?? 0,
    pass_yd: raw.pass_yd ?? 0,
    pass_td: raw.pass_td ?? 0,
    pass_int: raw.pass_int ?? 0,
    rush_att: raw.rush_att ?? 0,
    rush_yd: raw.rush_yd ?? 0,
    rush_td: raw.rush_td ?? 0,
    rec: raw.rec ?? 0,
    rec_tgt: raw.rec_tgt ?? 0,
    rec_yd: raw.rec_yd ?? 0,
    rec_td: raw.rec_td ?? 0,
  };
}

// Mirrors lib/fantasyProjection.js's fantasyPointsFromRealStats (full PPR) —
// duplicated here rather than imported since this is a plain CommonJS script
// (see scripts/import-players.js for the same convention).
function fantasyPoints(s) {
  return (
    s.pass_yd / 25 + s.pass_td * 4 +
    s.rush_yd / 10 + s.rush_td * 6 +
    s.rec_yd / 10 + s.rec_td * 6 + s.rec
  );
}

async function main() {
  const players = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("players")
      .select("id, sleeper_id")
      .not("sleeper_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    players.push(...data);
    if (data.length < PAGE) break;
  }
  const playerIdBySleeperId = Object.fromEntries(players.map((p) => [p.sleeper_id, p.id]));
  console.log(`Loaded ${players.length} players with a sleeper_id.`);

  let totalUpserted = 0;
  for (const season of SEASONS) {
    for (const week of WEEKS) {
      const res = await fetch(`https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=${SEASON_TYPE}`);
      if (!res.ok) {
        console.error(`  season ${season} week ${week}: fetch failed (${res.status}), skipping`);
        continue;
      }
      const entries = await res.json();

      const rows = entries
        .filter((e) => FANTASY_POSITIONS.has(e.player?.position) && (e.stats?.gp ?? 0) > 0 && playerIdBySleeperId[e.player_id])
        .map((e) => {
          const s = extractStats(e.stats || {});
          return {
            player_id: playerIdBySleeperId[e.player_id],
            season,
            week,
            season_type: SEASON_TYPE,
            position: e.player.position,
            stats: s,
            fantasy_points: fantasyPoints(s),
            updated_at: new Date().toISOString(),
          };
        });

      if (rows.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const { error } = await supabase
            .from("player_week_stats")
            .upsert(rows.slice(i, i + BATCH), { onConflict: "player_id,season,week,season_type" });
          if (error) throw error;
        }
        totalUpserted += rows.length;
      }
      console.log(`  season ${season} week ${week}: ${rows.length} rows`);
    }
  }

  console.log(`Done. Upserted ${totalUpserted} player_week_stats rows total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
