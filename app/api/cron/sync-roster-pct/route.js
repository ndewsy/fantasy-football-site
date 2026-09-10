import { createClient } from '@supabase/supabase-js';
import { normalizePlayerName } from '@/lib/normalizePlayerName';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// ESPN has no free API for "% rostered by league size" — nothing does, we
// checked. This is ESPN's real platform-wide ownership average across all
// their leagues (any size), pulled via their undocumented fantasy API.
// The league ID below is just a long-lived public league used to reach the
// endpoint — its own rosters are irrelevant, we only read the global
// ownership stats it exposes.
const ESPN_LEAGUE_ID = 42654852;
const SEASON = 2026;

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let espnPlayers;
  try {
    const res = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}?view=kona_player_info`,
      {
        headers: {
          'X-Fantasy-Filter': JSON.stringify({
            players: {
              limit: 3000,
              sortPercOwned: { sortAsc: false, sortPriority: 1 },
              filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`002${SEASON}`] },
            },
          }),
        },
      }
    );
    if (!res.ok) throw new Error(`ESPN request failed: ${res.status}`);
    const body = await res.json();
    espnPlayers = body.players || [];
  } catch (err) {
    console.error('[sync-roster-pct] ESPN fetch failed:', err);
    return Response.json({ error: err.message }, { status: 502 });
  }

  const { data: dbPlayers, error: fetchError } = await supabase().from('players').select('id, name');
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const byNorm = new Map();
  for (const p of dbPlayers || []) {
    const n = normalizePlayerName(p.name);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }

  let unmatched = 0;
  let ambiguous = 0;
  // Keyed by our player id, not pushed to an array directly — ESPN's feed
  // can list the same player more than once (e.g. a mid-season team change),
  // and a batched upsert errors if the same row appears twice in one
  // statement. Last entry wins, which is fine since duplicates share the
  // same underlying ownership stat anyway.
  const updatesById = new Map();
  for (const entry of espnPlayers) {
    const p = entry.player;
    const pct = p?.ownership?.percentOwned;
    if (!p?.fullName || pct === undefined || pct === null) continue;

    const candidates = byNorm.get(normalizePlayerName(p.fullName)) || [];
    if (candidates.length === 0) { unmatched++; continue; }
    if (candidates.length > 1) { ambiguous++; continue; } // same-name collision — skip rather than guess

    updatesById.set(candidates[0].id, { id: candidates[0].id, percent_rostered: pct });
  }
  const updates = [...updatesById.values()];

  // Batched upsert (only touches the id/percent_rostered columns given here,
  // leaves every other players column alone) instead of one round-trip per
  // player — a few hundred sequential awaited updates risks the function
  // running past Vercel's execution time limit.
  let updated = 0;
  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const { error: upsertError } = await supabase()
      .from('players')
      .upsert(chunk, { onConflict: 'id' });
    if (upsertError) {
      console.error('[sync-roster-pct] batch upsert failed:', upsertError);
      return Response.json({ error: upsertError.message }, { status: 500 });
    }
    updated += chunk.length;
  }

  console.log(`[sync-roster-pct] fetched=${espnPlayers.length} updated=${updated} unmatched=${unmatched} ambiguous=${ambiguous}`);
  return Response.json({ ok: true, fetched: espnPlayers.length, updated, unmatched, ambiguous });
}
