// Maps a 1-10 risk rating to a green -> red hue (1 = safest/green, 10 = riskiest/red).
export function riskColor(value) {
  const clamped = Math.min(10, Math.max(1, Number(value) || 1));
  const hue = 142 - (142 * (clamped - 1)) / 9;
  return `hsl(${hue}, 70%, 45%)`;
}
