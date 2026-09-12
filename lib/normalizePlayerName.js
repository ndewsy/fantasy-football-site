// Shared name-matching normalizer for bridging our roster against external
// feeds (SportsGameOdds prop lines, ESPN ownership) that don't share a
// common player ID with us. External sources sometimes list a player under
// their legal first name (e.g. "Kenneth Gainwell", "Cameron Skattebo") or
// full first name where the player goes by initials (e.g. "Kevin Concepcion"
// for "KC Concepcion") while our roster uses the common form — plain
// normalization alone can't bridge that, so any first-token mismatch found
// gets added here. Safe as long as no two distinct players in our roster
// would collapse onto the same alias + last name.
const FIRST_NAME_ALIASES = {
  kenneth: 'kenny',
  cameron: 'cam',
  kevin: 'kc',
};

export function normalizePlayerName(name) {
  const cleaned = name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/\s+jr\.?$/i, '')
    .replace(/\s+ii$/i, '')
    .replace(/\s+iii$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const [first, ...rest] = cleaned.split(' ');
  return [FIRST_NAME_ALIASES[first] || first, ...rest].join(' ');
}
