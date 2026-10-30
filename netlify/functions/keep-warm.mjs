// Keeps the app's server awake so the first page you open after a quiet spell is not slow.
//
// The app runs on serverless functions that go to sleep when nobody uses them, and waking one takes several seconds.
// This function is run by Netlify itself every 5 minutes (a "scheduled function"; unlike a GitHub Actions schedule,
// Netlify does not skip or delay it) and makes two light public requests: the sign-in page and the status check.
// Neither reads private data. It only runs on the published production site.

export default async function keepWarm() {
  // Netlify provides URL (the site's main address) to functions; the fallback is the production address.
  const base = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://globlexus.globlexai.com').replace(/\/$/, '');
  const results = [];
  for (const path of ['/login', '/api/health']) {
    const started = Date.now();
    try {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'netlify-keep-warm' } });
      results.push(`${path} ${res.status} ${Date.now() - started}ms`);
    } catch (err) {
      results.push(`${path} failed ${(err && err.name) || 'error'} after ${Date.now() - started}ms`);
    }
  }
  console.log('keep-warm:', results.join(' | '));
  return new Response(results.join('\n'), { status: 200 });
}

export const config = { schedule: '*/5 * * * *' };
