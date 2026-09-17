// argon2id - memory-hard, so a stolen hash is expensive to attack offline.
// @node-rs/argon2 ships prebuilt binaries, so there is no native toolchain
// requirement on a Windows dev machine or in the Alpine container.
import { hash, verify } from "@node-rs/argon2";

// OWASP baseline: 19 MiB memory, 2 iterations, 1 lane. The algorithm is left
// at the library default, which is argon2id.
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain, OPTIONS);
  } catch {
    // A malformed hash in the database is a failed login, not a 500.
    return false;
  }
}

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Returns a dictionary key rather than a sentence, because the person setting
 * the password may be reading the Arabic UI. Null means the password is fine.
 *
 * Deliberately length-only: character-class rules mostly produce Password1!
 * everywhere, while length is what actually costs an attacker.
 */
export type PasswordProblem = "passwordTooShort" | "passwordTooLong" | null;

export function checkPasswordPolicy(plain: string): PasswordProblem {
  if (plain.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  if (plain.length > 200) return "passwordTooLong";
  return null;
}
