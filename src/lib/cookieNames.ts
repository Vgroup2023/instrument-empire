// Split out from lib/session.ts so middleware (which runs on the Edge
// runtime and must not pull in next/headers) can reference the cookie name
// without importing anything that touches cookies()/next/headers directly.
export const APP_SESSION_COOKIE = 'ac_app_session';
export const QBO_SESSION_COOKIE = 'ac_qbo_session';
