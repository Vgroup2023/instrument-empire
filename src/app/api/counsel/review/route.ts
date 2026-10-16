import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { ValidationError } from '@/lib/validation';
import { llmEnabled } from '@/lib/llm/json';
import { reviewContract, type Side } from '@/lib/counsel/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Reads a contract (pasted text, a PDF or a Word file) and returns a structured review. */
export async function POST(request: NextRequest) {
  try {
    if (!llmEnabled()) {
      return NextResponse.json({ error: 'Contract review needs an Anthropic key. Set ANTHROPIC_API_KEY on the server.', code: 'llm_off' }, { status: 503 });
    }
    const body = await readJson(request, 8_000_000);
    let text = typeof body.text === 'string' ? body.text.trim() : '';
    let pdfBase64: string | undefined;

    const file = body.file;
    if (file && typeof file === 'object') {
      const { contentType, contentBase64 } = file as { contentType?: unknown; contentBase64?: unknown };
      if (typeof contentBase64 !== 'string' || typeof contentType !== 'string') throw new ValidationError('That file could not be read.');
      const bytes = Buffer.from(contentBase64, 'base64');
      if (bytes.length > MAX_FILE_BYTES) throw new ValidationError('That file is over 5 MB. Paste the key sections as text instead.');
      if (contentType === 'application/pdf') {
        pdfBase64 = contentBase64;
      } else if (contentType === DOCX) {
        text = (await mammoth.extractRawText({ buffer: bytes })).value.trim();
      } else {
        throw new ValidationError('Upload a PDF or Word (.docx) file, or paste the text.');
      }
    }
    if (!text && !pdfBase64) throw new ValidationError('Paste the contract text or upload a PDF or Word file.');
    if (text && text.length < 200 && !pdfBase64) throw new ValidationError('That is too short to review. Paste the full agreement.');

    const side: Side = body.side === 'buyer' || body.side === 'seller' ? body.side : 'neutral';
    const review = await reviewContract({
      text,
      pdfBase64,
      side,
      areaId: typeof body.area === 'string' ? body.area : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      goals: typeof body.goals === 'string' ? body.goals : undefined,
      profile: typeof body.profile === 'string' ? body.profile : undefined,
    });
    if (!review) {
      return NextResponse.json({ error: 'Counsel could not complete the review. Try again, or paste a shorter section.' }, { status: 502 });
    }
    return NextResponse.json({ review });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
