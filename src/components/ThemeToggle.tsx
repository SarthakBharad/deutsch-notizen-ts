"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "deutsch-notizen-theme";

/**
 * Runs before the first paint, inlined in <head>.
 *
 * Without this the page renders in light, then flips once React hydrates —
 * a white flash on every navigation for anyone reading in dark.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('${THEME_KEY}');
    var dark = saved ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // The real value already sits on <html>, put there by the inline script.
  // Reading it after mount keeps the button label honest without the server
  // and the browser disagreeing about the first render.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.body.classList.add("theming");
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private mode, or storage disabled — the theme still applies for now
    }
    setTheme(next);
    window.setTimeout(() => document.body.classList.remove("theming"), 220);
  };

  return (
    <button
      type="button"
      className="toggle"
      onClick={toggle}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}