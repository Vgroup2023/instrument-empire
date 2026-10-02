import { GUIDE_FILE, readGuide } from '@/lib/guide';

export const dynamic = 'force-dynamic';

// Signed-in users only: /api/guide is not in the proxy's public list.
export async function GET() {
  try {
    const bytes = await readGuide();
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${GUIDE_FILE}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return Response.json({ error: 'The training guide is not available.' }, { status: 404 });
  }
}
