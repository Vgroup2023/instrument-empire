'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Label, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { AREA_GROUPS, PRACTICE_AREAS, US_STATES } from '@/lib/counsel/areas';
import { DRAFT_TEMPLATES } from '@/lib/counsel/templates';
import { DISCLAIMER, detectUrgent } from '@/lib/counsel/guard';
import type { ContractReview } from '@/lib/counsel/review';
import { call } from '@/components/rfqs/api';
import { MAX_DOCS, MAX_TOTAL_DOC_CHARS } from '@/lib/counsel/documents';
import { ACCEPT, extractFile, type ExtractedFile } from './extract';
import { Markdown } from './Markdown';

type Tab = 'ask' | 'review' | 'draft' | 'areas';
interface Turn { role: 'user' | 'assistant'; content: string }

const PROFILE_KEY = 'counsel.profile';
const STATE_KEY = 'counsel.state';

const STARTERS = [
  'My supplier shipped goods that fail our spec. What are my rights under the UCC and what should I do first?',
  'We import machined parts from several countries. What are our duties as importer of record, and where do companies get penalized?',
  'How should I structure a second LLC so one venture’s liabilities cannot reach the others?',
  'A customer is 90 days late on a $40,000 invoice. Walk me through my options in order.',
  'Do I need an export license to ship this to a distributor abroad? What do I need to find out first?',
  'I am going through a divorce and own 100% of an operating company. How do I protect it?',
];

// A tiny browser-storage store so the saved profile and state show up after load without a hydration mismatch.
const listeners = new Set<() => void>();
const subscribeStore = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function readStore(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function writeStore(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage can be blocked; the page works without it */ }
  listeners.forEach((l) => l());
}

const SEVERITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;

/** Streams a chat reply from the server into onText, calling it with the full text so far. */
async function streamChat(payload: unknown, onText: (t: string) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch('/api/counsel/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal, cache: 'no-store' });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
}

export function CounselClient({ claudeOn }: { claudeOn: boolean }) {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('ask');
  const [area, setArea] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  // The profile and state live only in this browser. Nothing here is stored on the server.
  const profile = useSyncExternalStore(subscribeStore, () => readStore(PROFILE_KEY), () => '');
  const state = useSyncExternalStore(subscribeStore, () => readStore(STATE_KEY), () => '');
  const saveProfile = (v: string) => writeStore(PROFILE_KEY, v);
  const saveState = (v: string) => writeStore(STATE_KEY, v);

  const ctx = { area: area || undefined, state: state || undefined, profile: profile || undefined };

  return (
    <div className="space-y-4">
      {!claudeOn ? (
        <div className="rounded-lg border border-gold-300 bg-gold-100 px-4 py-3 text-sm text-gold-800">
          Counsel is switched off because no <code>ANTHROPIC_API_KEY</code> is set on the server. The practice-area guide still works.
        </div>
      ) : null}

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="c-area">Practice area</Label>
            <Select id="c-area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Let Counsel decide</option>
              {AREA_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {PRACTICE_AREAS.filter((a) => a.group === g).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="c-state">Governing state</Label>
            <Select id="c-state" value={state} onChange={(e) => saveState(e.target.value)}>
              <option value="">Not sure / federal</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={() => setShowProfile((v) => !v)}>
              {profile.trim() ? 'Edit my business profile' : 'Add my business profile'}
            </Button>
          </div>
          {showProfile ? (
            <div className="sm:col-span-3">
              <Label htmlFor="c-profile">Your ventures (kept in this browser only)</Label>
              <Textarea id="c-profile" rows={5} maxLength={4000} value={profile} onChange={(e) => saveProfile(e.target.value)}
                placeholder="e.g. Acme Machining LLC (Texas, CNC parts, imports castings from Mexico and Taiwan, exports to Canada). Acme Holdings LLC (Delaware, owns equipment). I am married, residing in Texas." />
              <p className="mt-1 text-xs text-slate-500">Counsel reads this with every question so advice fits all your ventures. Leave out Social Security numbers, bank numbers and passwords.</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['ask', 'Ask Counsel'], ['review', 'Review a contract'], ['draft', 'Draft a document'], ['areas', 'What Counsel covers']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'ask' ? <AskTab ctx={ctx} claudeOn={claudeOn} notify={notify} /> : null}
      {tab === 'review' ? <ReviewTab ctx={ctx} claudeOn={claudeOn} notify={notify} /> : null}
      {tab === 'draft' ? <DraftTab ctx={ctx} claudeOn={claudeOn} notify={notify} area={area} /> : null}
      {tab === 'areas' ? <AreasTab onPick={(id) => { setArea(id); setTab('ask'); }} /> : null}

      <p className="text-xs text-slate-500">{DISCLAIMER}</p>
    </div>
  );
}

type Ctx = { area?: string; state?: string; profile?: string };
type Notify = (m: string, tone?: 'success' | 'error') => void;

function UrgentBanner({ text }: { text: string }) {
  const flags = detectUrgent(text);
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.id} role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">{f.title}</p>
          <p className="mt-1">{f.advice}</p>
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text, notify }: { text: string; notify: Notify }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(text).then(() => notify('Copied.'), () => notify('Could not copy.', 'error'))}>Copy</Button>
  );
}


/** Reads files in the browser (large ones included) and keeps the list of attached documents. */
function useAttachments(notify: Notify) {
  const [docs, setDocs] = useState<ExtractedFile[]>([]);
  const [reading, setReading] = useState<string | null>(null);

  async function add(files: FileList | File[] | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (docs.length >= MAX_DOCS) { notify(`You can attach up to ${MAX_DOCS} documents at a time.`, 'error'); break; }
      setReading(`Reading ${f.name}…`);
      try {
        const d = await extractFile(f, (done, total) => setReading(`Reading ${f.name}: page ${done} of ${total}`));
        setDocs((cur) => [...cur.filter((x) => x.name !== d.name), d]);
        if (d.note) notify(d.note, 'error');
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    }
    setReading(null);
  }
  const remove = (name: string) => setDocs((cur) => cur.filter((d) => d.name !== name));
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  return { docs, reading, add, remove, clear: () => setDocs([]), total };
}

function AttachBar({ att, disabled, label = 'Attach documents' }: { att: ReturnType<typeof useAttachments>; disabled?: boolean; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void att.add(e.target.files); e.target.value = ''; }} />
        <Button size="sm" variant="secondary" disabled={disabled || Boolean(att.reading)} onClick={() => input.current?.click()}>📎 {label}</Button>
        <span className="text-xs text-slate-500">PDF, Word, or text files of any size. Big files are read on your computer; only the text is sent.</span>
      </div>
      {att.reading ? <p className="text-xs text-slate-600" role="status">{att.reading}</p> : null}
      {att.docs.length ? (
        <ul className="space-y-1">
          {att.docs.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium text-slate-800">{d.name}</span>
                <span className="ml-2 text-xs text-slate-500">{d.pages ? (d.pagesRead && d.pagesRead < d.pages ? `first ${d.pagesRead} of ${d.pages} pages · ` : `${d.pages} pages · `) : ''}{d.text.length.toLocaleString()} characters{d.clipped ? ' · shortened' : ''}</span>
              </span>
              <button aria-label={`Remove ${d.name}`} className="text-slate-400 hover:text-red-600" onClick={() => att.remove(d.name)}>✕</button>
            </li>
          ))}
        </ul>
      ) : null}
      {att.total > MAX_TOTAL_DOC_CHARS ? (
        <p className="text-xs text-red-700">Together these are over the {MAX_TOTAL_DOC_CHARS.toLocaleString()}-character limit. Counsel will read the first {MAX_TOTAL_DOC_CHARS.toLocaleString()}; remove a document or attach the rest separately.</p>
      ) : null}
    </div>
  );
}

function AskTab({ ctx, claudeOn, notify }: { ctx: Ctx; claudeOn: boolean; notify: Notify }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const att = useAttachments(notify);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
  useEffect(() => () => abort.current?.abort(), []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    try {
      await streamChat({ messages: next, documents: att.docs.map(({ name, text }) => ({ name, text })), ...ctx }, (t) => setTurns([...next, { role: 'assistant', content: t }]), abort.current.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        notify((err as Error).message, 'error');
        setTurns(next);
        setInput(q);
      }
    } finally {
      setBusy(false);
    }
  }

  const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.content ?? input;
  return (
    <div className="space-y-3">
      {turns.length === 0 ? (
        <Card>
          <CardHeader><div><CardTitle>Ask anything about your businesses or your life</CardTitle><CardDescription>Try one of these, or type your own.</CardDescription></div></CardHeader>
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button key={s} disabled={!claudeOn} onClick={() => send(s)} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50">{s}</button>
            ))}
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {turns.map((t, i) => (
            <Card key={i} className={t.role === 'user' ? 'bg-slate-50' : ''}>
              <CardBody>
                <div className="mb-1 flex items-center justify-between">
                  <Badge tone={t.role === 'user' ? 'neutral' : 'brand'}>{t.role === 'user' ? 'You' : 'Counsel'}</Badge>
                  {t.role === 'assistant' && t.content ? <CopyButton text={t.content} notify={notify} /> : null}
                </div>
                {t.role === 'user' ? <p className="whitespace-pre-wrap text-sm text-slate-800">{t.content}</p> : t.content ? <Markdown text={t.content} /> : <p className="text-sm text-slate-500">Researching…</p>}
              </CardBody>
            </Card>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <UrgentBanner text={lastUser} />

      <Card>
        <CardBody className="space-y-2">
          <Textarea rows={4} maxLength={30000} value={input} disabled={!claudeOn} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(input); } }}
            placeholder="Describe the situation: who is involved, what happened, what you signed, dates, amounts, and what outcome you want. Paste emails or clauses if you have them." />
          <AttachBar att={att} disabled={!claudeOn || busy} />
          {att.docs.length && !turns.length ? (
            <div className="flex flex-wrap gap-2">
              {['Summarize this document in plain English and list the deadlines and money amounts.', 'What are the biggest risks to me in this document, in order?', 'What am I obligated to do, and what happens if I do not?'].map((q) => (
                <button key={q} disabled={busy} onClick={() => send(q)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-brand-400 hover:bg-brand-50">{q}</button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Ctrl/⌘ + Enter to send</span>
            <div className="flex gap-2">
              {turns.length ? <Button variant="ghost" disabled={busy} onClick={() => { setTurns([]); att.clear(); }}>New matter</Button> : null}
              {busy ? <Button variant="secondary" onClick={() => abort.current?.abort()}>Stop</Button> : null}
              <Button loading={busy} disabled={!claudeOn || !input.trim()} onClick={() => send(input)}>Ask Counsel</Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ReviewTab({ ctx, claudeOn, notify }: { ctx: Ctx; claudeOn: boolean; notify: Notify }) {
  const [text, setText] = useState('');
  const att = useAttachments(notify);
  const [side, setSide] = useState('neutral');
  const [goals, setGoals] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ContractReview | null>(null);

  async function run() {
    setBusy(true);
    setReview(null);
    try {
      const fromFiles = att.docs.map((d) => `=== ${d.name} ===\n${d.text}`).join('\n\n');
      const payload: Record<string, unknown> = { text: [fromFiles, text].filter(Boolean).join('\n\n'), side, goals, ...ctx };
      const res = await call<{ review: ContractReview }>('POST', '/api/counsel/review', payload);
      setReview(res.review);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><div><CardTitle>Contract review</CardTitle><CardDescription>Upload a PDF or Word file of any size, or paste the agreement. Counsel flags risks by severity and proposes fixes.</CardDescription></div></CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="r-side">I am the</Label>
              <Select id="r-side" value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="neutral">Not sure / balanced read</option>
                <option value="buyer">Buyer / customer / payer</option>
                <option value="seller">Seller / vendor / provider</option>
              </Select>
            </div>
            <div>
              <Label>Contract file</Label>
              <AttachBar att={att} disabled={!claudeOn} label="Upload contract" />
            </div>
          </div>
          <div>
            <Label htmlFor="r-text">Or paste the contract text</Label>
            <Textarea id="r-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="r-goals">What matters most to you in this deal? (optional)</Label>
            <Textarea id="r-goals" rows={2} maxLength={1000} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. I need to exit within 12 months. I cannot accept unlimited liability." />
          </div>
          <Button loading={busy} disabled={!claudeOn || (!text.trim() && !att.docs.length)} onClick={run}>Review this contract</Button>
        </CardBody>
      </Card>

      {review ? (
        review.unreadable ? (
          <Card><CardBody className="text-sm text-slate-700">Counsel could not find a reviewable agreement in that text. Check the file or paste the full document.</CardBody></Card>
        ) : (
          <div className="space-y-3">
            <Card>
              <CardHeader><div><CardTitle>{review.documentType ?? 'Agreement'}</CardTitle>{review.parties.length ? <CardDescription>{review.parties.join(' · ')}</CardDescription> : null}</div></CardHeader>
              <CardBody className="space-y-3">
                <p className="text-sm text-slate-800">{review.summary}</p>
                {review.keyTerms.length ? (
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {review.keyTerms.map((k) => <div key={k.term} className="flex gap-2"><dt className="font-medium text-slate-700">{k.term}:</dt><dd className="text-slate-800">{k.value}</dd></div>)}
                  </dl>
                ) : null}
              </CardBody>
            </Card>
            {review.findings.map((f, i) => (
              <Card key={i}>
                <CardBody className="space-y-1">
                  <div className="flex items-center gap-2"><Badge tone={SEVERITY_TONE[f.severity]}>{f.severity.toUpperCase()}</Badge><span className="text-sm font-semibold text-slate-900">{f.clause}</span></div>
                  <p className="text-sm text-slate-800">{f.issue}</p>
                  {f.whyItMatters ? <p className="text-sm text-slate-600"><span className="font-medium">Why it matters:</span> {f.whyItMatters}</p> : null}
                  {f.suggestedFix ? <p className="text-sm text-slate-800"><span className="font-medium">Ask for:</span> {f.suggestedFix}</p> : null}
                </CardBody>
              </Card>
            ))}
            {review.missingProtections.length ? (
              <Card><CardHeader><CardTitle>Protections that are missing</CardTitle></CardHeader><CardBody><ul className="ml-5 list-disc space-y-1 text-sm text-slate-800">{review.missingProtections.map((m, i) => <li key={i}>{m}</li>)}</ul></CardBody></Card>
            ) : null}
            {review.questionsForCounsel.length ? (
              <Card><CardHeader><CardTitle>Questions to take to your attorney</CardTitle></CardHeader><CardBody><ul className="ml-5 list-disc space-y-1 text-sm text-slate-800">{review.questionsForCounsel.map((m, i) => <li key={i}>{m}</li>)}</ul></CardBody></Card>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

function DraftTab({ ctx, claudeOn, notify, area }: { ctx: Ctx; claudeOn: boolean; notify: Notify; area: string }) {
  const [templateId, setTemplateId] = useState(DRAFT_TEMPLATES[0].id);
  const [facts, setFacts] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const template = DRAFT_TEMPLATES.find((t) => t.id === templateId) ?? DRAFT_TEMPLATES[0];
  const list = area ? DRAFT_TEMPLATES.filter((t) => t.areaId === area) : DRAFT_TEMPLATES;
  const options = list.length ? list : DRAFT_TEMPLATES;

  async function run() {
    setBusy(true);
    setOut('');
    abort.current = new AbortController();
    const q = `Draft ${template.prompt}.\n\nDeal facts from the owner:\n${facts || '(none given; use placeholders)'}`;
    try {
      await streamChat({ messages: [{ role: 'user', content: q }], mode: 'draft', ...ctx, area: ctx.area ?? template.areaId }, setOut, abort.current.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><div><CardTitle>Draft a document</CardTitle><CardDescription>Counsel writes a first draft with [BRACKETED] blanks and drafting notes. Have an attorney review it before anyone signs.</CardDescription></div></CardHeader>
        <CardBody className="space-y-3">
          <div>
            <Label htmlFor="d-type">Document</Label>
            <Select id="d-type" value={options.some((o) => o.id === templateId) ? templateId : options[0].id} onChange={(e) => setTemplateId(e.target.value)}>
              {options.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="d-facts">Facts to include</Label>
            <Textarea id="d-facts" rows={5} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder={template.facts} />
          </div>
          <div className="flex gap-2">
            <Button loading={busy} disabled={!claudeOn} onClick={run}>Draft it</Button>
            {busy ? <Button variant="secondary" onClick={() => abort.current?.abort()}>Stop</Button> : null}
          </div>
        </CardBody>
      </Card>
      {out ? (
        <Card>
          <CardHeader><CardTitle>Draft</CardTitle><CopyButton text={out} notify={notify} /></CardHeader>
          <CardBody><Markdown text={out} /></CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function AreasTab({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {AREA_GROUPS.map((g) => (
        <div key={g}>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{g}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {PRACTICE_AREAS.filter((a) => a.group === g).map((a) => (
              <Card key={a.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{a.label}</span>
                    {a.fastMoving ? <Badge tone="warning">Changes often</Badge> : null}
                  </div>
                  <p className="text-sm text-slate-700">{a.covers}</p>
                  <p className="text-xs text-slate-500">Anchored on: {a.anchors}</p>
                  <Button size="sm" variant="secondary" onClick={() => onPick(a.id)}>Ask about this</Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
