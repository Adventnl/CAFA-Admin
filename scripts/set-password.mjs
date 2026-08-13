/**
 * Turn a password into the line that goes in `ADMIN_PASSWORD_HASH`.
 *
 *   npm run set-password
 *   npm run set-password -- --iterations 400000
 *   printf '%s' 'the password' | npm run set-password    # non-interactive
 *
 * It prints a verifier and nothing else worth keeping:
 *
 *   pbkdf2$sha256$210000$<salt>$<derived key>
 *
 * The password itself never touches a file, an argument list or the shell's
 * history — it is typed with the echo off, or piped in. What comes out is safe
 * to paste into `wrangler secret put`, and useless for signing in with.
 *
 * The format is read back by worker/domain/password.ts, which is the copy that
 * matters. This uses the same WebCrypto that the Worker does, so a hash made
 * here and a hash made there are the same bytes. If one changes, change both.
 */
import { createInterface } from 'node:readline';

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const MINIMUM_LENGTH = 8;

/* ------------------------------------------------------------- encoding --- */

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

/* --------------------------------------------------------------- asking --- */

/** Reads the whole of a piped stdin, so a password can arrive from a pipe. */
async function readPiped() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  // A trailing newline is the pipe's, not the password's.
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** One line, with the echo off. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    // readline echoes as you type; this is where it would do it.
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/* --------------------------------------------------------------- hashing -- */

async function hash(password, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    KEY_BITS,
  );

  return `pbkdf2$sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

/* ------------------------------------------------------------------ main -- */

function iterationsFromArgv() {
  const at = process.argv.indexOf('--iterations');
  if (at === -1) return ITERATIONS;

  const given = Number(process.argv[at + 1]);
  if (!Number.isInteger(given) || given < 1000) {
    console.error('--iterations wants a whole number of at least 1000.');
    process.exit(1);
  }
  return given;
}

async function main() {
  const iterations = iterationsFromArgv();
  const interactive = process.stdin.isTTY === true;

  let password;
  if (interactive) {
    password = await askHidden('New admin password: ');
    const again = await askHidden('Again, to be sure:  ');
    if (password !== again) {
      console.error('\nThose did not match. Nothing was written; run it again.');
      process.exit(1);
    }
  } else {
    password = await readPiped();
  }

  if (password.length < MINIMUM_LENGTH) {
    console.error(`\nToo short — ${MINIMUM_LENGTH} characters at the very least.`);
    process.exit(1);
  }

  const verifier = await hash(password, iterations);

  if (!interactive) {
    // Piped: the hash alone, so it can be piped onward.
    process.stdout.write(`${verifier}\n`);
    return;
  }

  console.log(`
Paste this when wrangler asks for the value:

  ${verifier}

Then, once for each:

  npx wrangler secret put ADMIN_USERNAME
  npx wrangler secret put ADMIN_PASSWORD_HASH

The new password is live as soon as the second one is accepted — no redeploy.
Existing sessions keep working; to end those too, rotate SESSION_SECRET.
`);
}

await main();
