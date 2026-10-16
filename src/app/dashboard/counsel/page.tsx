import { PageHeader } from '@/components/ui/PageHeader';
import { llmEnabled } from '@/lib/llm/json';
import { CounselClient } from '@/components/counsel/CounselClient';

export const dynamic = 'force-dynamic';

export default function CounselPage() {
  return (
    <div>
      <PageHeader title="Counsel" description="Your AI legal assistant for business, finance, customs and trade, family and civil matters. It researches, reviews and drafts. A licensed attorney signs off." />
      <CounselClient claudeOn={llmEnabled()} />
    </div>
  );
}
