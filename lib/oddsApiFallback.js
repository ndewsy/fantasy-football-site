import { normalizePlayerName } from '@/lib/normalizePlayerName';

// Fallback prop/odds source for app/api/cron/sync-player-props, used only
// when SportsGameOdds' own request fails (e.g. the account is rate-limited
// or over its monthly object quota) — see that route for when this gets
// called. The Odds API charges "1 credit per region per market" for both
// endpoints below; player props are per-event (6 credits/event here), so a
// full fallback sync over a full week's slate can burn through a free-tier
// 500-credit/month budget in only a handful of runs. This is a resilience
// layer for SGO outages, not a permanent second primary source.
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';

// Full team name (as The Odds API returns it) -> this site's team code —
// same 32 codes already used in players.team everywhere else.
const TEAM_NAME_TO_CODE = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
};

// Mimics SportsGameOdds' own team-id format (e.g. "KANSAS_CITY_CHIEFS_NFL"),
// confirmed against real stored rows — every reader of team_id/opponent_id
// (e.g. PlayerCardModal's opponentLabelFor) already expects this exact
// shape, regardless of which provider actually filled a given row.
function teamNameToSgoStyleId(fullName) {
  return `${fullName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_NFL`;
}

// Odds API market key -> this site's stat_id vocabulary (player_prop_lines).
const MARKET_TO_STAT_ID = {
  player_pass_yds: 'passing_yards',
  player_pass_tds: 'passing_touchdowns',
  player_rush_yds: 'rushing_yards',
  player_reception_yds: 'receiving_yards',
  player_receptions: 'receiving_receptions',
};
const ANYTIME_TD_MARKET = 'player_anytime_td';
const ALL_MARKETS = [...Object.keys(MARKET_TO_STAT_ID), ANYTIME_TD_MARKET];

// Same math as sync-player-props/route.js's own copies — duplicated rather
// than shared since these are tiny and this module should stay usable
// on its own.
function americanOddsToProbability(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}
function probabilityToAmericanOdds(p) {
  if (!(p > 0) || !(p < 1)) return null;
  const odds = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The Odds API request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Same 9-day upcoming window as SGO's fetchUpcomingEvents.
async function fetchUpcomingEvents() {
  const now = Date.now();
  const until = now + 9 * 24 * 60 * 60 * 1000;
  const events = await fetchJson(`${ODDS_API_BASE}/events?apiKey=${process.env.ODDS_API_KEY}`);
  return events.filter((e) => {
    const t = new Date(e.commence_time).getTime();
    return t > now && t < until;
  });
}

// One call covers totals+spreads for every upcoming event at once — 2
// credits total (1 region x 2 markets), not per event.
async function fetchGameOdds() {
  const url = `${ODDS_API_BASE}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=totals,spreads&oddsFormat=american`;
  return fetchJson(url);
}

// Player props are per-event — 6 credits per event (1 region x 6 markets),
// the real cost driver of this fallback.
async function fetchPlayerProps(eventId) {
  const url = `${ODDS_API_BASE}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=${ALL_MARKETS.join(',')}&oddsFormat=american`;
  return fetchJson(url);
}

// Same "closest to a coin flip is the fairest single price" idea as SGO's
// fairestBook, against Odds API's bookmakers[].markets[].outcomes[] shape.
function fairestOverUnder(bookmakers, marketKey, playerName) {
  let best = null;
  let bestDist = Infinity;
  for (const bm of bookmakers || []) {
    const market = bm.markets?.find((m) => m.key === marketKey);
    const over = market?.outcomes?.find((o) => o.name === 'Over' && o.description === playerName);
    if (!over || over.point == null) continue;
    const prob = americanOddsToProbability(over.price);
    if (prob === null) continue;
    const dist = Math.abs(prob - 0.5);
    if (dist < bestDist) {
      bestDist = dist;
      const under = market.outcomes?.find((o) => o.name === 'Under' && o.description === playerName);
      best = { overOdds: over.price, underOdds: under?.price ?? null, line: over.point };
    }
  }
  return best;
}

// Same idea for the Yes/No anytime-TD market — blend every book's implied
// probability rather than picking one, same as SGO's blendedProbability.
function blendedAnytimeTdProbability(bookmakers, playerName) {
  const probs = [];
  for (const bm of bookmakers || []) {
    const market = bm.markets?.find((m) => m.key === ANYTIME_TD_MARKET);
    const yes = market?.outcomes?.find((o) => o.name === 'Yes' && o.description === playerName);
    const prob = yes ? americanOddsToProbability(yes.price) : null;
    if (prob !== null) probs.push(prob);
  }
  if (probs.length === 0) return null;
  return probs.reduce((a, b) => a + b, 0) / probs.length;
}

// Builds the same lineRows/gameLineRows/unmatchedRows shapes the SGO path
// produces (see sync-player-props/route.js), so the route's upsert logic
// runs identically regardless of which provider actually supplied them.
// `byNorm` is the same normalized-name -> players[] map the SGO path
// already builds from the players table.
export async function fetchOddsApiRows(byNorm) {
  const events = await fetchUpcomingEvents();
  const gameOddsByEventId = new Map((await fetchGameOdds()).map((g) => [g.id, g]));

  const lineRowsByKey = new Map();
  const gameLineRows = [];
  const unmatchedRows = [];
  let skippedNoLine = 0;
  let propsFetchFailures = 0;

  for (const event of events) {
    const homeCode = TEAM_NAME_TO_CODE[event.home_team];
    const awayCode = TEAM_NAME_TO_CODE[event.away_team];
    if (!homeCode || !awayCode) continue; // unrecognized team name — skip rather than guess

    const homeId = teamNameToSgoStyleId(event.home_team);
    const awayId = teamNameToSgoStyleId(event.away_team);
    const gameStartsAt = event.commence_time;
    const eventId = `oddsapi:${event.id}`;

    const lineEvent = gameOddsByEventId.get(event.id);
    let gameTotal = null;
    let homeSpread = null;
    for (const bm of lineEvent?.bookmakers || []) {
      if (gameTotal === null) {
        gameTotal = bm.markets?.find((m) => m.key === 'totals')?.outcomes?.find((o) => o.name === 'Over')?.point ?? null;
      }
      if (homeSpread === null) {
        homeSpread = bm.markets?.find((m) => m.key === 'spreads')?.outcomes?.find((o) => o.name === event.home_team)?.point ?? null;
      }
      if (gameTotal !== null && homeSpread !== null) break;
    }
    const homeTeamTotal = gameTotal !== null && homeSpread !== null ? (gameTotal - homeSpread) / 2 : null;
    const awayTeamTotal = gameTotal !== null && homeTeamTotal !== null ? gameTotal - homeTeamTotal : null;
    if (gameTotal !== null || homeTeamTotal !== null || awayTeamTotal !== null) {
      gameLineRows.push({
        sgo_event_id: eventId,
        home_team_id: homeId,
        away_team_id: awayId,
        game_total: gameTotal,
        home_team_total: homeTeamTotal,
        away_team_total: awayTeamTotal,
        game_starts_at: gameStartsAt,
        updated_at: new Date().toISOString(),
      });
    }

    let propsData;
    try {
      propsData = await fetchPlayerProps(event.id);
    } catch (err) {
      propsFetchFailures++;
      console.error(`[oddsApiFallback] props fetch failed for ${event.away_team} @ ${event.home_team}:`, err.message);
      continue; // one bad event shouldn't sink the whole sync
    }
    const bookmakers = propsData.bookmakers || [];

    const pushLine = (playerName, statId, line, overOdds, underOdds) => {
      const n = normalizePlayerName(playerName);
      const candidates = byNorm.get(n) || [];
      // Odds API's props payload doesn't say which team a player is on —
      // narrow an otherwise-ambiguous name to whichever candidate actually
      // plays in this game, same spirit as SGO's own team-scoped matching.
      const onThisGame = candidates.filter((c) => c.team === homeCode || c.team === awayCode);
      const match = onThisGame.length === 1 ? onThisGame[0] : candidates.length === 1 ? candidates[0] : null;

      if (!match) {
        unmatchedRows.push({ sgo_player_id: `oddsapi:${n}`, sgo_event_id: eventId, stat_id: statId, line: Number(line) });
        return;
      }

      const homeAway = match.team === homeCode ? 'home' : match.team === awayCode ? 'away' : null;
      lineRowsByKey.set(`${match.id}|${eventId}|${statId}`, {
        player_id: match.id,
        sgo_player_id: `oddsapi:${n}`,
        sgo_event_id: eventId,
        stat_id: statId,
        line: Number(line),
        over_odds: overOdds,
        under_odds: underOdds,
        team_id: homeAway === 'home' ? homeId : homeAway === 'away' ? awayId : null,
        opponent_id: homeAway === 'home' ? awayId : homeAway === 'away' ? homeId : null,
        home_away: homeAway,
        game_starts_at: gameStartsAt,
        updated_at: new Date().toISOString(),
      });
    };

    // Every distinct player name mentioned across all markets for this event.
    const playerNames = new Set();
    for (const bm of bookmakers) {
      for (const m of bm.markets || []) {
        for (const o of m.outcomes || []) {
          if (o.description) playerNames.add(o.description);
        }
      }
    }

    for (const playerName of playerNames) {
      for (const [marketKey, statId] of Object.entries(MARKET_TO_STAT_ID)) {
        const picked = fairestOverUnder(bookmakers, marketKey, playerName);
        if (picked) pushLine(playerName, statId, picked.line, picked.overOdds, picked.underOdds);
      }
      const prob = blendedAnytimeTdProbability(bookmakers, playerName);
      if (prob !== null) {
        pushLine(playerName, 'anytime_touchdowns', prob, probabilityToAmericanOdds(prob), probabilityToAmericanOdds(1 - prob));
      } else {
        skippedNoLine++;
      }
    }
  }

  return {
    lineRows: [...lineRowsByKey.values()],
    gameLineRows,
    unmatchedRows,
    skippedNoLine,
    eventCount: events.length,
    propsFetchFailures,
  };
}
