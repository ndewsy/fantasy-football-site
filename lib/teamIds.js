// Shared team-identity mappings used by every prop/odds data source — this
// site's own 2-3 letter team codes (players.team), SportsGameOdds' own
// "KANSAS_CITY_CHIEFS_NFL"-style IDs, and The Odds API's plain full names
// all need to convert to/from each other. Centralized here so
// lib/propsSync.js and lib/oddsApiFallback.js stay in sync instead of each
// keeping their own copy.
export const TEAM_CODE_TO_FULL_NAME = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SF: 'San Francisco 49ers',
  SEA: 'Seattle Seahawks',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

export const FULL_NAME_TO_TEAM_CODE = Object.fromEntries(
  Object.entries(TEAM_CODE_TO_FULL_NAME).map(([code, name]) => [name, code])
);

// Mimics SportsGameOdds' own team-id format (e.g. "KANSAS_CITY_CHIEFS_NFL"),
// confirmed against real stored rows.
export function teamNameToSgoStyleId(fullName) {
  return `${fullName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_NFL`;
}

export function teamCodeToSgoId(code) {
  const name = TEAM_CODE_TO_FULL_NAME[code];
  return name ? teamNameToSgoStyleId(name) : null;
}

export const SGO_ID_TO_TEAM_CODE = Object.fromEntries(
  Object.entries(TEAM_CODE_TO_FULL_NAME).map(([code, name]) => [teamNameToSgoStyleId(name), code])
);
