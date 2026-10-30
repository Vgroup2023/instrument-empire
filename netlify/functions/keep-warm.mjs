// Keeps the app's server awake so the first page you open after a quiet spell is not slow.
//
// The app runs on serverless functions that go to sleep when nobody uses them, and waking one takes several seconds.
// This function is run by Netlify itself every 5 minutes (a "scheduled function"; unlike a GitHub Actions schedule,
// Netlify does not skip or delay it) and makes light public requests: the sign-in page and the status check.
// Neither reads private data. It only runs on the published production site.
//
// Each run makes four requests at once (three for the sign-in page, one for the status check), which keeps several
// copies of the server awake. Over a month that is about 8,640 runs and about 34,600 calls to the app, roughly 43,000 function calls in all.

export default async function keepWarm() {
  // Netlify provides URL (the site's main address) to functions; the fallback is the production address.
  const base = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://globlexus.globlexai.com').replace(/\/$/, '');
  // Requests that overlap in time are served by separate copies of the server, so asking for the sign-in page several
  // times at once keeps several copies awake, not just one. A real visit is then unlikely to land on a cold one.
  const targets = ['/login', '/login', '/login', '/api/health'];
  const results = await Promise.all(
    targets.map(async (path) => {
      const started = Date.now();
      try {
        const res = await fetch(base + path, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'netlify-keep-warm' } });
        return `${path} ${res.status} ${Date.now() - started}ms`;
      } catch (err) {
        return `${path} failed ${(err && err.name) || 'error'} after ${Date.now() - started}ms`;
      }
    }),
  );
  console.log('keep-warm:', results.join(' | '));
  return new Response(results.join('\n'), { status: 200 });
}

export const config = { schedule: '*/5 * * * *' };
