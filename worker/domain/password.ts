/**
 * The stored password, and the one question worth asking of it.
 *
 * `ADMIN_PASSWORD_HASH` holds a PBKDF2-SHA256 verifier in a single line:
 *
 *   pbkdf2$sha256$<iterations>$<salt base64url>$<derived key base64url>
 *
 * Self-describing on purpose. The iteration count travels with the hash rather
 * than living in this file, so raising it later is a new secret rather than a
 * deploy that locks the studio out of its own admin — an old hash keeps
 * verifying under the count it was made with.
 *
 * PBKDF2 rather than bcrypt or argon2 because it is what WebCrypto gives a
 * Worker natively; the alternatives are native modules that do not run here.
 * The cost is deliberate: ~210k iterations is a fraction of a second on sign-in
 * and the entire point of the exercise for anyone working through a word list.
 *
 * `scripts/set-password.mjs` writes this format. If you change it, change that.
 */
import { equalBytes, fromBase64Url } from './base64url';

const KEY_BITS = 256;

const encoder = new TextEncoder();

interface Verifier {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  key: Uint8Array<ArrayBuffer>;
}

/** `null` for anything that is not a verifier this file wrote. */
function parse(encoded: string): Verifier | null {
  const parts = encoded.trim().split('$');
  if (parts.length !== 5) return null;

  const [scheme, digest, rounds, salt, key] = parts;
  if (scheme !== 'pbkdf2' || digest !== 'sha256') return null;

  const iterations = Number(rounds);
  if (!Number.isInteger(iterations) || iterations < 1) return null;

  const saltBytes = salt === undefined ? null : fromBase64Url(salt);
  const keyBytes = key === undefined ? null : fromBase64Url(key);
  if (saltBytes === null || keyBytes === null) return null;
  if (saltBytes.length === 0 || keyBytes.length === 0) return null;

  return { iterations, salt: saltBytes, key: keyBytes };
}

async function derive(password: string, verifier: Verifier): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: verifier.salt,
      iterations: verifier.iterations,
    },
    material,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

/**
 * Whether this password is the one that produced this hash.
 *
 * A malformed or missing verifier answers false rather than throwing, so a
 * half-configured Worker refuses sign-ins instead of accepting them — the
 * caller is expected to have already complained about the configuration.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const verifier = parse(encoded);
  if (verifier === null) return false;

  const offered = await derive(password, verifier);
  return equalBytes(offered, verifier.key);
}

/** Whether a secret is a verifier at all, without needing a password to try. */
export function isPasswordHash(encoded: string): boolean {
  return parse(encoded) !== null;
}
