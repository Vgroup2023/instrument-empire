import { INVOICE_BRAND as B } from '@/lib/invoiceBrand';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Invoice } from '@/lib/accounting/invoices';

export type InvoiceStyle = 'pro-forma' | 'classic';

export interface InvoiceParty {
  name: string;
  email?: string | null;
  phone?: string | null;
}

const NAVY = '#0a3d66';

function lines(inv: Invoice) {
  return inv.Line.map((l) => ({
    item: l.SalesItemLineDetail.ItemRef.name ?? '',
    description: l.Description ?? '',
    qty: l.SalesItemLineDetail.Qty,
    price: l.SalesItemLineDetail.UnitPrice,
    amount: l.Amount,
  }));
}

function Logo({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={B.logo} alt={B.name} style={{ height: size, width: 'auto' }} />;
}

function Contact() {
  return (
    <>
      {B.addressLines.map((l) => <div key={l}>{l}</div>)}
      {B.phone ? <div>{B.phone}</div> : null}
      {B.email ? <div>{B.email}</div> : null}
      {B.website ? <div>{B.website}</div> : null}
    </>
  );
}

/** Pro forma layout: navy title bars, boxed fields and a shaded item grid. */
function ProForma({ inv, to }: { inv: Invoice; to: InvoiceParty }) {
  const cur = inv.CurrencyRef?.value;
  const rows = lines(inv);
  const blank = Math.max(0, 12 - rows.length);
  const bar = { background: NAVY, color: '#fff', fontWeight: 700, fontSize: 12, padding: '3px 8px' } as const;
  const th = { background: NAVY, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 6px', textAlign: 'left' as const };
  const paid = inv.TotalAmt - inv.Balance;
  return (
    <div style={{ fontSize: 12, color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Logo size={44} />
          <div style={{ fontSize: 12, marginTop: 4 }}>{B.slogan}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: NAVY, letterSpacing: 0.5 }}>INVOICE</div>
          <table style={{ marginLeft: 'auto', fontSize: 11, marginTop: 6 }}>
            <tbody>
              <tr><td style={{ paddingRight: 12, textAlign: 'left' }}>Date:</td><td>{formatDate(inv.TxnDate)}</td></tr>
              <tr><td style={{ paddingRight: 12, textAlign: 'left' }}>Due date:</td><td>{formatDate(inv.DueDate)}</td></tr>
              <tr><td style={{ paddingRight: 12, textAlign: 'left' }}>Invoice #:</td><td>{inv.DocNumber ?? inv.Id}</td></tr>
              <tr><td style={{ paddingRight: 12, textAlign: 'left' }}>Currency:</td><td>{cur ?? 'USD'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={bar}>Bill To:</div>
          <div style={{ padding: '6px 8px', lineHeight: 1.5 }}>
            <strong>{to.name}</strong>
            {to.email ? <div>{to.email}</div> : null}
            {to.phone ? <div>{to.phone}</div> : null}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={bar}>From:</div>
          <div style={{ padding: '6px 8px', lineHeight: 1.5 }}>
            <strong>{B.name}</strong>
            <Contact />
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '16%' }}>Item</th>
            <th style={th}>Description</th>
            <th style={{ ...th, textAlign: 'right', width: '13%' }}>Unit price</th>
            <th style={{ ...th, textAlign: 'right', width: '8%' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right', width: '15%' }}>Line total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#f1f3f5' : '#fff' }}>
              <td style={{ padding: '4px 6px', verticalAlign: 'top' }}>{r.item}</td>
              <td style={{ padding: '4px 6px', verticalAlign: 'top' }}>{r.description}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(r.price, cur)}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>{r.qty}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(r.amount, cur)}</td>
            </tr>
          ))}
          {Array.from({ length: blank }).map((_, i) => (
            <tr key={`b${i}`} style={{ background: (rows.length + i) % 2 ? '#f1f3f5' : '#fff', height: 18 }}>
              <td /><td /><td /><td /><td />
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={bar}>Notes, Terms of Sale</div>
          <div style={{ padding: '6px 8px', minHeight: 70, whiteSpace: 'pre-line' }}>
            {B.terms}
            {B.paymentNote ? `\n${B.paymentNote}` : ''}
          </div>
        </div>
        <table style={{ width: 230, fontSize: 12, borderCollapse: 'collapse', alignSelf: 'flex-start' }}>
          <tbody>
            <tr><td style={{ padding: '3px 6px' }}>Subtotal</td><td style={{ textAlign: 'right', padding: '3px 6px' }}>{formatCurrency(inv.TotalAmt, cur)}</td></tr>
            <tr><td style={{ padding: '3px 6px' }}>Paid</td><td style={{ textAlign: 'right', padding: '3px 6px' }}>{formatCurrency(paid, cur)}</td></tr>
            <tr style={{ borderTop: '2px solid #111', fontWeight: 700 }}>
              <td style={{ padding: '5px 6px' }}>Balance due</td>
              <td style={{ textAlign: 'right', padding: '5px 6px' }}>{formatCurrency(inv.Balance, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11, borderTop: '1px solid #ccc', paddingTop: 8 }}>
        Questions about this invoice? Contact {B.email || B.website}. Thank you for your business.
      </div>
    </div>
  );
}

/** Classic layout: large title, a clean header and a charcoal item table. */
function Classic({ inv, to }: { inv: Invoice; to: InvoiceParty }) {
  const cur = inv.CurrencyRef?.value;
  const rows = lines(inv);
  const th = { background: '#333', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 8px', textAlign: 'left' as const };
  return (
    <div style={{ fontSize: 12, color: '#222' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Logo size={64} />
        <div style={{ textAlign: 'right', lineHeight: 1.45 }}>
          <div style={{ fontSize: 34, letterSpacing: 1 }}>INVOICE</div>
          <div style={{ marginTop: 8 }}><strong>{B.name}</strong></div>
          <Contact />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', marginTop: 20, paddingTop: 12 }}>
        <div style={{ lineHeight: 1.5 }}>
          <div style={{ color: '#777' }}>BILL TO</div>
          <strong>{to.name}</strong>
          {to.phone ? <div>{to.phone}</div> : null}
          {to.email ? <div>{to.email}</div> : null}
        </div>
        <table style={{ fontSize: 12 }}>
          <tbody>
            <tr><td style={{ textAlign: 'right', fontWeight: 700, paddingRight: 10 }}>Invoice Number:</td><td>{inv.DocNumber ?? inv.Id}</td></tr>
            <tr><td style={{ textAlign: 'right', fontWeight: 700, paddingRight: 10 }}>Invoice Date:</td><td>{formatDate(inv.TxnDate)}</td></tr>
            <tr><td style={{ textAlign: 'right', fontWeight: 700, paddingRight: 10 }}>Payment Due:</td><td>{formatDate(inv.DueDate)}</td></tr>
            <tr style={{ background: '#f1f3f5' }}>
              <td style={{ textAlign: 'right', fontWeight: 700, padding: '4px 10px 4px 4px' }}>Amount Due ({cur ?? 'USD'}):</td>
              <td style={{ fontWeight: 700, padding: '4px 4px' }}>{formatCurrency(inv.Balance, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
        <thead>
          <tr>
            <th style={th}>Items</th>
            <th style={{ ...th, textAlign: 'center', width: '12%' }}>Quantity</th>
            <th style={{ ...th, textAlign: 'right', width: '16%' }}>Price</th>
            <th style={{ ...th, textAlign: 'right', width: '16%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '8px', verticalAlign: 'top' }}>
                <strong>{r.item}</strong>
                {r.description ? <div>{r.description}</div> : null}
              </td>
              <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top' }}>{r.qty}</td>
              <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(r.price, cur)}</td>
              <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(r.amount, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: 'auto', width: 300, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #ccc' }}>
          <span>Total:</span><span>{formatCurrency(inv.TotalAmt, cur)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: 13 }}>
          <span>Amount Due ({cur ?? 'USD'}):</span><span>{formatCurrency(inv.Balance, cur)}</span>
        </div>
      </div>

      {B.terms ? (
        <div style={{ marginTop: 30, color: '#555', whiteSpace: 'pre-line' }}>
          <strong>Notes / Terms</strong>
          <div>{B.terms}</div>
        </div>
      ) : null}
      {B.paymentNote ? <div style={{ marginTop: 40, textAlign: 'center', color: '#777' }}>{B.paymentNote}</div> : null}
      <div style={{ marginTop: 40, textAlign: 'center', color: '#999', fontSize: 11 }}>{B.name} · {B.slogan}</div>
    </div>
  );
}

export function InvoiceDocument({ invoice, to, style }: { invoice: Invoice; to: InvoiceParty; style: InvoiceStyle }) {
  return style === 'classic' ? <Classic inv={invoice} to={to} /> : <ProForma inv={invoice} to={to} />;
}
