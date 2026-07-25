import { createClient } from '@supabase/supabase-js';

let _sb;
const sb = () => (_sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const normalize = s => s.toLowerCase().trim().replace(/\s+/g, ' ');

export async function syncPlayers() {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  const raw = await res.json();

  const active = Object.values(raw).filter(
    p => p.active && POSITIONS.has(p.position) && p.team
  );

  // Fetch existing manual players (no sleeper_id yet) to bridge them instead of duplicating
  const { data: manualPlayers, error: fetchErr } = await sb()
    .from('players')
    .select('id, name, position')
    .is('sleeper_id', null);
  if (fetchErr) throw fetchErr;

  const manualMap = new Map(
    (manualPlayers || []).map(p => [`${normalize(p.name)}|${p.position}`, p.id])
  );

  const now = new Date().toISOString();
  const toBridge = [];
  const toUpsert = [];

  for (const p of active) {
    const name = (p.full_name || `${p.first_name || ''} ${p.last_name || ''}`).trim();
    if (!name) continue;
    const key = `${normalize(name)}|${p.position}`;

    if (manualMap.has(key)) {
      // Stamp existing manual player with their Sleeper ID instead of creating a duplicate
      toBridge.push({
        id: manualMap.get(key),
        sleeper_id: p.player_id,
        team: p.team,
        status: p.status || null,
        source: 'sleeper',
        last_synced_at: now,
      });
    } else {
      toUpsert.push({
        name,
        position: p.position,
        team: p.team,
        status: p.status || null,
        sleeper_id: p.player_id,
        source: 'sleeper',
        last_synced_at: now,
      });
    }
  }

  for (const { id, ...updates } of toBridge) {
    const { error } = await sb().from('players').update(updates).eq('id', id);
    if (error) console.error('[syncPlayers] bridge error for id', id, error);
  }

  const BATCH = 500;
  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const { error } = await sb()
      .from('players')
      .upsert(toUpsert.slice(i, i + BATCH), { onConflict: 'sleeper_id' });
    if (error) throw error;
  }

  return { bridged: toBridge.length, upserted: toUpsert.length, total: active.length };
}
