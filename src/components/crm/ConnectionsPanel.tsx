'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { ago } from '@/lib/crm/model';
import { crmCall } from './api';

interface Info {
  status: { baseUrl: string; receivingKeySet: boolean; emailOut: boolean; smsOut: boolean; ai: boolean; reportRecipients: string[] };
  received: Record<string, { lastAt: string | null; count: number }>;
  agents: Record<string, { at: string | null; handled: number; error: string | null }>;
}

const AGENTS = [
  { id: 'crm-inbox', name: 'Inbox agent', text: 'Reads every email and text that comes in, spots questions, meeting requests, complaints and "stop" replies, and makes the follow-up task.' },
  { id: 'crm-follow-up', name: 'Follow-up agent', text: 'Writes a draft email for anyone you have not been in touch with for their follow-up period (weekly by default). You approve before it is sent.' },
  { id: 'crm-pipeline', name: 'Pipeline agent', text: 'Adds a check-in task for deals gone quiet or past their expected close date.' },
  { id: 'crm-digest', name: 'Reporting agent', text: 'Writes the daily report each morning and the weekly report each Monday, and emails them to the report recipients.' },
];

function Copy({ text }: { text: string }) {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => notify('Copied.')).catch(() => notify('Copy failed. Select the text and copy it.', 'error')); }}
      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">Copy</button>
  );
}

/** What the CRM is connected to: where to point email, text and call services, what it can send, and the agents. */
export function ConnectionsPanel({ onRan }: { onRan: () => void }) {
  const { notify } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function load() {
    try {
      setInfo(await crmCall<Info>('/api/crm/connections'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the connections.');
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the status once when the tab opens
  useEffect(() => { void load(); }, []);

  async function run() {
    setRunning(true);
    try {
      const res = await crmCall<{ results: { agent: string; handled: number; error?: string }[] }>('/api/crm/agents/run', 'POST');
      const bad = res.results.find((r) => r.error);
      notify(bad ? `${bad.agent}: ${bad.error}` : `Agents finished: ${res.results.reduce((n, r) => n + r.handled, 0)} things handled.`, bad ? 'error' : 'success');
      await load();
      onRan();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'The agents could not run.', 'error');
    } finally {
      setRunning(false);
    }
  }

  if (error) return <Card className="p-6 text-sm text-red-600">{error}</Card>;
  if (!info) return <Card className="p-6 text-sm text-slate-500">Loading…</Card>;
  const s = info.status;
  const url = (ch: string) => `${s.baseUrl}/api/integrations/crm/${ch}`;

  const inbound = [
    { ch: 'email', label: 'Email in', how: 'In your email service (Mailgun, SendGrid, Postmark, Zapier, Make), forward incoming mail for your CRM address to this web address.' },
    { ch: 'sms', label: 'Text messages in', how: 'In Twilio, set the "A message comes in" webhook of your phone number to this address (HTTP POST).' },
    { ch: 'call', label: 'Calls in', how: 'In Twilio, set the number\'s call status callback to this address. Each call is recorded with its length. Other phone systems can post {from, to, direction, durationSeconds, status}.' },
    { ch: 'whatsapp', label: 'WhatsApp in', how: 'In Twilio, set the WhatsApp sender\'s incoming message webhook to this address.' },
    { ch: 'web', label: 'Website form', how: 'Point your website contact form at this address with fields email, name and message.' },
  ];

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#0f2059]">Receiving: data coming in</h3>
          {s.receivingKeySet ? <Badge tone="success">Access key set</Badge> : <Badge tone="danger">Access key missing</Badge>}
        </div>
        {!s.receivingKeySet ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Receiving is switched off until you set <b>INTEGRATION_KEY</b> in Netlify (any long random text) and redeploy. It is the same key the order desk uses.</p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">Add <code className="rounded bg-slate-100 px-1">?key=YOUR_INTEGRATION_KEY</code> to the end of an address below if the service cannot send a header. Everything received is matched to a contact by email address or phone number (a new contact is added if there is none), filed on their open deal, and shown live.</p>
        )}
        <ul className="mt-3 divide-y divide-slate-100">
          {inbound.map((c) => {
            const r = info.received[c.ch === 'whatsapp' ? 'whatsapp' : c.ch];
            return (
              <li key={c.ch} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                  <p className="text-xs text-slate-500">{r?.count ? `${r.count} in the last 30 days · last ${ago(r.lastAt ?? '')}` : 'nothing received yet'}</p>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{c.how}</p>
                <p className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs">{url(c.ch)}</code><Copy text={url(c.ch)} /></p>
              </li>
            );
          })}
        </ul>
        <details className="mt-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Test it from a terminal</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-slate-100">{`curl -X POST "${url('email')}" \\
  -H "Authorization: Bearer $INTEGRATION_KEY" -H "Content-Type: application/json" \\
  -d '{"from":"Test Person <test@example.com>","subject":"Hello","text":"Testing the CRM inbox","messageId":"test-1"}'`}</pre>
        </details>
      </Card>

      <Card className="p-5">
        <h3 className="text-[15px] font-semibold text-[#0f2059]">Sending: messages going out</h3>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          <li className="flex items-center justify-between gap-3 py-2.5"><span><b>Email</b> from the CRM and for approved follow-ups<br /><span className="text-xs text-slate-500">Uses the same email settings as invoices (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM).</span></span>{s.emailOut ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not set up</Badge>}</li>
          <li className="flex items-center justify-between gap-3 py-2.5"><span><b>Text messages</b><br /><span className="text-xs text-slate-500">Needs a Twilio number: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.</span></span>{s.smsOut ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not set up</Badge>}</li>
          <li className="flex items-center justify-between gap-3 py-2.5"><span><b>Report emails</b><br /><span className="text-xs text-slate-500">Set CRM_REPORT_EMAIL to one or more addresses (comma separated).</span></span>{s.reportRecipients.length ? <Badge tone="success">{s.reportRecipients.length} recipient{s.reportRecipients.length === 1 ? '' : 's'}</Badge> : <Badge tone="warning">No recipient</Badge>}</li>
          <li className="flex items-center justify-between gap-3 py-2.5"><span><b>AI writing</b><br /><span className="text-xs text-slate-500">Claude writes follow-ups and report summaries (ANTHROPIC_API_KEY). Without it the agents use plain templates.</span></span>{s.ai ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off, using templates</Badge>}</li>
        </ul>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#0f2059]">AI agents</h3>
          <Button loading={running} onClick={run}>Run the agents now</Button>
        </div>
        <p className="mt-1 text-sm text-slate-600">They run on their own every hour (the same schedule as your other agents). They never send anything to a customer by themselves; they leave drafts and tasks for you.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {AGENTS.map((a) => {
            const r = info.agents[a.id];
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{r?.error ? <span className="text-red-600">failed: {r.error}</span> : r?.at ? `last ran ${ago(r.at)} · handled ${r.handled}` : 'has not run yet'}</p>
                </div>
                <p className="text-xs text-slate-600">{a.text}</p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
