'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { OPEN_STAGES, crmMetrics, followUpDue, stageInfo, KIND_INFO, type Activity, type Contact, type Deal, type Draft, type Report, type StageKey } from '@/lib/crm/model';
import { crmCall, loadActor, saveActor } from './api';
import { CrmDashboard } from './CrmDashboard';
import { PipelineBoard } from './PipelineBoard';
import { DealDialog } from './DealDialog';
import { ContactsPanel } from './ContactsPanel';
import { ActivityPanel } from './ActivityPanel';
import { UpcomingPanel } from './UpcomingPanel';
import { DraftsPanel } from './DraftsPanel';
import { ReportsPanel } from './ReportsPanel';
import { ConnectionsPanel } from './ConnectionsPanel';

type Snap = { deals: Deal[]; contacts: Contact[]; activities: Activity[]; drafts: Draft[]; reports: Report[]; now: string };
type Tab = 'dashboard' | 'pipeline' | 'contacts' | 'activity' | 'upcoming' | 'review' | 'reports' | 'connections';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pipeline', label: 'Pipeline', icon: '🧲' },
  { id: 'contacts', label: 'Contacts', icon: '👤' },
  { id: 'activity', label: 'Activity', icon: '⚡' },
  { id: 'upcoming', label: 'Upcoming', icon: '📅' },
  { id: 'review', label: 'Review', icon: '✍️' },
  { id: 'reports', label: 'Reports', icon: '📑' },
  { id: 'connections', label: 'Connections & agents', icon: '🔌' },
];

const POLL_MS = 4000;
const FULL_REFRESH_MS = 30_000;

/** Merges changed rows into a list by id, newest data winning. */
function merge<T extends { id: string; updatedAt: string }>(list: T[], changed: T[]): T[] {
  if (changed.length === 0) return list;
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const c of changed) {
    const old = byId.get(c.id);
    if (!old || old.updatedAt <= c.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()];
}

export function CrmClient({ initial }: { initial: Snap }) {
  const { notify } = useToast();
  const [deals, setDeals] = useState(initial.deals);
  const [contacts, setContacts] = useState(initial.contacts);
  const [activities, setActivities] = useState(initial.activities);
  const [drafts, setDrafts] = useState(initial.drafts);
  const [reports, setReports] = useState(initial.reports);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>('dashboard');
  const [actor, setActor] = useState('Office team');
  const [nameOpen, setNameOpen] = useState(false);
  const [live, setLive] = useState(true);
  const [dealId, setDealId] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState<{ stage: StageKey; contactId?: string } | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null);

  const since = useRef(initial.now);
  const known = useRef(new Set(initial.activities.map((a) => a.id)));
  const actorRef = useRef(actor);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved name lives in this browser, readable only after hydration
  useEffect(() => setActor(loadActor()), []);
  useEffect(() => { actorRef.current = actor; }, [actor]);
  // "Due" and "overdue" counts are measured against this, refreshed twice a minute so they stay right on a page left open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const addActivity = useCallback((a: Activity) => {
    known.current.add(a.id);
    setActivities((prev) => merge(prev, [a]).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)));
  }, []);

  // The live feed: ask what changed every few seconds while the tab is open and visible, and once in a while reload
  // everything so deletions made elsewhere disappear too.
  useEffect(() => {
    let stopped = false;
    let lastFull = Date.now();
    let busy = false;
    async function poll() {
      if (stopped || busy || document.hidden) return;
      busy = true;
      try {
        if (Date.now() - lastFull > FULL_REFRESH_MS) {
          const s = await crmCall<Snap>('/api/crm');
          if (stopped) return;
          setDeals(s.deals); setContacts(s.contacts); setActivities(s.activities); setDrafts(s.drafts); setReports(s.reports);
          s.activities.forEach((a) => known.current.add(a.id));
          since.current = s.now;
          lastFull = Date.now();
        } else {
          // A few seconds of overlap so a change committed just after the last check is not missed.
          const from = new Date(Date.parse(since.current) - 3000).toISOString();
          const s = await crmCall<Snap>(`/api/crm?since=${encodeURIComponent(from)}`);
          if (stopped) return;
          setDeals((p) => merge(p, s.deals));
          setContacts((p) => merge(p, s.contacts));
          setDrafts((p) => merge(p, s.drafts));
          setReports((p) => merge(p, s.reports));
          const fresh = s.activities.filter((a) => !known.current.has(a.id));
          for (const a of fresh) {
            known.current.add(a.id);
            if (a.actor !== actorRef.current) notify(`${a.actor}: ${KIND_INFO[a.kind].icon} ${a.summary}`);
          }
          setActivities((p) => merge(p, s.activities).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)));
          since.current = s.now;
        }
        setLive(true);
      } catch {
        setLive(false);
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [notify]);

  const metrics = useMemo(() => crmMetrics(deals, activities), [deals, activities]);
  const openDeal = deals.find((d) => d.id === dealId) ?? null;
  const attention = useMemo(() => {
    const withOpenDeal = new Set(deals.filter((d) => OPEN_STAGES.includes(d.stage) && d.contactId).map((d) => d.contactId));
    const horizon = new Date(now + 7 * 86_400_000).toISOString();
    const nowIso = new Date(now).toISOString();
    return {
      drafts: drafts.filter((d) => d.status === 'pending' || d.status === 'failed').length,
      followUps: contacts.filter((c) => {
        const days = c.followUpDays ?? (withOpenDeal.has(c.id) ? 7 : null);
        return days !== null && c.status !== 'archived' && followUpDue({ ...c, followUpDays: days }, now);
      }).length,
      meetings: activities.filter((a) => a.kind === 'meeting' && !a.doneAt && a.dueAt && a.dueAt > nowIso && a.dueAt <= horizon).length,
    };
  }, [deals, contacts, drafts, activities, now]);

  function upsertDeal(d: Deal) {
    setDeals((p) => [d, ...p.filter((x) => x.id !== d.id)]);
    // Moving a deal records history on the server; fetch it now rather than waiting for the next live check.
    void crmCall<{ activities: Activity[] }>(`/api/crm/activities?dealId=${d.id}`).then((r) => r.activities.forEach(addActivity)).catch(() => {});
  }
  function upsertContact(c: Contact) {
    setContacts((p) => [c, ...p.filter((x) => x.id !== c.id)]);
    void crmCall<{ activities: Activity[] }>(`/api/crm/activities?contactId=${c.id}`).then((r) => r.activities.forEach(addActivity)).catch(() => {});
  }

  async function move(id: string, stage: StageKey, reason?: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    if (stage === 'lost' && reason === undefined) { setLost({ id, reason: '' }); return; }
    const before = deal;
    setDeals((p) => p.map((d) => (d.id === id ? { ...d, stage } : d)));
    try {
      const { deal: saved } = await crmCall<{ deal: Deal }>(`/api/crm/deals/${id}`, 'PATCH', { stage, actor, lostReason: reason });
      upsertDeal(saved);
      notify(stage === 'won' ? `Won! ${saved.title} is now a customer.` : `Moved to ${stageInfo(stage).label}.`);
    } catch (err) {
      setDeals((p) => p.map((d) => (d.id === id ? before : d)));
      notify(err instanceof Error ? err.message : 'Could not move the deal.', 'error');
    }
  }

  async function toggleTask(a: Activity) {
    try {
      const { activity } = await crmCall<{ activity: Activity }>(`/api/crm/activities/${a.id}`, 'PATCH', { done: !a.doneAt });
      addActivity(activity);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the task.', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Leads, deals and every call, email and meeting, recorded as it happens."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setNameOpen(true)} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100" title="Your name on the activity you record">
              Recording as <b>{actor}</b>
            </button>
            <Button variant="secondary" onClick={() => setTab('contacts')}>+ Contact</Button>
            <Button onClick={() => setNewDeal({ stage: 'lead' })}>+ New deal</Button>
          </div>
        }
      />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setOpenContactId(null); setTab(t.id); }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === t.id ? 'border-transparent bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <span aria-hidden className="mr-1">{t.icon}</span>{t.label}
            {t.id === 'upcoming' && metrics.tasksOpen ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${metrics.tasksOverdue ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{metrics.tasksOpen}</span> : null}
            {t.id === 'review' && attention.drafts ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{attention.drafts}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <CrmDashboard m={metrics} deals={deals} activities={activities} onOpenDeal={setDealId} onToggleTask={toggleTask} live={live} attention={attention} onGo={setTab} /> : null}
      {tab === 'pipeline' ? <PipelineBoard deals={deals} contacts={contacts} onOpen={setDealId} onMove={move} onNew={(stage) => setNewDeal({ stage })} /> : null}
      {tab === 'contacts' ? (
        <ContactsPanel contacts={contacts} deals={deals} activities={activities} actor={actor} onSaved={upsertContact}
          onDeleted={(id) => setContacts((p) => p.filter((c) => c.id !== id))} onActivity={addActivity} onToggleTask={toggleTask}
          onNewDeal={(contactId) => setNewDeal({ stage: 'lead', contactId })} initialOpenId={openContactId} />
      ) : null}
      {tab === 'activity' ? <ActivityPanel mode="feed" activities={activities} deals={deals} contacts={contacts} onOpenDeal={setDealId} onToggleTask={toggleTask} /> : null}
      {tab === 'upcoming' ? (
        <UpcomingPanel activities={activities} deals={deals} contacts={contacts} onOpenDeal={setDealId} onToggleTask={toggleTask}
          onOpenContact={(id) => { setOpenContactId(id); setTab('contacts'); }} />
      ) : null}
      {tab === 'review' ? <DraftsPanel drafts={drafts} contacts={contacts} actor={actor} onChanged={(d) => setDrafts((p) => merge(p, [d]))} onActivity={addActivity} /> : null}
      {tab === 'reports' ? <ReportsPanel reports={reports} onReport={(r) => setReports((p) => merge(p, [r]))} /> : null}
      {tab === 'connections' ? <ConnectionsPanel onRan={() => void crmCall<Snap>('/api/crm').then((s) => { setDeals(s.deals); setContacts(s.contacts); setActivities(s.activities); setDrafts(s.drafts); setReports(s.reports); since.current = s.now; }).catch(() => undefined)} /> : null}

      <DealDialog
        open={openDeal !== null || newDeal !== null}
        onClose={() => { setDealId(null); setNewDeal(null); }}
        deal={openDeal}
        startStage={newDeal?.stage ?? 'lead'}
        contacts={contacts}
        activities={activities}
        actor={actor}
        initialContactId={newDeal?.contactId}
        onSaved={upsertDeal}
        onDeleted={(id) => setDeals((p) => p.filter((d) => d.id !== id))}
        onActivity={addActivity}
        onToggleTask={toggleTask}
      />

      <Modal open={lost !== null} onClose={() => setLost(null)} title="Mark this deal as lost" size="sm"
        footer={<><Button variant="secondary" onClick={() => setLost(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (lost) { void move(lost.id, 'lost', lost.reason); setLost(null); } }}>Mark lost</Button></>}>
        <label className="block text-xs font-medium text-slate-700" htmlFor="lost-reason">Why was it lost? (optional)</label>
        <Input id="lost-reason" value={lost?.reason ?? ''} onChange={(e) => setLost((l) => (l ? { ...l, reason: e.target.value } : l))} maxLength={300} placeholder="Price, timing, chose a competitor…" />
      </Modal>

      <Modal open={nameOpen} onClose={() => setNameOpen(false)} title="Your name" description="Shown on every activity you record, so the team can see who did what."
        footer={<Button onClick={() => { const n = actor.trim() || 'Office team'; saveActor(n); setActor(n); setNameOpen(false); }}>Save</Button>}>
        <Input value={actor} onChange={(e) => setActor(e.target.value)} maxLength={60} aria-label="Your name" />
      </Modal>
    </div>
  );
}
