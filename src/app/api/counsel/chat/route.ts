import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { ValidationError } from '@/lib/validation';
import { llmEnabled, llmModel } from '@/lib/llm/json';
import { buildSystemPrompt, cleanTurns } from '@/lib/counsel/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Same ceiling as the other Claude routes; the answer streams, so the reader sees text as it arrives.
export const maxDuration = 26;

/**
 * Counsel chat. The browser sends the whole conversation (nothing is stored on the server),
 * and the reply streams back as plain text. The sign-in check is done by src/proxy.ts.
 */
export async function POST(request: NextRequest) {
  try {
    if (!llmEnabled()) {
      return NextResponse.json({ error: 'Counsel needs an Anthropic key. Set ANTHROPIC_API_KEY on the server.', code: 'llm_off' }, { status: 503 });
    }
    const body = await readJson(request, 300_000);
    const turns = cleanTurns(body.messages);
    if (!turns) throw new ValidationError('Send at least one question.');
    const system = buildSystemPrompt({
      areaId: typeof body.area === 'string' ? body.area : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      profile: typeof body.profile === 'string' ? body.profile : undefined,
      mode: body.mode === 'draft' ? 'draft' : 'ask',
    });

    const client = new Anthropic();
    const stream = client.messages.stream({
      model: llmModel(),
      max_tokens: body.mode === 'draft' ? 6000 : 3500,
      system,
      output_config: { effort: 'medium' },
      messages: turns,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(ev.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          console.error('[counsel] stream failed', err);
          controller.enqueue(encoder.encode('\n\n[Counsel could not finish this answer. Please try again.]'));
          controller.close();
        }
      },
      cancel() {
        stream.abort();
      },
    });
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
