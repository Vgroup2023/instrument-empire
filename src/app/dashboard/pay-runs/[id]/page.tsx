import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { NotFoundError } from '@/lib/validation';
import { getRun } from '@/lib/payroll/service';
import { PayRunClient } from '@/components/payroll/PayRunClient';

export const dynamic = 'force-dynamic';

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run: Awaited<ReturnType<typeof getRun>> | null = null;
  let loadError: unknown = null;
  try {
    run = await getRun(id);
  } catch (err) {
    if (err instanceof NotFoundError || (err instanceof Error && err.name === 'ValidationError')) notFound();
    loadError = err;
  }
  if (!run) {
    return (
      <div>
        <PageHeader title="Pay run" description="" />
        <EmptyState title="Couldn't load this pay run" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <PayRunClient initialRun={run} />;
}
