/**
 * Extracts the real, human-readable reason from a caught error by walking
 * `.cause` chains to the bottom. Drizzle wraps every failed query in a
 * DrizzleQueryError whose own `.message` is just "Failed query: <sql>
 * params: <params>" — the actual reason (auth failure, connection refused,
 * SSL required, etc.) lives in `.cause`, which was never being surfaced to
 * anyone reading these error pages.
 */
export function describeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  let deepest: Error = err;
  const seen = new Set<Error>([err]);
  let current: unknown = (err as { cause?: unknown }).cause;
  while (current instanceof Error && !seen.has(current)) {
    deepest = current;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return deepest.message || fallback;
}
