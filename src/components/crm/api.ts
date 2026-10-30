/** Calls a CRM API and returns its JSON, or throws the message the server gave. */
export async function crmCall<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong. Please try again.');
  return data as T;
}

/** Names the person using this browser, so each logged activity says who did it. */
export function loadActor(): string {
  try {
    return localStorage.getItem('crm-actor') || 'Office team';
  } catch {
    return 'Office team';
  }
}
export function saveActor(name: string) {
  try {
    localStorage.setItem('crm-actor', name);
  } catch {
    // Storage can be blocked; the name then lasts until the page closes.
  }
}
