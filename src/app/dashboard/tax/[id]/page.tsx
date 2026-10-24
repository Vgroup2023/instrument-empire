import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { getTaxReturn } from '@/lib/tax/service';
import { TaxWizard } from '@/components/tax/TaxWizard';

export const dynamic = 'force-dynamic';

export default async function TaxReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let row: Awaited<ReturnType<typeof getTaxReturn>> | null = null;
  let loadError: unknown = null;
  try {
    row = await getTaxReturn(id);
  } catch (err) {
    loadError = err;
  }
  if (!row) {
    return (
      <div>
        <PageHeader title="Tax filing" />
        <EmptyState title="Couldn't open this return" description={describeError(loadError, 'It may have been deleted.')} />
      </div>
    );
  }
  return (
    <div>
      <PageHeader title={`${row.title}: ${row.taxYear} return`} description={row.country === 'US' ? 'U.S. federal income tax (Form 1040)' : 'Canadian federal income tax (T1)'} />
      <TaxWizard initial={row} />
    </div>
  );
}
