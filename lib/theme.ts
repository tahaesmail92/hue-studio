export const THEME_STORAGE_KEY = "hue-studio-theme";

/**
 * Injected inline in <head> so a dark-theme device never flashes the light
 * canvas before hydration.
 *
 * Lives here, not in ThemeToggle.tsx: importing plain data from a
 * "use client" module into a Server Component hands the server a client
 * reference instead of the value.
 */
export const themeScript =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();`;
