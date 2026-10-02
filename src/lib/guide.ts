import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const GUIDE_FILE = 'GloblexAI-Office-ERP-Operations-and-Training-Guide.docx';
export const GUIDE_TITLE = 'GloblexAI Office ERP — Standard Operations & Training Guide';

// The guide ships with the app (docs/ is traced into the serverless bundle by
// outputFileTracingIncludes in next.config.mjs).
export async function readGuide(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), 'docs', GUIDE_FILE));
}
