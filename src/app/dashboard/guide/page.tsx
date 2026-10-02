import mammoth from 'mammoth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { GUIDE_FILE, readGuide } from '@/lib/guide';

export const dynamic = 'force-dynamic';

async function loadGuideHtml(): Promise<string | null> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: await readGuide() });
    return value;
  } catch {
    return null;
  }
}

// Reads the same .docx people download, so the two can never disagree.
export default async function GuidePage() {
  const html = await loadGuideHtml();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training guide"
        description="Standard operations and training for new users. Read it here, or download the Word file to print or share."
        actions={
          <a
            href="/api/guide"
            download={GUIDE_FILE}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-card hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Download (.docx)
          </a>
        }
      />
      <Card>
        <CardBody>
          {html ? (
            <article
              className="mx-auto max-w-3xl text-sm leading-relaxed text-slate-700 [&_a]:text-brand-600 [&_h1]:mb-3 [&_h1]:mt-10 [&_h1]:border-b [&_h1]:border-slate-200 [&_h1]:pb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-slate-600">
              The guide could not be loaded here. Try the Download button, or ask your administrator.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
