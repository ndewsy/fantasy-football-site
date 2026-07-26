import { createClient } from '@supabase/supabase-js';

let _sb;
const sb = () => (_sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// ESPN uses different abbreviations for a handful of teams
const ESPN_TO_OUR = { WSH: 'WAS' };
const norm = abbr => ESPN_TO_OUR[abbr] ?? abbr;

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors = [];
  let synced = 0;
  let skippedWeeks = 0;

  for (let week = 1; week <= 18; week++) {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=2026`
    );
    if (!res.ok) {
      errors.push({ week, error: `ESPN returned ${res.status}` });
      continue;
    }
    const data = await res.json();

    // Reject the entire week if ESPN isn't actually serving 2026 data.
    // When the 2026 season isn't published yet, ESPN returns season.year=2025.
    if (data.season?.year !== 2026) {
      console.log(`[sync-scores] week ${week}: ESPN returned season.year=${data.season?.year}, expected 2026 — skipping`);
      skippedWeeks++;
      continue;
    }

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) {
        errors.push({ event: event.id, week, error: 'no competition in event' });
        continue;
      }
      const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
      const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
      if (!homeComp || !awayComp) {
        errors.push({ event: event.id, week, error: 'missing home or away competitor' });
        continue;
      }
      const isFinal = comp.status?.type?.completed ?? false;
      const homeAbbr = norm(homeComp.team.abbreviation);
      const awayAbbr = norm(awayComp.team.abbreviation);

      // Try matching by espn_event_id first
      let { data: game } = await sb()
        .from('season_games')
        .select('id, espn_event_id')
        .eq('espn_event_id', event.id)
        .maybeSingle();

      // First-run fallback: match by week + teams, then stamp the event ID
      if (!game) {
        const { data: matched } = await sb()
          .from('season_games')
          .select('id, espn_event_id')
          .eq('week', week)
          .eq('home_team', homeAbbr)
          .eq('away_team', awayAbbr)
          .is('espn_event_id', null)
          .maybeSingle();
        game = matched;
      }

      if (!game) {
        errors.push({ event: event.id, week, teams: `${awayAbbr}@${homeAbbr}`, error: 'no matching row' });
        continue;
      }

      const updates = {
        home_score:  isFinal ? Number(homeComp.score) : null,
        away_score:  isFinal ? Number(awayComp.score) : null,
        status:      isFinal ? 'final'
                     : comp.status?.type?.state === 'in' ? 'in_progress'
                     : 'scheduled',
        winner:      isFinal
                     ? (Number(homeComp.score) > Number(awayComp.score) ? 'home' : 'away')
                     : null,
        ...(game.espn_event_id ? {} : { espn_event_id: event.id }),
      };

      const { error } = await sb().from('season_games').update(updates).eq('id', game.id);
      if (error) errors.push({ event: event.id, error: error.message });
      else synced++;
    }
  }

  console.log(`[sync-scores] synced=${synced} skippedWeeks=${skippedWeeks} errors=${errors.length}`);
  return Response.json({ synced, skippedWeeks, errors });
}
