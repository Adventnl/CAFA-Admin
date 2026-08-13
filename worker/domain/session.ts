/**
 * Sessions, with nothing to store.
 *
 * The cookie carries who signed in, sealed with AES-GCM under a key derived
 * from SESSION_SECRET. GCM is authenticated, so a tampered cookie fails to open
 * rather than opening into something attacker-shaped — which means there is no
 * session table to provision, expire or leak.
 *
 * It used to carry a GitHub token, and there used to be a second sealed cookie
 * holding an OAuth `state` across the round trip to github.com. Sign-in is now
 * a username and a password posted to this Worker and answered by it, so there
 * is no round trip, no state to carry, and nothing in the cookie but a name.
 */
import { fromBase64Url, toBase64Url } from './base64url';

const COOKIE = 'cafa_session';

/** A sealed payload is only valid for the thing it was sealed for. */
type Purpose = 'session';

export interface Session {
  login: string;
}

interface Sealed<T> {
  purpose: Purpose;
  expiresAt: number;
  value: T;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function keyFor(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function seal<T>(
  secret: string,
  purpose: Purpose,
  value: T,
  lifetimeSeconds: number,
): Promise<string> {
  const payload: Sealed<T> = {
    purpose,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
    value,
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFor(secret),
    encoder.encode(JSON.stringify(payload)),
  );

  const sealed = new Uint8Array(iv.length + ciphertext.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(sealed);
}

export async function open<T>(
  secret: string,
  purpose: Purpose,
  sealed: string | null,
): Promise<T | null> {
  if (sealed === null) return null;
  const bytes = fromBase64Url(sealed);
  if (bytes === null || bytes.length <= 12) return null;

  let plaintext: ArrayBuffer;
  try {
    // `slice` rather than `subarray`: WebCrypto wants a BufferSource backed by a
    // plain ArrayBuffer, and a view onto a shared buffer is not one.
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await keyFor(secret),
      bytes.slice(12),
    );
  } catch {
    // Tampered, or sealed under a rotated secret. Both mean "not signed in".
    return null;
  }

  let payload: Sealed<T>;
  try {
    payload = JSON.parse(decoder.decode(plaintext)) as Sealed<T>;
  } catch {
    return null;
  }

  if (payload.purpose !== purpose) return null;
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()) return null;
  return payload.value;
}

function read(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (header === null) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/**
 * `SameSite=Strict` is affordable now that sign-in is a form post rather than a
 * redirect back from github.com — nothing arrives here as a top-level
 * navigation from another site any more. It is also the whole CSRF story: every
 * write is a same-origin `fetch` from a page already on this hostname, and a
 * form posted from anywhere else simply carries no cookie.
 *
 * The one visible consequence is that following a link to the admin from
 * elsewhere does not send the cookie on that first document request. It does
 * not matter: the document is the static SPA, and the session is established by
 * the `/api/session` fetch the page makes, which is same-site.
 */
function cookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

const SESSION_LIFETIME = 60 * 60 * 24 * 14;

export function sessionCookie(sealed: string): string {
  return cookie(COOKIE, sealed, SESSION_LIFETIME);
}

export function clearedSessionCookie(): string {
  return cookie(COOKIE, '', 0);
}

export async function sealSession(secret: string, session: Session): Promise<string> {
  return seal(secret, 'session', session, SESSION_LIFETIME);
}

export async function readSession(request: Request, secret: string): Promise<Session | null> {
  const value = await open<Session>(secret, 'session', read(request, COOKIE));
  if (value === null) return null;
  if (typeof value.login !== 'string') return null;
  return value;
}

export { SESSION_LIFETIME };
