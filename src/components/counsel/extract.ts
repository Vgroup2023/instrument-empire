// Reads a file in the browser and returns its text. Only the text goes to the server, so the
// file itself can be far larger than the host allows in a request. Heavy libraries load on demand.

import { MAX_DOC_CHARS } from '@/lib/counsel/documents';

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json,.xml,.html,.htm,.eml,.rtf,application/pdf';

export interface ExtractedFile {
  name: string;
  text: string;
  pages?: number;
  /** Pages actually read, when a long PDF was read only in part. */
  pagesRead?: number;
  /** True when the text was cut to fit; `note` says by how much. */
  clipped: boolean;
  note?: string;
}

const TEXT_EXT = /\.(txt|md|csv|json|xml|html?|eml|rtf)$/i;

async function readPdf(file: File, onProgress: (done: number, total: number) => void): Promise<{ text: string; pages: number; read: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const parts: string[] = [];
  let chars = 0;
  let read = 0;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('').replace(/[ \t]+\n/g, '\n').trim();
    page.cleanup();
    parts.push(`[Page ${i}]\n${line}`);
    chars += line.length;
    read = i;
    onProgress(i, doc.numPages);
    if (chars > MAX_DOC_CHARS) break; // already more than can be used; stop reading
  }
  const total = doc.numPages;
  await task.destroy();
  return { text: parts.join('\n\n'), pages: total, read };
}

export async function extractFile(file: File, onProgress: (done: number, total: number) => void = () => {}): Promise<ExtractedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it and attach the parts.`);
  let text = '';
  let totalPages: number | undefined;
  let pagesRead: number | undefined;

  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const r = await readPdf(file, onProgress);
    text = r.text;
    totalPages = r.pages;
    pagesRead = r.read;
    if (text.replace(/\[Page \d+\]/g, '').trim().length < 50) {
      throw new Error(`${file.name} has no readable text. It looks like a scan. Run it through OCR first (for example, print to PDF with text recognition on), then attach it again.`);
    }
  } else if (/\.docx$/i.test(file.name)) {
    const mammoth = (await import('mammoth/mammoth.browser')) as unknown as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (TEXT_EXT.test(file.name) || file.type.startsWith('text/')) {
    text = await file.text();
  } else {
    throw new Error(`${file.name}: attach a PDF, Word (.docx) or text file.`);
  }

  text = text.replace(/\u0000/g, '').trim();
  if (!text) throw new Error(`${file.name} has no readable text.`);
  const clipped = text.length > MAX_DOC_CHARS;
  const out: ExtractedFile = { name: file.name, text: clipped ? text.slice(0, MAX_DOC_CHARS) : text, pages: totalPages, pagesRead, clipped };
  if (clipped) out.note = `${file.name}: only the first ${pagesRead ? `${pagesRead} pages` : `${MAX_DOC_CHARS.toLocaleString()} characters`} fit. Split the file and attach the rest as a separate part.`;
  return out;
}
