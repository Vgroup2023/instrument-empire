// Deterministic safety net that runs on the user's own words before and after the model does.
// It does not give legal advice. It spots situations where a missed deadline or a careless
// conversation can do permanent damage, so the screen can say "get a lawyer now" even if the
// model is down or an answer buries it.

export interface UrgentFlag {
  id: string;
  title: string;
  advice: string;
}

const FLAGS: Array<{ id: string; test: RegExp; title: string; advice: string }> = [
  {
    id: 'served',
    test: /\b(served|summons|complaint was filed|being sued|lawsuit (?:against|was filed)|default judgment|answer (?:is )?due)\b/i,
    title: 'You may have a court deadline running',
    advice: 'A summons usually carries a short deadline to respond (often 20 to 30 days, and it varies by court and state). Missing it can mean a default judgment. Read the papers today, note the date you were served, and have a licensed attorney in that state respond.',
  },
  {
    id: 'subpoena',
    test: /\b(subpoena|search warrant|grand jury|civil investigative demand|target letter)\b/i,
    title: 'Government demand: do not respond alone',
    advice: 'Do not hand over documents or answer questions until a licensed attorney has reviewed the demand. Preserve every record (do not delete anything). Your communications with an AI tool are not privileged.',
  },
  {
    id: 'agency-contact',
    test: /\b(CBP|customs|BIS|OFAC|DOJ|IRS|SEC|HSI|FBI|ICE|agents?)\b[^.]{0,80}\b(called|visited|showed up|raid|detain(?:ed)?|seiz(?:ed|ure)|penalty notice|pre-?penalty|notice of action|request for information|CF-?28|CF-?29|audit)\b/i,
    title: 'Agency contact or enforcement notice',
    advice: 'Penalty and information notices carry fixed response windows (for example, a CBP pre-penalty notice allows a short window to respond). Do not make statements to agents without counsel. Ask a licensed trade or white-collar attorney about a prior or voluntary self-disclosure before anything is filed.',
  },
  {
    id: 'detention',
    test: /\b(arrest(?:ed)?|detained at|criminal charge|indict(?:ed|ment)|probable cause)\b/i,
    title: 'Criminal exposure: call a criminal defense attorney now',
    advice: 'Say you want a lawyer and stop talking. A criminal case needs a licensed defense attorney immediately. If someone is in custody, contact the public defender or a local criminal defense lawyer now.',
  },
  {
    id: 'protection',
    test: /\b(restraining order|protective order|protection order|domestic violence|abus(?:e|ed|ive)|unsafe at home|afraid of (?:my|him|her))\b/i,
    title: 'Safety first',
    advice: 'If you are in danger, call 911. The National Domestic Violence Hotline is 1-800-799-7233 (text START to 88788). Protective orders are filed in your local court, often with same-day help from the clerk or a legal aid office.',
  },
  {
    id: 'sol',
    test: /\b(statute of limitations|time[- ]barred|deadline to (?:sue|file)|years? ago)\b/i,
    title: 'Time limits may be running',
    advice: 'Claims expire. Contract, injury, fraud and customs-refund (protest) windows are short and differ by state or statute. Do not wait to confirm the deadline with an attorney.',
  },
  {
    id: 'eviction',
    test: /\b(eviction notice|notice to quit|pay or quit|foreclos(?:ure|ed)|garnish(?:ment|ed)|levy|lien (?:filed|was filed))\b/i,
    title: 'A notice with a short fuse',
    advice: 'Eviction, foreclosure, levy and garnishment notices have strict response windows. Find the deadline on the notice itself and contact an attorney or local legal aid right away.',
  },
  {
    id: 'sanctions-evasion',
    test: /\b(avoid|evade|get around|hide from|bypass)\b[^.]{0,60}\b(sanctions?|OFAC|duties|tariffs?|customs|export (?:control|license)|CBP)\b|\b(under-?value|undervaluation|transship(?:ment)?|false(?:ly)? (?:declare|invoice|label))\b/i,
    title: 'Counsel will not help evade the law',
    advice: 'Undervaluation, false origin or classification, transshipment to dodge duties, and sanctions or export-control evasion are crimes and False Claims Act exposure, with personal liability for the people involved. Counsel can explain lawful ways to reduce duties (classification, valuation methods, FTAs, drawback, foreign-trade zones, first sale) instead.',
  },
];

/** Urgent situations mentioned in the text. Matches only the user's own words. */
export function detectUrgent(text: string): UrgentFlag[] {
  const t = text.slice(0, 20_000);
  return FLAGS.filter((f) => f.test.test(t)).map(({ id, title, advice }) => ({ id, title, advice }));
}

export const DISCLAIMER =
  'Counsel is an AI research and drafting assistant, not a law firm or a lawyer. It does not create an attorney-client relationship, and what you type here is not privileged. Laws change and differ by state; have a licensed attorney confirm anything you will rely on, sign, file or send.';
