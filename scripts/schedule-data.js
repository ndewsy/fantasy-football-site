// 2026 NFL Regular Season Schedule
//
// Structure:
//   n     — week number (1–18)
//   g     — array of [away, home] team abbreviations
//   dates — parallel array of local ET dates (YYYY-MM-DD) for each game
//
// Replace this file with the full 272-game schedule once you have the
// official data. Week 1 is filled in; weeks 2–18 are stubs.
//
// Team abbreviations used throughout:
//   AFC East:  BUF MIA NE  NYJ
//   AFC North: BAL CIN CLE PIT
//   AFC South: HOU IND JAX TEN
//   AFC West:  DEN KC  LV  LAC
//   NFC East:  DAL NYG PHI WAS
//   NFC North: CHI DET GB  MIN
//   NFC South: ATL CAR NO  TB
//   NFC West:  ARI LAR SF  SEA

export const WEEKS = [
  {
    n: 1,
    // Opening game Wed 9/9, then full Sunday slate 9/13
    g: [
      ['NE',  'SEA'], // Wed 9/9 — kickoff overridden by KNOWN_KICKOFFS in seed
      ['KC',  'BAL'],
      ['BUF', 'MIA'],
      ['DAL', 'PHI'],
      ['DET', 'GB'],
      ['SF',  'LAR'],
      ['HOU', 'IND'],
      ['ATL', 'TB'],
      ['PIT', 'CIN'],
      ['ARI', 'NO'],
      ['TEN', 'JAX'],
      ['NYJ', 'NYG'],
      ['MIN', 'CHI'],
      ['DEN', 'LV'],
      ['LAC', 'CLE'],
      ['WAS', 'CAR'],
    ],
    dates: [
      '2026-09-09', // opener
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
      '2026-09-13',
    ],
  },

  // ── Weeks 2–18: paste real schedule data here ────────────────────────────
  { n: 2,  g: [], dates: [] },
  { n: 3,  g: [], dates: [] },
  { n: 4,  g: [], dates: [] },
  { n: 5,  g: [], dates: [] },
  { n: 6,  g: [], dates: [] },
  { n: 7,  g: [], dates: [] },
  { n: 8,  g: [], dates: [] },
  { n: 9,  g: [], dates: [] },
  { n: 10, g: [], dates: [] },
  { n: 11, g: [], dates: [] },
  { n: 12, g: [], dates: [] },
  { n: 13, g: [], dates: [] },
  { n: 14, g: [], dates: [] },
  { n: 15, g: [], dates: [] },
  { n: 16, g: [], dates: [] },
  { n: 17, g: [], dates: [] },
  { n: 18, g: [], dates: [] },
];
