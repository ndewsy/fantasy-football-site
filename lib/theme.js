// Single source of truth for "what theme is currently applied" — sets the
// .dark class on <html> and a plain (non-httpOnly) cookie so the next page
// load's inline script (see app/layout.js) can read it synchronously before
// paint, avoiding a flash of the wrong theme.
export function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.cookie = `theme=${isDark ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
}

export function getAppliedTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
