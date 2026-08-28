/**
 * Theme handling. A single `data-theme` attribute on <html> drives every
 * page's colours through CSS variables (see App.css). Persisted per browser.
 */
const KEY = 'cla-theme';

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — fall back to in-memory only */
  }
  applyTheme(theme);
}

/** Call once at startup so the first paint already has the right colours.
 *  A `?theme=light|dark` query param wins and is persisted, which is handy for
 *  sharing a link in a specific mode. */
export function initTheme() {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (q === 'light' || q === 'dark') {
      setTheme(q);
      return;
    }
  } catch {
    /* no-op */
  }
  applyTheme(getTheme());
}
