import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';

const KEY_LEN = 32;
const COST = 16384; // scrypt N: about 50 ms on a server, slow enough to make guessing expensive

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N: COST, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** 'scrypt$salt$hash' (both in hex). Only the hash is stored; the password itself never is. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(password, salt)).toString('hex')}`;
}

// Used when no one matches the email, so an unknown address takes as long to reject as a wrong password.
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'));

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const real = Boolean(stored && stored.startsWith('scrypt$'));
  const [, saltHex, hashHex] = (real ? stored! : await dummyHash()).split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(expected, actual) && real;
}

/** Why a password is not acceptable, or null if it is. */
export function passwordProblem(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  if (/^(.)\1+$/.test(password)) return 'Choose something less repetitive.';
  const lower = password.toLowerCase();
  const handle = email ? email.split('@')[0].toLowerCase() : ''; if (email && (lower === email.toLowerCase() || (handle.length >= 4 && lower.includes(handle)))) return 'The password should not contain your email name.';
  if (['password12', 'password123', '1234567890', 'qwertyuiop', 'letmein123'].some((w) => lower.includes(w))) return 'That password is too easy to guess.';
  return null;
}

/** A random link token, and the hash that is stored in its place (so a database leak does not reveal live links). */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
