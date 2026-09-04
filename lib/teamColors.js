// Each team's primary/secondary brand colors — used for the player modal
// banner, team badges, and (for DST) the rankings row icon. Falls back to
// the site's default blue for free agents / unknown teams.
const TEAM_COLORS = {
  ARI: ["#97233F", "#000000"], ATL: ["#A71930", "#000000"], BAL: ["#241773", "#000000"],
  BUF: ["#00338D", "#C60C30"], CAR: ["#0085CA", "#101820"], CHI: ["#0B162A", "#C83803"],
  CIN: ["#FB4F14", "#000000"], CLE: ["#311D00", "#FF3C00"], DAL: ["#041E42", "#869397"],
  DEN: ["#FB4F14", "#002244"], DET: ["#0076B6", "#B0B7BC"], GB: ["#203731", "#FFB612"],
  HOU: ["#03202F", "#A71930"], IND: ["#002C5F", "#A2AAAD"], JAX: ["#101820", "#006778"],
  KC: ["#E31837", "#FFB81C"], LAC: ["#0080C6", "#FFC20E"], LAR: ["#003594", "#FFA300"],
  LV: ["#000000", "#A5ACAF"], MIA: ["#008E97", "#FC4C02"], MIN: ["#4F2683", "#FFC62F"],
  NE: ["#002244", "#C60C30"], NO: ["#101820", "#D3BC8D"], NYG: ["#0B2265", "#A71930"],
  NYJ: ["#125740", "#000000"], PHI: ["#004C54", "#A5ACAF"], PIT: ["#101820", "#FFB612"],
  SEA: ["#002244", "#69BE28"], SF: ["#AA0000", "#B3995D"], TB: ["#D50A0A", "#34302B"],
  TEN: ["#0C2340", "#4B92DB"], WAS: ["#5A1414", "#FFB612"],
};
const DEFAULT_TEAM_COLORS = ["#2563EB", "#1E40AF"];

export function teamColors(team) {
  const [primary, secondary] = TEAM_COLORS[team] || DEFAULT_TEAM_COLORS;
  return { primary, secondary };
}
