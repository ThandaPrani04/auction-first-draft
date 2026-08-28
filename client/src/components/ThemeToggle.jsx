import { useState } from 'react';
import { getTheme, setTheme } from '../lib/theme.js';

/**
 * A small pill that flips between dark and light. Drop it anywhere; it styles
 * itself via `.theme-toggle` in App.css and works on every page.
 */
export default function ThemeToggle({ className = '' }) {
  const [theme, setLocal] = useState(getTheme);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setLocal(next);
  };

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
