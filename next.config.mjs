const isDev = process.env.NODE_ENV !== 'production';

// Fairly strict by default: this app holds real financial data and sits
// on the open internet. 'unsafe-eval' is only added in dev because
// Next's dev-mode HMR/source maps rely on it — the production build
// doesn't need it.
// An explicit SUPABASE_URL (for example a custom domain for storage) is allowed too.
const storageOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : '';
  } catch {
    return '';
  }
})();
const storageHosts = ['https://*.supabase.co', storageOrigin].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'inline-speculation-rules'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Supabase Storage: files are uploaded to and shown from short-lived signed addresses on the project domain.
  `img-src 'self' data: ${storageHosts}`,
  "font-src 'self'",
  `connect-src 'self' ${storageHosts}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep a visited page for 30 seconds on this device, so clicking back to a tab you just left
  // opens at once instead of asking the server again. Saving something calls router.refresh(),
  // which clears this cache, so lists never show stale data after an edit.
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  // Which commit this build was made from (Netlify sets COMMIT_REF while building). /api/health reports it,
  // so anyone can tell at a glance whether the live site is running the latest code or a deploy was skipped.
  env: {
    BUILD_COMMIT: process.env.COMMIT_REF || process.env.GITHUB_SHA || '',
  },
  // The training guide is read from docs/ at runtime, so make sure it is
  // bundled with the serverless functions that serve it.
  outputFileTracingIncludes: {
    '/api/guide': ['./docs/**/*'],
    '/dashboard/guide': ['./docs/**/*'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Cache headers for the logo, icons and favicon are in netlify.toml: Netlify
      // serves files from /public straight from its CDN, which skips these rules.
    ];
  },
  // A config-level redirect (compiled into routes-manifest.json) rather than
  // a page-level `redirect()` call in app/page.tsx — the latter renders "/"
  // as a static page with no HTML output (nothing to render, only redirect
  // metadata), which 404's when served from Vercel's Edge Network even
  // though `next start` serves it fine locally via Next's own Node runtime.
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
