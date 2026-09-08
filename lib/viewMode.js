// "Subscriber view mode" — lets staff (admin/creator) preview gated pages as
// a paying subscriber or a free user without a second test account. Purely a
// client-side display simulation; see app/components/ViewModeToggle.js and
// the per-page isDashboardUser/isSubscribed clamp that reads this.
export function getViewMode() {
  if (typeof document === "undefined") return "real";
  const match = document.cookie.match(/(?:^|; )view_mode=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : "real";
  return ["real", "subscriber", "free"].includes(value) ? value : "real";
}

export function setViewMode(mode) {
  document.cookie = `view_mode=${mode}; path=/; max-age=2592000; SameSite=Lax`;
}
