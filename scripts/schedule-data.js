// Full 2026 NFL regular season schedule — 18 weeks, 272 games.
// Source: pro-football-reference.com/years/2026/games.htm (as of July 2026;
// a small number of Sunday afternoon games may still shift via flex scheduling
// later in the season — that only affects kickoff time/day, not who plays whom).
//
// Each week: { n: week number, dates: [display date per game, in order], g: [[away, home], ...] }
// Team codes match the keys used in the picks UI / TEAMS map (BUF, MIA, NE, NYJ, BAL, CIN, CLE, PIT,
// HOU, IND, JAX, TEN, DEN, KC, LV, LAC, DAL, NYG, PHI, WAS, CHI, DET, GB, MIN, ATL, CAR, NO, TB, ARI, LAR, SF, SEA)

export const WEEKS = [
  { n: 1, dates: ['Wed 9/9','Thu 9/10','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Sun 9/13','Mon 9/14'],
    g: [['NE','SEA'],['SF','LAR'],['CHI','CAR'],['TB','CIN'],['BAL','IND'],['NO','DET'],['BUF','HOU'],['CLE','JAX'],['NYJ','TEN'],['ATL','PIT'],['GB','MIN'],['WAS','PHI'],['MIA','LV'],['ARI','LAC'],['DAL','NYG'],['DEN','KC']] },

  { n: 2, dates: ['Thu 9/17','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Sun 9/20','Mon 9/21'],
    g: [['DET','BUF'],['CAR','ATL'],['MIN','CHI'],['CIN','HOU'],['PIT','NE'],['GB','NYJ'],['PHI','TEN'],['NO','BAL'],['CLE','TB'],['JAX','DEN'],['LV','LAC'],['SEA','ARI'],['WAS','DAL'],['MIA','SF'],['IND','KC'],['NYG','LAR']] },

  { n: 3, dates: ['Thu 9/24','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Sun 9/27','Mon 9/28'],
    g: [['ATL','GB'],['LAC','BUF'],['CAR','CLE'],['HOU','IND'],['NYJ','DET'],['NE','JAX'],['KC','MIA'],['TEN','NYG'],['CIN','PIT'],['SEA','WAS'],['ARI','SF'],['MIN','TB'],['BAL','DAL'],['LV','NO'],['LAR','DEN'],['PHI','CHI']] },

  { n: 4, dates: ['Thu 10/1','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Sun 10/4','Mon 10/5'],
    g: [['PIT','CLE'],['IND','WAS'],['NE','BUF'],['NYJ','CHI'],['JAX','CIN'],['DAL','HOU'],['ARI','NYG'],['LAR','PHI'],['TEN','BAL'],['GB','TB'],['MIA','MIN'],['KC','LV'],['LAC','SEA'],['DEN','SF'],['DET','CAR'],['ATL','NO']] },

  { n: 5, dates: ['Thu 10/8','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Sun 10/11','Mon 10/12'],
    g: [['TB','DAL'],['PHI','JAX'],['CIN','MIA'],['MIN','NO'],['LV','NE'],['CLE','NYJ'],['HOU','TEN'],['IND','PIT'],['NYG','WAS'],['DEN','LAC'],['DET','ARI'],['CHI','GB'],['SF','SEA'],['BAL','ATL'],['BUF','LAR']] },

  { n: 6, dates: ['Thu 10/15','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Sun 10/18','Mon 10/19'],
    g: [['SEA','DEN'],['HOU','JAX'],['CHI','ATL'],['BAL','CLE'],['TEN','IND'],['NYJ','NE'],['NO','NYG'],['CAR','PHI'],['PIT','TB'],['ARI','LAR'],['LAC','KC'],['BUF','LV'],['DAL','GB'],['WAS','SF']] },

  { n: 7, dates: ['Thu 10/22','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Sun 10/25','Mon 10/26'],
    g: [['NE','CHI'],['PIT','NO'],['SF','ATL'],['TB','CAR'],['NYG','HOU'],['IND','MIN'],['MIA','NYJ'],['CLE','TEN'],['CIN','BAL'],['DEN','ARI'],['GB','DET'],['LAR','LV'],['KC','SEA'],['DAL','PHI']] },

  { n: 8, dates: ['Thu 10/29','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Sun 11/1','Mon 11/2'],
    g: [['CAR','GB'],['BAL','BUF'],['TEN','CIN'],['ARI','DAL'],['MIN','DET'],['IND','JAX'],['LV','NYJ'],['CLE','PIT'],['ATL','TB'],['LAC','LAR'],['KC','DEN'],['NE','MIA'],['PHI','WAS'],['CHI','SEA']] },

  { n: 9, dates: ['Thu 11/5','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Sun 11/8','Mon 11/9'],
    g: [['JAX','BAL'],['CIN','ATL'],['DEN','CAR'],['DAL','IND'],['NYJ','KC'],['DET','MIA'],['CLE','NO'],['NYG','PHI'],['LAR','WAS'],['HOU','LAC'],['LV','SF'],['GB','NE'],['ARI','SEA'],['TB','CHI'],['BUF','MIN']] },

  { n: 10, dates: ['Thu 11/12','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Sun 11/15','Mon 11/16'],
    g: [['WAS','NYG'],['NE','DET'],['KC','ATL'],['HOU','CLE'],['MIA','IND'],['MIN','GB'],['CAR','NO'],['BUF','NYJ'],['JAX','TEN'],['LAR','ARI'],['SEA','LV'],['SF','DAL'],['PIT','CIN'],['LAC','BAL']] },

  { n: 11, dates: ['Thu 11/19','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Sun 11/22','Mon 11/23'],
    g: [['IND','HOU'],['MIA','BUF'],['BAL','CAR'],['NO','CHI'],['TEN','DAL'],['TB','DET'],['ARI','KC'],['JAX','NYG'],['NYJ','LAC'],['LV','DEN'],['PIT','PHI'],['MIN','SF'],['CIN','WAS']] },

  { n: 12, dates: ['Wed 11/25','Thu 11/26','Thu 11/26','Thu 11/26','Fri 11/27','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Sun 11/29','Mon 11/30'],
    g: [['GB','LAR'],['CHI','DET'],['PHI','DAL'],['KC','BUF'],['DEN','PIT'],['NO','CIN'],['LV','CLE'],['NYG','IND'],['BAL','HOU'],['NYJ','MIA'],['ATL','MIN'],['TEN','JAX'],['WAS','ARI'],['SEA','SF'],['NE','LAC'],['CAR','TB']] },

  { n: 13, dates: ['Thu 12/3','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Sun 12/6','Mon 12/7'],
    g: [['KC','LAR'],['DET','ATL'],['JAX','CHI'],['CIN','CLE'],['GB','NO'],['SF','NYG'],['WAS','TEN'],['LAC','TB'],['PHI','ARI'],['MIA','DEN'],['CAR','MIN'],['BUF','NE'],['HOU','PIT'],['DAL','SEA']] },

  { n: 14, dates: ['Thu 12/10','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Sun 12/13','Mon 12/14'],
    g: [['MIN','NE'],['NO','CAR'],['ATL','CLE'],['TEN','DET'],['CHI','MIA'],['DEN','NYJ'],['IND','PHI'],['TB','BAL'],['HOU','WAS'],['LAC','LV'],['KC','CIN'],['NYG','SEA'],['LAR','SF'],['BUF','GB'],['PIT','JAX']] },

  { n: 15, dates: ['Thu 12/17','Sat 12/19','Sat 12/19','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Sun 12/20','Mon 12/21'],
    g: [['SF','LAC'],['SEA','PHI'],['CHI','BUF'],['CIN','CAR'],['MIA','GB'],['JAX','HOU'],['CLE','NYG'],['IND','TEN'],['BAL','PIT'],['NO','TB'],['ATL','WAS'],['NYJ','ARI'],['DEN','LV'],['DAL','LAR'],['DET','MIN'],['NE','KC']] },

  { n: 16, dates: ['Thu 12/24','Fri 12/25','Fri 12/25','Fri 12/25','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Sun 12/27','Mon 12/28'],
    g: [['HOU','PHI'],['GB','CHI'],['BUF','DEN'],['LAR','SEA'],['TB','ATL'],['CIN','IND'],['LAC','MIA'],['WAS','MIN'],['ARI','NO'],['NE','NYJ'],['CAR','PIT'],['CLE','BAL'],['TEN','LV'],['SF','KC'],['JAX','DAL'],['NYG','DET']] },

  { n: 17, dates: ['Thu 12/31','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Sun 1/3','Mon 1/4'],
    g: [['BAL','CIN'],['NO','ATL'],['SEA','CAR'],['IND','CLE'],['NYG','DAL'],['WAS','JAX'],['BUF','MIA'],['DEN','NE'],['MIN','NYJ'],['PIT','TEN'],['KC','LAC'],['LAR','TB'],['LV','ARI'],['DET','CHI'],['PHI','SF'],['HOU','GB']] },

  { n: 18, dates: ['Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10','Sun 1/10'],
    g: [['NYJ','BUF'],['ATL','CAR'],['CLE','CIN'],['JAX','IND'],['SF','ARI'],['LAC','DEN'],['DET','GB'],['TEN','HOU'],['LV','KC'],['CHI','MIN'],['TB','NO'],['MIA','NE'],['PHI','NYG'],['SEA','LAR'],['PIT','BAL'],['DAL','WAS']] },
];

// Note on week 18: several Week 18 games (division tie-ins / seeding implications) can be
// flexed to Saturday or have kickoff times set closer to the date. Rerun the sync/verification
// once the NFL finalizes Week 18 scheduling in early January if you want exact kickoff times —
// it won't change the matchups above, only day/time.
