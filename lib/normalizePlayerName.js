// Shared name-matching normalizer for bridging our roster against external
// feeds (SportsGameOdds prop lines, ESPN ownership) that don't share a
// common player ID with us. External sources sometimes list a player under
// their legal first name (e.g. "Kenneth Gainwell") while our roster uses
// the common name ("Kenny Gainwell") — plain normalization alone can't
// bridge that, so any first-name mismatch found gets added here.
const FIRST_NAME_ALIASES = {
  kenneth: 'kenny',
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
