// The product's name, taglines and landing-page copy, in one place. Everything
// the user sees (header, sidebar, login page, page titles, install prompt)
// reads from here. Every claim below describes something the app does.
export const BRAND = {
  name: 'GloblexAI Office ERP',
  /** Short name for home-screen icons. */
  shortName: 'Office ERP',
  tagline: 'AI-Powered Copilot',
  marketing: 'Run your orders, shipments and books from one intelligent workspace.',
  /** Headline on the sign-in page. */
  headline: 'Run the business. Let AI run the busywork.',
  intro:
    'GloblexAI Office ERP brings your orders, shipments, customs deadlines and accounting into one workspace, with ten AI agents watching every file, flagging risk early and drafting the next step for you to approve.',
  pillars: [
    {
      icon: '📬',
      title: 'Orders on autopilot',
      body: 'Agents read incoming orders, answer customers from the order record and stage shipping. Anything that touches money waits for you.',
    },
    {
      icon: '🛃',
      title: 'Compliance that watches the clock',
      body: 'ISF and entry deadlines, restricted-party screening and tariff-code checks, flagged before they turn into penalties.',
    },
    {
      icon: '🚢',
      title: 'Every shipment, one file',
      body: 'From booking to warehouse to delivery, with documents checked and every department working from the same record.',
    },
    {
      icon: '📊',
      title: 'Books you can trust',
      body: 'Invoices, bills and banking with an audit trail, plus checks that flag duplicates and unusual amounts.',
    },
  ],
  trust: 'AI drafts. You decide.',
  trustDetail: 'Agents flag and prepare. People approve.',
  byline: 'Built by Globlex AI · The AI Architect Co.',
} as const;
