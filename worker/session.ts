/**
 * Sessions, with nothing to store.
 *
 * The cookie carries the GitHub token itself, sealed with AES-GCM under a key
 * derived from SESSION_SECRET. GCM is authenticated, so a tampered cookie fails
 * to open rather than opening into something attacker-shaped — which means there
 * is no session table to provision, expire or leak.
 *
 * The token never reaches the browser in readable form and never leaves the
 * Worker in any form.
 */

const COOKIE = 'cafa_session';
const STATE_COOKIE = 'cafa_oauth_state';

/** A sealed payload is only valid for the thing it was sealed for. */
type Purpose = 'session' | 'oauth-state';

export interface Session {
  login: string;
  token: string;
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
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
 * `SameSite=Lax` rather than `Strict`: the OAuth callback is a top-level
 * navigation from github.com, and under Strict the cookie set just before the
 * redirect would not come back.
 */
function cookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

const SESSION_LIFETIME = 60 * 60 * 24 * 14;
const STATE_LIFETIME = 60 * 10;

export function sessionCookie(sealed: string): string {
  return cookie(COOKIE, sealed, SESSION_LIFETIME);
}

export function clearedSessionCookie(): string {
  return cookie(COOKIE, '', 0);
}

export function stateCookie(sealed: string): string {
  return cookie(STATE_COOKIE, sealed, STATE_LIFETIME);
}

export function clearedStateCookie(): string {
  return cookie(STATE_COOKIE, '', 0);
}

export async function sealSession(secret: string, session: Session): Promise<string> {
  return seal(secret, 'session', session, SESSION_LIFETIME);
}

export async function readSession(request: Request, secret: string): Promise<Session | null> {
  const value = await open<Session>(secret, 'session', read(request, COOKIE));
  if (value === null) return null;
  if (typeof value.login !== 'string' || typeof value.token !== 'string') return null;
  return value;
}

export async function sealState(secret: string, state: string): Promise<string> {
  return seal(secret, 'oauth-state', state, STATE_LIFETIME);
}

export async function readState(request: Request, secret: string): Promise<string | null> {
  return open<string>(secret, 'oauth-state', read(request, STATE_COOKIE));
}

export { SESSION_LIFETIME, STATE_LIFETIME };
