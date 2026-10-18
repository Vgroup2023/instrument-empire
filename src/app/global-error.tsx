'use client';

// Last resort when the page frame itself fails; it has to bring its own <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18 }}>This page hit a problem</h1>
        {error.digest ? <p style={{ fontFamily: 'monospace', fontSize: 12 }}>Reference: {error.digest}</p> : null}
        <button type="button" onClick={reset} style={{ padding: '8px 16px' }}>Try again</button>{' '}
        <a href="/login">Back to sign in</a>
      </body>
    </html>
  );
}
