'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { BUSINESSES, crmMetrics, nextActions, reorderSchedule, reordersToAct, stageInfo, KIND_INFO, type Activity, type Contact, type Deal, type Draft, type NextAction, type Report, type ReorderItem, type StageKey } from '@/lib/crm/model';
import { crmCall, loadActor, saveActor } from './api';
import { DealDialog } from './DealDialog';
import { ContactsPanel } from './ContactsPanel';
import { ActivityPanel } from './ActivityPanel';
import { UpcomingPanel } from './UpcomingPanel';
import { DraftsPanel } from './DraftsPanel';
import { LeadsPanel } from './LeadsPanel';
import { BusinessBoard } from './BusinessBoard';
import { NextActionsPanel } from './NextActionsPanel';
import { PipelineView } from './PipelineView';
import { ReordersPanel } from './ReordersPanel';
import { RulesPanel } from './RulesPanel';
import { Segmented } from './Segmented';
import { AccountsPanel } from './AccountsPanel';
import { PostSalesPanel } from './PostSalesPanel';
import { SalesOpsPanel } from './SalesOpsPanel';

type Snap = { deals: Deal[]; contacts: Contact[]; activities: Activity[]; drafts: Draft[]; reports: Report[]; now: string };
type Tab = 'pipeline' | 'leads' | 'contacts' | 'reorders' | 'followups' | 'reports' | 'rules';
type FollowView = 'next' | 'upcoming' | 'review' | 'activity';
type ReportView = 'team' | 'businesses' | 'collections';
/** The sections, in the order work moves through them: the deal, the lead behind it, the account, the next order, the chasing, the numbers, the settings. */
const TABS: { id: Tab; label: string; about: string }[] = [
  { id: 'pipeline', label: 'Pipeline', about: 'Deals by stage, from new lead to reorder. Drag a deal on; a quote sent that goes quiet gets a follow-up.' },
  { id: 'leads', label: 'Leads', about: 'New and qualified leads, scored so the best to call come first. Qualify one, then make it a deal.' },
  { id: 'contacts', label: 'Accounts', about: 'Every company and person: details, the whole conversation, their deals, and the next follow-up.' },
  { id: 'reorders', label: 'Reorders', about: 'How often each customer reorders, and who is due. Start a reorder and it becomes a deal.' },
  { id: 'followups', label: 'Follow-ups', about: 'Everything waiting on a person, in the order to do it: messages to answer, tasks, meetings and drafts to approve.' },
  { id: 'reports', label: 'Reports', about: 'How the team and each business are doing, what has been billed and collected, and the daily and weekly reports.' },
  { id: 'rules', label: 'Rules', about: 'What the CRM does on its own, where messages come from, and where alerts go.' },
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

export function CrmClient({ initial, signedInAs }: { initial: Snap; signedInAs?: string | null }) {
  const { notify } = useToast();
  const [deals, setDeals] = useState(initial.deals);
  const [contacts, setContacts] = useState(initial.contacts);
  const [activities, setActivities] = useState(initial.activities);
  const [drafts, setDrafts] = useState(initial.drafts);
  const [reports, setReports] = useState(initial.reports);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>('pipeline');
  const [biz, setBiz] = useState<string>('all');
  const [peopleView, setPeopleView] = useState<'people' | 'accounts'>('accounts');
  const [followView, setFollowView] = useState<FollowView>('next');
  const [reportView, setReportView] = useState<ReportView>('team');
  const [actor, setActor] = useState(signedInAs ?? 'Office team');
  const [nameOpen, setNameOpen] = useState(false);
  const [live, setLive] = useState(true);
  const [dealId, setDealId] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState<{ stage: StageKey; contactId?: string } | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null);

  const since = useRef(initial.now);
  const known = useRef(new Set(initial.activities.map((a) => a.id)));
  const actorRef = useRef(actor);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved name lives in this browser, readable only after hydration
  useEffect(() => { if (!signedInAs) setActor(loadActor()); }, [signedInAs]);
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

  // Looking at one business narrows everything below to its contacts, deals and the activity on them.
  const view = useMemo(() => {
    if (biz === 'all') return { contacts, deals, activities, drafts };
    const match = (b: string | null) => (biz === 'none' ? !b : b === biz);
    const cs = contacts.filter((c) => match(c.business));
    const ds = deals.filter((d) => match(d.business));
    const cIds = new Set(cs.map((c) => c.id));
    const dIds = new Set(ds.map((d) => d.id));
    return {
      contacts: cs,
      deals: ds,
      activities: activities.filter((a) => (a.contactId && cIds.has(a.contactId)) || (a.dealId && dIds.has(a.dealId))),
      drafts: drafts.filter((d) => cIds.has(d.contactId)),
    };
  }, [biz, contacts, deals, activities, drafts]);
  const bizCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) if (c.status !== 'archived') m.set(c.business ?? 'none', (m.get(c.business ?? 'none') ?? 0) + 1);
    return m;
  }, [contacts]);

  const metrics = useMemo(() => crmMetrics(view.deals, view.activities), [view.deals, view.activities]);
  const nextItems = useMemo(() => nextActions({ activities: view.activities, contacts: view.contacts, deals: view.deals, drafts: view.drafts, now }), [view, now]);
  const nowCount = nextItems.filter((x) => x.level === 'now').length;
  const reorderAll = useMemo(() => reorderSchedule(view.contacts, view.deals, now), [view.contacts, view.deals, now]);
  const reorderDue = useMemo(() => reordersToAct(reorderAll), [reorderAll]);
  const leadCount = view.contacts.filter((c) => c.status === 'lead' || c.status === 'qualified').length;
  const tabBadge: Partial<Record<Tab, { n: number; tone: string }>> = {
    leads: { n: leadCount, tone: 'bg-slate-200 text-slate-700' },
    reorders: { n: reorderDue.length, tone: 'bg-amber-500 text-white' },
    followups: { n: nextItems.length, tone: nowCount ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700' },
  };
  const openDeal = deals.find((d) => d.id === dealId) ?? null;
  const draftCount = useMemo(() => view.drafts.filter((d) => d.status === 'pending' || d.status === 'failed').length, [view.drafts]);

  function upsertDeal(d: Deal) {
    setDeals((p) => [d, ...p.filter((x) => x.id !== d.id)]);
    // Moving a deal records history on the server; fetch it now rather than waiting for the next live check.
    void crmCall<{ activities: Activity[] }>(`/api/crm/activities?dealId=${d.id}`).then((r) => r.activities.forEach(addActivity)).catch(() => {});
  }
  function upsertContact(c: Contact) {
    setContacts((p) => [c, ...p.filter((x) => x.id !== c.id)]);
    void crmCall<{ activities: Activity[] }>(`/api/crm/activities?contactId=${c.id}`).then((r) => r.activities.forEach(addActivity)).catch(() => {});
  }

  // New records start in the business being looked at.
  const dflt = biz === 'all' || biz === 'none' ? undefined : biz;
  // Ticks off a task or marks a received message handled.
  function doneAction(a: NextAction) { if (a.activity) void toggleTask(a.activity); }
  function goTab(t: Tab) { setOpenContactId(null); setTab(t); }
  function openContact(id: string) { setOpenContactId(id); setPeopleView('people'); setTab('contacts'); }

  // Starts a reorder: opens a deal for the customer, valued at their last order, in the pipeline.
  async function startReorder(r: ReorderItem) {
    try {
      const { deal } = await crmCall<{ deal: Deal }>('/api/crm/deals', 'POST', {
        title: `Reorder: ${r.company ?? r.name}`, value: r.lastValue, currency: r.currency, contactId: r.contactId,
        owner: r.owner ?? actor, business: r.business ?? undefined, stage: 'lead', actor,
      });
      upsertDeal(deal);
      notify(`Reorder started for ${r.company ?? r.name}. It is in New lead.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start the reorder.', 'error');
    }
  }
  async function setReorderDays(contactId: string, days: number | null) {
    try {
      const { contact } = await crmCall<{ contact: Contact }>(`/api/crm/contacts/${contactId}`, 'PATCH', { reorderDays: days });
      upsertContact(contact);
      notify(days ? `Reorders every ${days} days.` : 'Reorder schedule removed.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the schedule.', 'error');
    }
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
          <div className="flex flex-wrap items-center justify-end gap-2 [&_button]:whitespace-nowrap">
            {!live ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800" role="status">Offline, retrying…</span> : null}
            {signedInAs ? (
              <span className="px-2.5 py-1.5 text-xs text-slate-600">Recording as <b>{signedInAs}</b></span>
            ) : (
              <button type="button" onClick={() => setNameOpen(true)} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100" title="Your name on the activity you record">
                Recording as <b>{actor}</b>
              </button>
            )}
            <Button variant="secondary" onClick={() => goTab('leads')}>+ Lead</Button>
            <Button onClick={() => setNewDeal({ stage: 'lead' })}>+ New deal</Button>
          </div>
        }
      />
      <div role="group" aria-label="Business" className="mb-3 items-center text-sm flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] -mx-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Business</span>
        {[{ key: 'all', name: 'All businesses', color: '#0f2059' }, ...BUSINESSES.map((b) => ({ key: b.key as string, name: b.name, color: b.color as string })), ...((bizCounts.get('none') ?? 0) > 0 || biz === 'none' ? [{ key: 'none', name: 'Not tagged', color: '#64748b' }] : [])].map((b) => (
          <button key={b.key} type="button" aria-pressed={biz === b.key} onClick={() => setBiz(b.key)}
            className={`rounded-full border px-3 py-1 font-medium ${biz === b.key ? 'text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            style={biz === b.key ? { background: b.color, borderColor: b.color } : undefined}>
            {b.name}{b.key !== 'all' && bizCounts.get(b.key) ? <span className={`ml-1.5 text-xs ${biz === b.key ? 'text-white/80' : 'text-slate-400'}`}>{bizCounts.get(b.key)}</span> : null}
          </button>
        ))}
      </div>
      <nav aria-label="CRM sections" role="tablist" className="mb-2 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] -mx-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
        {TABS.map((t, i) => {
          const badge = tabBadge[t.id];
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => goTab(t.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === t.id ? 'border-transparent bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <span aria-hidden className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${tab === t.id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
              {t.label}
              {badge && badge.n ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab === t.id ? 'bg-white/25 text-white' : badge.tone}`}>{badge.n}</span> : null}
            </button>
          );
        })}
      </nav>
      <p className="mb-5 text-sm text-slate-600">{TABS.find((t) => t.id === tab)?.about}</p>

      {tab === 'pipeline' ? (
        <PipelineView m={metrics} deals={view.deals} contacts={contacts} reorders={reorderDue} now={now} actor={actor} onOpen={setDealId} onMove={move}
          onNew={(stage) => setNewDeal({ stage })} onStartReorder={startReorder} onOpenContact={openContact} />
      ) : null}
      {tab === 'leads' ? (
        <LeadsPanel contacts={view.contacts} deals={view.deals} activities={view.activities} actor={actor} onSaved={upsertContact} defaultBusiness={dflt}
          onNewDeal={(contactId) => setNewDeal({ stage: 'lead', contactId })} onOpenContact={openContact} />
      ) : null}
      {tab === 'contacts' ? (
        <>
          <Segmented label="View" value={peopleView} onChange={setPeopleView} options={[{ id: 'accounts', label: 'Accounts' }, { id: 'people', label: 'People' }]} />
          {peopleView === 'accounts' ? <AccountsPanel contacts={view.contacts} deals={view.deals} onOpenContact={openContact} onOpenDeal={setDealId} /> : (
            <ContactsPanel contacts={view.contacts} deals={view.deals} activities={view.activities} actor={actor} defaultBusiness={dflt} onSaved={upsertContact}
              onDeleted={(id) => setContacts((p) => p.filter((c) => c.id !== id))} onActivity={addActivity} onToggleTask={toggleTask}
              onNewDeal={(contactId) => setNewDeal({ stage: 'lead', contactId })} initialOpenId={openContactId} />
          )}
        </>
      ) : null}
      {tab === 'reorders' ? <ReordersPanel items={reorderAll} contacts={view.contacts} deals={view.deals} now={now} onStart={startReorder} onOpenContact={openContact} onSetDays={setReorderDays} /> : null}
      {tab === 'followups' ? (
        <>
          <Segmented label="View" value={followView} onChange={setFollowView} options={[
            { id: 'next', label: 'Next up', badge: nextItems.length, tone: nowCount ? 'red' : undefined },
            { id: 'upcoming', label: 'Upcoming', badge: metrics.tasksOpen, tone: metrics.tasksOverdue ? 'red' : undefined },
            { id: 'review', label: 'Drafts to approve', badge: draftCount, tone: 'amber' },
            { id: 'activity', label: 'Activity' },
          ]} />
          {followView === 'next' ? <NextActionsPanel items={nextItems} onOpenContact={openContact} onDone={doneAction} onReview={() => setFollowView('review')} /> : null}
          {followView === 'upcoming' ? <UpcomingPanel activities={view.activities} deals={deals} contacts={contacts} onOpenDeal={setDealId} onToggleTask={toggleTask} onOpenContact={openContact} /> : null}
          {followView === 'review' ? <DraftsPanel drafts={view.drafts} contacts={contacts} actor={actor} onChanged={(d) => setDrafts((p) => merge(p, [d]))} onActivity={addActivity} /> : null}
          {followView === 'activity' ? <ActivityPanel mode="feed" activities={view.activities} deals={deals} contacts={contacts} onOpenDeal={setDealId} onToggleTask={toggleTask} /> : null}
        </>
      ) : null}
      {tab === 'reports' ? (
        <>
          <Segmented label="Report" value={reportView} onChange={setReportView} options={[{ id: 'team', label: 'Team & targets' }, { id: 'businesses', label: 'All businesses' }, { id: 'collections', label: 'Collections & onboarding' }]} />
          {reportView === 'team' ? <SalesOpsPanel m={metrics} deals={deals} actor={actor} activities={view.activities} reports={reports} onReport={(r) => setReports((p) => merge(p, [r]))} now={now} /> : null}
          {reportView === 'businesses' ? <BusinessBoard contacts={contacts} deals={deals} now={now} onPick={(k) => { setBiz(k); setReportView('team'); }} /> : null}
          {reportView === 'collections' ? <PostSalesPanel deals={view.deals} contacts={contacts} activities={view.activities} onOpenDeal={setDealId} /> : null}
        </>
      ) : null}
      {tab === 'rules' ? <RulesPanel onRan={() => void crmCall<Snap>('/api/crm').then((s) => { setDeals(s.deals); setContacts(s.contacts); setActivities(s.activities); setDrafts(s.drafts); setReports(s.reports); since.current = s.now; }).catch(() => undefined)} /> : null}

      <DealDialog
        open={openDeal !== null || newDeal !== null}
        onClose={() => { setDealId(null); setNewDeal(null); }}
        deal={openDeal}
        startStage={newDeal?.stage ?? 'lead'}
        contacts={contacts}
        activities={activities}
        actor={actor}
        initialContactId={newDeal?.contactId}
        defaultBusiness={dflt}
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
