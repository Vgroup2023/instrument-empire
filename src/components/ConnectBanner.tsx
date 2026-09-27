import { getQboTokens } from '@/lib/session';
import { Button } from '@/components/ui/Button';

export async function ConnectBanner() {
  const tokens = await getQboTokens();
  if (tokens) return null;

  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl2 border border-amber-200 bg-amber-50 p-5 shadow-card sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-semibold text-amber-900">Connect your QuickBooks Online account</p>
        <p className="mt-0.5 text-sm text-amber-800">
          Connect QuickBooks to pull your real books, bank feed activity, and customer data into
          this screen.
        </p>
      </div>
      <a href="/api/auth/connect">
        <Button variant="primary" className="whitespace-nowrap">
          Connect QuickBooks
        </Button>
      </a>
    </div>
  );
}
