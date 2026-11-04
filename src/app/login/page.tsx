import { BRAND } from '@/lib/brand';
import { LoginPanel } from '@/components/auth/LoginPanel';

// Built ahead of time and served from the network edge: nothing here waits on the server or the database. The sign-in card
// (LoginPanel) loads what it needs from the server after the page has appeared.
export default function LoginPage() {
  return (
    <div className="safe-top safe-bottom min-h-dvh bg-silver-black px-4 py-10 lg:py-14">
      {/* On a phone the order is headline, sign-in, then the details, so signing in is never buried. */}
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 lg:grid-cols-[1.15fr_1fr]">
        <header className="text-center lg:col-start-1 lg:row-start-1 lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/globlex-logo-520.v1.webp"
            width={520}
            height={347}
            fetchPriority="high"
            alt="Globlex AI — The AI Architect Co."
            className="mx-auto mb-5 w-full min-w-0 max-w-[220px] lg:mx-0"
          />
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">{BRAND.tagline}</p>
          <p className="mt-1 text-lg font-semibold text-slate-200">{BRAND.name}</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">{BRAND.headline}</h1>
        </header>

        <main className="mx-auto w-full max-w-sm self-start rounded-xl2 bg-white p-8 shadow-xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-6 lg:max-w-md">
          <LoginPanel />
        </main>

        <section aria-label="What it does" className="lg:col-start-1 lg:row-start-2">
          <p className="mx-auto max-w-xl text-center text-base leading-relaxed text-slate-200 lg:mx-0 lg:text-left">{BRAND.intro}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {BRAND.pillars.map((p) => (
              <li key={p.title} className="rounded-xl2 border border-white/15 bg-black/30 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span aria-hidden>{p.icon}</span>
                  {p.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{p.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-sm text-slate-300 lg:text-left">
            <span className="font-semibold text-white">{BRAND.trust}</span> {BRAND.trustDetail}
          </p>
        </section>
      </div>

      <section aria-labelledby="erp-heading" className="mx-auto mt-14 max-w-6xl">
        <h2 id="erp-heading" className="text-center text-xl font-semibold text-white lg:text-left">
          {BRAND.connections.heading}
        </h2>
        <p className="mx-auto mt-1 max-w-3xl text-center text-sm leading-relaxed text-slate-300 lg:mx-0 lg:text-left">
          {BRAND.connections.statement}
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BRAND.connections.items.map((c) => (
            <li key={c.title} className="rounded-xl2 border border-white/15 bg-black/30 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden>{c.icon}</span>
                {c.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{c.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm text-slate-300 lg:text-left">{BRAND.connections.note}</p>
      </section>

      <footer className="mx-auto mt-12 flex max-w-6xl flex-col items-center gap-2 text-sm text-slate-300 lg:flex-row lg:justify-between">
        <span>{BRAND.byline}</span>
        <a href="/install" className="underline-offset-4 hover:text-white hover:underline">
          Install the app on this device
        </a>
      </footer>
    </div>
  );
}
