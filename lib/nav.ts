import type { Dictionary } from "./i18n/ar.ts";
import type { Role } from "./types.ts";

// Plain data, deliberately in its own module. Importing it from a "use client"
// file into a Server Component would hand the server a client reference
// instead of the array, and the page would fail with "NAV.map is not a
// function" - in production only, where it is hardest to diagnose.
export type NavItem = {
  href: string;
  /** Resolved against the dictionary at render time, so nav is translated. */
  key: keyof Dictionary["nav"];
  roles: Role[];
};

const STAFF: Role[] = ["admin", "producer"];

export const NAV: NavItem[] = [
  { href: "/", key: "dashboard", roles: STAFF },
  { href: "/requests", key: "requests", roles: STAFF },
  { href: "/calendar", key: "calendar", roles: STAFF },
  { href: "/schedule", key: "schedule", roles: STAFF },
  { href: "/clients", key: "clients", roles: STAFF },
  { href: "/crew-members", key: "crew", roles: STAFF },
  { href: "/resources", key: "resources", roles: STAFF },
  { href: "/reports", key: "reports", roles: STAFF },
  { href: "/settings", key: "settings", roles: ["admin"] },

  { href: "/portal", key: "myShoots", roles: ["client"] },
  { href: "/portal/new", key: "newRequest", roles: ["client"] },

  { href: "/crew", key: "myShoots", roles: ["crew"] },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}
