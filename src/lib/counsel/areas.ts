// The practice areas Counsel covers. Each one carries the U.S. law it should anchor on, so answers
// start from the right statutes and agencies instead of general advice. "fastMoving" areas change
// often enough that every answer there must tell the reader to confirm the current rule.

export type AreaGroup = 'Business' | 'Finance' | 'Customs & trade' | 'Property' | 'Family & estate' | 'Civil & disputes' | 'Government & people';

export interface PracticeArea {
  id: string;
  label: string;
  group: AreaGroup;
  /** What a business owner asks about here. */
  covers: string;
  /** Primary U.S. authorities the model should reason from. */
  anchors: string;
  fastMoving?: boolean;
}

export const AREA_GROUPS: AreaGroup[] = ['Business', 'Finance', 'Customs & trade', 'Property', 'Family & estate', 'Civil & disputes', 'Government & people'];

export const PRACTICE_AREAS: PracticeArea[] = [
  // Business
  { id: 'formation', label: 'Entities & governance', group: 'Business', covers: 'Choosing and forming an LLC, corporation or partnership; operating agreements, bylaws, shareholder and member agreements, holding-company structures, liability protection, annual filings.', anchors: 'State LLC and corporation statutes (Delaware, Wyoming, Texas, etc.), Delaware General Corporation Law, Revised Uniform LLC Act, Corporate Transparency Act (check current FinCEN status), IRC Subchapter S.', fastMoving: true },
  { id: 'contracts', label: 'Commercial contracts', group: 'Business', covers: 'Supply, services, distribution, agency, NDA, licensing and purchase terms; negotiation, breach, remedies, limitation of liability, indemnity, termination.', anchors: 'UCC Article 2 (goods), common law of contracts (services), state choice-of-law, Restatement (Second) of Contracts, E-SIGN Act and UETA.' },
  { id: 'ma', label: 'Buying, selling & investors', group: 'Business', covers: 'Acquisitions, asset vs. stock deals, letters of intent, due diligence, earn-outs, partner buy-outs, buy-sell agreements, joint ventures.', anchors: 'State corporate law, UCC bulk-sales remnants, Hart-Scott-Rodino Act, IRC 338 and 1060, successor-liability doctrines.' },
  { id: 'employment', label: 'Employment & contractors', group: 'Business', covers: 'Hiring, handbooks, wage and hour, overtime, misclassification, terminations, non-competes, discrimination and harassment, workplace safety.', anchors: 'FLSA, Title VII, ADA, ADEA, FMLA, NLRA, OSHA, IRS common-law and ABC tests, state wage and non-compete laws (e.g., California B&P 16600).', fastMoving: true },
  { id: 'ip', label: 'Intellectual property', group: 'Business', covers: 'Trademarks, copyrights, patents, trade secrets, licensing, brand protection, domain disputes, work-for-hire.', anchors: 'Lanham Act, Copyright Act (17 U.S.C.), Patent Act (35 U.S.C.), Defend Trade Secrets Act, UDRP.' },
  { id: 'privacy', label: 'Privacy, data & e-commerce', group: 'Business', covers: 'Website terms, privacy policies, data breaches, consumer data, online sales, advertising claims, marketing consent.', anchors: 'FTC Act Section 5, CAN-SPAM, TCPA, CCPA/CPRA and other state privacy laws, COPPA, state breach-notification statutes.', fastMoving: true },
  { id: 'regulatory', label: 'Licensing & industry compliance', group: 'Business', covers: 'Business licenses, product safety, labeling, environmental, food and drug, firearms, alcohol, industry-specific rules.', anchors: 'Federal agency rules by industry (FDA, CPSC, EPA, ATF, FTC), state and local licensing codes.' },
  { id: 'insurance', label: 'Insurance & risk', group: 'Business', covers: 'Coverage review, claim denials, certificates, cargo and liability coverage, indemnity and additional-insured requirements.', anchors: 'State insurance codes, bad-faith case law by state, ISO policy forms.' },

  // Finance
  { id: 'lending', label: 'Loans & secured transactions', group: 'Finance', covers: 'Business loans, personal guarantees, UCC liens, promissory notes, SBA loans, factoring, receivable financing, collateral.', anchors: 'UCC Article 9 (UCC-1 filings, perfection, priority), UCC Article 3, SBA 13 CFR Part 120, state usury statutes.' },
  { id: 'securities', label: 'Raising capital & securities', group: 'Finance', covers: 'Selling equity or notes, SAFEs, crowdfunding, investor disclosures, accredited-investor rules, private placements.', anchors: 'Securities Act of 1933 (Regulation D Rules 504/506, Regulation CF, Regulation A), Exchange Act, state blue-sky laws.' },
  { id: 'tax', label: 'Tax law (with your CPA)', group: 'Finance', covers: 'Entity tax treatment, deductions, state nexus, payroll tax, IRS notices, audits, penalty relief, sales and use tax. Counsel gives the legal framework; your CPA or tax attorney confirms the numbers.', anchors: 'Internal Revenue Code and Treasury Regulations, IRS Circular 230, Wayfair-based state economic nexus, state sales-tax statutes.', fastMoving: true },
  { id: 'banking', label: 'Banking, payments & AML', group: 'Finance', covers: 'Money-transmission questions, merchant accounts, payment processors, chargebacks, anti-money-laundering duties, cash reporting.', anchors: 'Bank Secrecy Act, FinCEN rules, Form 8300, state money-transmitter laws, Regulation E, UCC Article 4A.' },
  { id: 'collections', label: 'Collections & receivables', group: 'Finance', covers: 'Chasing unpaid invoices, demand letters, liens, judgments, debtor insolvency, mechanics liens.', anchors: 'UCC Article 2 remedies, state prompt-payment and lien statutes, FDCPA (consumer debt only), judgment-enforcement statutes by state.' },
  { id: 'bankruptcy', label: 'Bankruptcy & restructuring', group: 'Finance', covers: 'Your own distress, a customer or vendor filing, preference claims, Chapter 7/11/Subchapter V, workouts.', anchors: 'Bankruptcy Code (11 U.S.C.), including Sections 362, 365, 503(b)(9), 547, and Subchapter V.' },

  // Customs & trade
  { id: 'import', label: 'Importing & customs', group: 'Customs & trade', covers: 'Classification, valuation, country of origin, duties and tariffs, entry filing, ISF, bonds, broker relationships, prior disclosure, penalties, drawback, foreign-trade zones, CBP rulings and protests.', anchors: 'Tariff Act of 1930, 19 U.S.C. 1484, 1401a, 1592, 1520; 19 CFR; Harmonized Tariff Schedule and General Rules of Interpretation; 19 CFR Part 177 rulings; reasonable-care standard; Section 232, 301 and IEEPA tariff actions.', fastMoving: true },
  { id: 'adcvd', label: 'Anti-dumping & countervailing duties', group: 'Customs & trade', covers: 'Whether an import is covered by an AD/CVD order, scope rulings, cash deposits, evasion allegations, EAPA investigations.', anchors: 'Tariff Act of 1930 Title VII, 19 CFR Part 351, Commerce scope rulings, Enforce and Protect Act (EAPA).', fastMoving: true },
  { id: 'fta', label: 'Free trade agreements & origin', group: 'Customs & trade', covers: 'Qualifying for USMCA and other FTA preference, rules of origin, certifications, regional value content, verification audits.', anchors: 'USMCA Implementation Act, 19 CFR Part 182, HTSUS General Notes, tariff-shift rules.', fastMoving: true },
  { id: 'export', label: 'Export controls', group: 'Customs & trade', covers: 'Whether you need a license, ECCN and USML classification, deemed exports, end-use and end-user screening, EEI filing, voluntary self-disclosure.', anchors: 'Export Administration Regulations (15 CFR 730-774), ITAR (22 CFR 120-130), Foreign Trade Regulations (15 CFR Part 30), BIS Entity List and Denied Persons List.', fastMoving: true },
  { id: 'sanctions', label: 'Sanctions & anti-corruption', group: 'Customs & trade', covers: 'OFAC screening, blocked parties, the 50 percent rule, country programs, FCPA exposure with agents and distributors, anti-boycott rules, forced-labor import bans.', anchors: 'IEEPA, OFAC regulations (31 CFR Ch. V), strict-liability civil penalties, FCPA (15 U.S.C. 78dd-1 et seq.), anti-boycott (EAR Part 760), Uyghur Forced Labor Prevention Act.', fastMoving: true },
  { id: 'intl-contracts', label: 'International sales & logistics contracts', group: 'Customs & trade', covers: 'Export and import sales contracts, Incoterms, CISG, letters of credit, agency and distribution abroad, freight forwarder and carrier terms, cargo claims, arbitration clauses.', anchors: 'CISG (Vienna Convention), Incoterms 2020, UCP 600 and UCC Article 5, Carmack Amendment, COGSA, Montreal and Warsaw Conventions, New York Convention on arbitration.' },

  // Property
  { id: 'real-estate', label: 'Real estate & leases', group: 'Property', covers: 'Commercial and residential purchase, leasing, landlord-tenant disputes, zoning, title, easements, financing, 1031 exchanges.', anchors: 'State property and landlord-tenant statutes, UCC Article 9 fixtures, IRC 1031, local zoning codes.' },

  // Family & estate
  { id: 'family', label: 'Family law', group: 'Family & estate', covers: 'Divorce, custody and parenting time, child and spousal support, premarital and postmarital agreements, adoption, protecting a business in a divorce, domestic-violence protective orders.', anchors: 'State family codes (law is overwhelmingly state-specific), UCCJEA, Uniform Premarital Agreement Act, state property-division rules (community property vs. equitable distribution).' },
  { id: 'estate', label: 'Wills, trusts & succession', group: 'Family & estate', covers: 'Wills, revocable and irrevocable trusts, probate, powers of attorney, guardianship, business succession, estate tax planning.', anchors: 'State probate codes, Uniform Trust Code, IRC estate and gift tax provisions, state-specific execution formalities.' },

  // Civil & disputes
  { id: 'litigation', label: 'Civil litigation', group: 'Civil & disputes', covers: 'Being sued or suing, contract and business disputes, torts, personal injury, small claims, demand letters, discovery, litigation holds, settlements, statutes of limitations.', anchors: 'Federal Rules of Civil Procedure and Evidence, state procedure rules, state statutes of limitation, 28 U.S.C. 1331 and 1332 for federal jurisdiction.' },
  { id: 'adr', label: 'Arbitration & mediation', group: 'Civil & disputes', covers: 'Enforcing or resisting arbitration clauses, picking a forum, domestic and international arbitration, mediation strategy.', anchors: 'Federal Arbitration Act, New York Convention, AAA, JAMS and ICC rules.' },
  { id: 'consumer', label: 'Consumer protection & product liability', group: 'Civil & disputes', covers: 'Warranty claims, product recalls, deceptive-practices exposure, class-action risk, returns and refund rules.', anchors: 'Magnuson-Moss Warranty Act, UCC Article 2 warranties, state UDAP statutes, FTC Act, CPSA.' },

  // Government & people
  { id: 'investigations', label: 'Government inquiries & enforcement', group: 'Government & people', covers: 'Subpoenas, CBP, BIS or OFAC inquiries, IRS or DOJ contact, search warrants, internal investigations, voluntary self-disclosure.', anchors: 'Fifth and Sixth Amendments, attorney-client privilege and work-product doctrine, Upjohn warnings, agency self-disclosure policies.' },
  { id: 'immigration', label: 'Immigration (business & family)', group: 'Government & people', covers: 'Work visas, investor and treaty visas, green cards, I-9 compliance, sponsoring employees, family-based petitions.', anchors: 'Immigration and Nationality Act, 8 CFR, USCIS policy manual, IRCA employer-verification rules.', fastMoving: true },
  { id: 'administrative', label: 'Permits, appeals & agency disputes', group: 'Government & people', covers: 'Challenging agency decisions, license denials, protests, FOIA requests, government contracting basics.', anchors: 'Administrative Procedure Act, FOIA, FAR and DFARS for federal contracts, agency-specific appeal rules.' },
];

export const AREA_IDS = new Set(PRACTICE_AREAS.map((a) => a.id));

export function findArea(id: unknown): PracticeArea | undefined {
  return typeof id === 'string' ? PRACTICE_AREAS.find((a) => a.id === id) : undefined;
}

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','GU','VI',
] as const;

export function findState(v: unknown): string | undefined {
  return typeof v === 'string' && (US_STATES as readonly string[]).includes(v.toUpperCase()) ? v.toUpperCase() : undefined;
}
