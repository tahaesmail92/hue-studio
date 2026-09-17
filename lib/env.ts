// Environment access in one place. Everything is read lazily so that
// `next build` (which imports modules without a .env) never crashes on a
// missing runtime secret - the failure happens at request time, loudly,
// with the name of the variable that is missing.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get dbPoolMax() {
    return Number(optional("DB_POOL_MAX", "10"));
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000");
  },

  // ---- auth ----
  get sessionCookieName() {
    return optional("SESSION_COOKIE_NAME", "hue_studio_session");
  },
  get sessionTtlDays() {
    return Number(optional("SESSION_TTL_DAYS", "14"));
  },
  /** How long an invite or password-reset link stays valid. */
  get inviteTtlDays() {
    return Number(optional("INVITE_TTL_DAYS", "7"));
  },

  // ---- locale & time ----
  /**
   * Shoots are scheduled in the client's timezone, not the browser's. A client
   * created without one falls back to this.
   */
  get defaultTimezone() {
    return optional("DEFAULT_TIMEZONE", "Africa/Cairo");
  },
  get defaultLocale() {
    return optional("DEFAULT_LOCALE", "ar") === "en" ? "en" : "ar";
  },

  // ---- email ----
  /** Empty in development: sends are logged to email_log and skipped. */
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "HUE Studio <studio@huecreative.agency>");
  },
  /** Where "a new request arrived" lands. Falls back to every admin user. */
  get adminEmail() {
    return process.env.ADMIN_EMAIL ?? "";
  },

  // ---- media ----
  get mediaRoot() {
    return optional("MEDIA_ROOT", "./.media");
  },
  get mediaUrl() {
    return optional("MEDIA_URL", "http://localhost:3000/media");
  },
  get mediaMaxMb() {
    return Number(optional("MEDIA_MAX_MB", "25"));
  },

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
