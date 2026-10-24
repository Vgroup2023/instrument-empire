import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { SUPPORTED_TAX_YEARS, listTaxReturns } from '@/lib/tax/service';
import { TaxReturnsClient } from '@/components/tax/TaxReturnsClient';

export const dynamic = 'force-dynamic';

export default async function TaxPage() {
  let rows: Awaited<ReturnType<typeof listTaxReturns>> | null = null;
  let loadError: unknown = null;
  try {
    rows = await listTaxReturns();
  } catch (err) {
    loadError = err;
  }
  return (
    <div>
      <PageHeader title="Tax filing" description="Prepare personal and business income tax returns for the United States and Canada, one question at a time." />
      {rows ? (
        <TaxReturnsClient initial={rows} years={SUPPORTED_TAX_YEARS} />
      ) : (
        <EmptyState title="Couldn't load tax returns" description={describeError(loadError, 'Please try again.')} />
      )}
    </div>
  );
}
