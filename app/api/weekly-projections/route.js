import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';

// How deep each position's default Weekly Rankings list goes. Sleeper calls
// team defenses "DEF"; this site stores them as "DST" (see lib/syncPlayers.js).
const DEPTH = { QB: 24, RB: 40, WR: 60, TE: 24, DST: 15, K: 24 };
const SLEEPER_POSITION = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', DST: 'DEF', K: 'K' };

// Default starting order for every creator's Weekly Rankings — Sleeper's own
// PPR projections for the week, so a creator reorders a premade list rather
// than typing every player in from a blank slate. Only used to seed a
// position that hasn't been saved yet; saved rankings always win.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const week = parseInt(searchParams.get('week'), 10);
  if (!Number.isInteger(week) || week < 1 || week > 18) {
    return Response.json({ error: 'a valid week is required' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({ season_type: SEASON_TYPE, order_by: 'pts_ppr' });
    for (const p of Object.values(SLEEPER_POSITION)) params.append('position[]', p);
    const res = await fetch(`https://api.sleeper.app/projections/nfl/${CURRENT_SEASON}/${week}?${params}`);
    if (!res.ok) throw new Error(`Sleeper projections error: ${res.status}`);
    const projections = await res.json();

    const bySleeperPosition = {};
    for (const e of projections) {
      const points = Number(e.stats?.pts_ppr);
      // No projection (bye week, ruled out) — not a default-list candidate.
      if (!e.player_id || !e.player?.position || !(points > 0)) continue;
      (bySleeperPosition[e.player.position] ??= []).push({ sleeperId: String(e.player_id), points });
    }

    const top = {};
    const sleeperIds = [];
    for (const [position, sleeperPosition] of Object.entries(SLEEPER_POSITION)) {
      const sorted = (bySleeperPosition[sleeperPosition] || []).sort((a, b) => b.points - a.points);
      top[position] = sorted.slice(0, DEPTH[position]);
      sleeperIds.push(...sorted.map((p) => p.sleeperId));
    }

    // Every projected player gets looked up, not just the top of each list —
    // the `projected` map below has to cover anyone a creator might rank.
    // Chunked so the .in() list stays well under URL length limits.
    const idBySleeperId = {};
    for (let i = 0; i < sleeperIds.length; i += 300) {
      const { data: players, error } = await supabase()
        .from('players')
        .select('id, sleeper_id')
        .in('sleeper_id', sleeperIds.slice(i, i + 300));
      if (error) throw error;
      for (const p of players || []) idBySleeperId[String(p.sleeper_id)] = p.id;
    }

    // Players Sleeper projects but who aren't in our players table yet (a
    // fresh call-up before the next player sync) are skipped, not errors.
    const positions = {};
    for (const [position, list] of Object.entries(top)) {
      positions[position] = list
        .filter((p) => idBySleeperId[p.sleeperId])
        .map((p) => ({ player_id: idBySleeperId[p.sleeperId], projected: Math.round(p.points * 10) / 10 }));
    }

    // player_id -> PPR projection for every projected player, for showing
    // projections beside rankings that go deeper than the default lists.
    const projected = {};
    for (const [sleeperPosition, list] of Object.entries(bySleeperPosition)) {
      if (!Object.values(SLEEPER_POSITION).includes(sleeperPosition)) continue;
      for (const p of list) {
        if (idBySleeperId[p.sleeperId]) projected[idBySleeperId[p.sleeperId]] = Math.round(p.points * 10) / 10;
      }
    }

    return Response.json({ week, positions, projected });
  } catch (err) {
    console.error('[/api/weekly-projections] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
