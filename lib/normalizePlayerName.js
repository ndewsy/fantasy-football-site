// Shared name-matching normalizer for bridging our roster against external
// feeds (SportsGameOdds prop lines, ESPN ownership) that don't share a
// common player ID with us. External sources sometimes list a player under
// their legal first name (e.g. "Kenneth Gainwell", "Cameron Skattebo") or
// full first name where the player goes by initials/a nickname (e.g. "Kevin
// Concepcion" for "KC Concepcion", "Jo'Quavious Marks" for "Woody Marks")
// while our roster uses the common form — plain normalization alone can't
// bridge that, so any first-token mismatch found gets added here. Safe as
// long as no two distinct players in our roster would collapse onto the
// same alias + last name.
const FIRST_NAME_ALIASES = {
  kenneth: 'kenny',
  cameron: 'cam',
  kevin: 'kc',
  andrew: 'drew',
  joquavious: 'woody',
  joshua: 'josh',
  matthew: 'matt',
};

// For mismatches that go beyond the first token — a different last-name
// spelling/form entirely — keyed by the *cleaned* (lowercased, punctuation
// stripped) external name, mapped to our roster's cleaned name. Checked
// before the first-token alias above.
const FULL_NAME_ALIASES = {
  // SGO spells his last name with an extra "o" (Okonokwo); ours matches his
  // actual jersey/broadcast name (Chig Okonkwo).
  'chigoziem okonokwo': 'chig okonkwo',
  // SGO drops his hyphenated surname's first half entirely.
  'jacory merritt': 'jacory croskey-merritt',
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
  if (FULL_NAME_ALIASES[cleaned]) return FULL_NAME_ALIASES[cleaned];
  const [first, ...rest] = cleaned.split(' ');
  return [FIRST_NAME_ALIASES[first] || first, ...rest].join(' ');
}
