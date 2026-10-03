const isDev = process.env.NODE_ENV !== 'production';

// Fairly strict by default: this app holds real financial data and sits
// on the open internet. 'unsafe-eval' is only added in dev because
// Next's dev-mode HMR/source maps rely on it — the production build
// doesn't need it.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
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
