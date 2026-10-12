// Material names arrive in many spellings ("6061-T6 AL", "aluminum 6061", "6061 alum").
// canonicalMaterial() maps them to one name so prices, prior jobs and requests line up.

interface MaterialDef {
  name: string;
  pattern: RegExp;
  /** Pounds per cubic inch, used only to estimate weight from a stock block. */
  density: number;
}

const MATERIALS: MaterialDef[] = [
  { name: '6061-T6 ALUMINUM', pattern: /\b6061(?:\s*-?\s*t[0-9]{1,4})?\b/i, density: 0.0975 },
  { name: '7075-T6 ALUMINUM', pattern: /\b7075(?:\s*-?\s*t[0-9]{1,4})?\b/i, density: 0.101 },
  { name: '2024 ALUMINUM', pattern: /\b2024(?:\s*-?\s*t[0-9]{1,4})?\s*(?:al|alum)/i, density: 0.1 },
  { name: '316 STAINLESS', pattern: /\b316l?\b[^\n,;]{0,20}(?:stainless|ss)|(?:stainless|ss)[^\n,;]{0,12}\b316l?\b/i, density: 0.289 },
  { name: '304 STAINLESS', pattern: /\b304l?\b[^\n,;]{0,20}(?:stainless|ss)|(?:stainless|ss)[^\n,;]{0,12}\b304l?\b/i, density: 0.289 },
  { name: '17-4 PH STAINLESS', pattern: /\b17-?4\s*ph\b/i, density: 0.282 },
  { name: '4140 STEEL', pattern: /\b4140\b/i, density: 0.284 },
  { name: '1018 STEEL', pattern: /\b1018\b/i, density: 0.284 },
  { name: '1045 STEEL', pattern: /\b1045\b/i, density: 0.284 },
  { name: 'A36 STEEL', pattern: /\ba-?36\b/i, density: 0.284 },
  { name: 'BRASS 360', pattern: /\b(?:brass\s*360|360\s*brass|c36000)\b/i, density: 0.307 },
  { name: 'COPPER C110', pattern: /\b(?:c110|copper\s*110)\b/i, density: 0.323 },
  { name: 'TITANIUM GR5', pattern: /\b(?:ti-?6al-?4v|titanium\s*(?:gr(?:ade)?\.?\s*5)|grade\s*5\s*titanium)\b/i, density: 0.16 },
  { name: 'INCONEL 718', pattern: /\binconel\s*718\b/i, density: 0.296 },
  { name: 'DELRIN', pattern: /\b(?:delrin|acetal|pom)\b/i, density: 0.051 },
  { name: 'NYLON', pattern: /\bnylon\b/i, density: 0.041 },
  { name: 'UHMW', pattern: /\buhmw\b/i, density: 0.034 },
  { name: 'PEEK', pattern: /\bpeek\b/i, density: 0.047 },
];

/** The shop's name for a material, or the text tidied up when it isn't one we know. Null for blank. */
export function canonicalMaterial(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const hit = MATERIALS.find((m) => m.pattern.test(t));
  return hit ? hit.name : t.toUpperCase().replace(/\s+/g, ' ').slice(0, 80);
}

/** Looks inside free text for a known material; null when none is named. */
export function findMaterial(text: string): string | null {
  const hit = MATERIALS.find((m) => m.pattern.test(text));
  return hit ? hit.name : null;
}

export function densityOf(canonical: string | null): number | null {
  const hit = MATERIALS.find((m) => m.name === canonical);
  return hit ? hit.density : null;
}

export const CERTIFICATIONS = [
  { key: 'ISO9001', label: 'ISO 9001', pattern: /\biso\s*-?\s*9001(?::\s*\d{4})?/i },
  { key: 'AS9100', label: 'AS9100', pattern: /\bas\s*-?\s*9100[a-z]?\b/i },
  { key: 'AS9102', label: 'AS9102 (FAI)', pattern: /\bas\s*-?\s*9102\b/i },
  { key: 'ISO13485', label: 'ISO 13485', pattern: /\biso\s*-?\s*13485/i },
  { key: 'IATF16949', label: 'IATF 16949', pattern: /\biatf\s*-?\s*16949/i },
  { key: 'ITAR', label: 'ITAR', pattern: /\bitar\b/i },
  { key: 'NADCAP', label: 'NADCAP', pattern: /\bnadcap\b/i },
  { key: 'DFARS', label: 'DFARS', pattern: /\bdfars\b/i },
  { key: 'CMMC', label: 'CMMC', pattern: /\bcmmc\b/i },
  { key: 'ROHS', label: 'RoHS', pattern: /\brohs\b/i },
  { key: 'REACH', label: 'REACH', pattern: /\breach\b/i },
  { key: 'PPAP', label: 'PPAP', pattern: /\bppap\b/i },
  { key: 'ISO17025', label: 'ISO 17025', pattern: /\biso\s*-?\s*17025/i },
];

/** A certification written any way ("AS9100D", "ISO 9001:2015") reduced to a comparable key such as AS9100. */
export function certKey(text: string): string {
  const t = text.trim();
  const hit = CERTIFICATIONS.find((c) => c.pattern.test(t));
  return hit ? hit.key : t.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
