// Minimal in-memory rate limiter for the login route. This resets if the
// process restarts and doesn't share state across multiple instances
// (e.g. serverless), but for the single-server/VM/Docker deployment this
// app is meant to run on day to day, it's a real deterrent against
// brute-forcing the shared APP_PASSWORD — meaningfully better than no
// throttling at all.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}

/** Returns true if this key is currently locked out from further attempts. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (now - bucket.windowStart > WINDOW_MS) return false;
  return bucket.count >= MAX_ATTEMPTS;
}

/** Records a failed attempt for this key. */
export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
  } else {
    bucket.count += 1;
  }
}

/** Clears any tracked failures for this key, e.g. after a successful login. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
