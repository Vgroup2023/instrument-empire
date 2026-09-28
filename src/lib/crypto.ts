// Minimal signed-payload helper built on the Web Crypto API so it works in
// both the Node.js runtime (route handlers) and the Edge runtime
// (src/proxy.ts) without extra dependencies.

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Signs an arbitrary JSON-serializable payload into a compact, URL-safe token. */
export async function signPayload(payload: unknown, secret: string): Promise<string> {
  const json = JSON.stringify(payload);
  const body = base64UrlEncode(new TextEncoder().encode(json));
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const sig = base64UrlEncode(new Uint8Array(signature));
  return `${body}.${sig}`;
}

/** Verifies and decodes a token produced by {@link signPayload}. Returns null if invalid. */
export async function verifyPayload<T>(token: string | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    const json = new TextDecoder().decode(base64UrlDecode(body));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
