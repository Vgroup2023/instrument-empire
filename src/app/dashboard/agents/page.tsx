import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { agentOverview, listFindings, listRestrictedParties } from '@/lib/agents/queries';
import { DEPARTMENTS, type Department } from '@/lib/agents/types';
import { AgentsPageClient } from '@/components/agents/AgentsPageClient';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const { dept } = await searchParams;
  let data: [Awaited<ReturnType<typeof agentOverview>>, Awaited<ReturnType<typeof listFindings>>, Awaited<ReturnType<typeof listRestrictedParties>>] | null = null;
  let loadError: unknown = null;
  try {
    data = await Promise.all([agentOverview(), listFindings('open'), listRestrictedParties()]);
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="AI agents" description="Six agents watching your trade files and accounts." />
        <EmptyState title="Couldn't load agents" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }

  const [overview, findings, restricted] = data;
  return (
    <AgentsPageClient
      overview={overview}
      findings={findings.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
      initialDepartment={DEPARTMENTS.some((d) => d.id === dept) ? (dept as Department) : 'all'}
      generatedAt={new Date().toISOString()}
      restricted={restricted.map((r) => ({ id: r.id, name: r.name, listName: r.listName }))}
    />
  );
}
