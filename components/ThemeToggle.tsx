"use client";

import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Light is the default: HUE's canvas is warm paper. Dark is an opt-in the
 * brand system defines, remembered per device.
 *
 * There is no React state here on purpose. The current theme already lives on
 * the <html> element, so the label is chosen in CSS from that attribute -
 * which avoids both a hydration mismatch and a setState-in-effect.
 *
 * Both labels are rendered and one is hidden by CSS, so they arrive as props
 * from the server already translated.
 */
export function ThemeToggle({
  labels = { dark: "Dark theme", light: "Light theme" },
  onDark = false,
}: {
  labels?: { dark: string; light: string };
  onDark?: boolean;
}) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse storage; the toggle still works for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-xs transition ${
        onDark ? "text-white/50 hover:text-white" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="when-light">{labels.dark}</span>
      <span className="when-dark">{labels.light}</span>
    </button>
  );
}
