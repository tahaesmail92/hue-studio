import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session and invite tokens are stored hashed, so a database dump cannot be
 * replayed as a login. The raw token exists only in the cookie or the emailed
 * link.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison for anything secret. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
