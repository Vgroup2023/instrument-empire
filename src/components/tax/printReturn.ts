import type { TaxResult } from '@/lib/tax';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Opens the return as a clean page in a new window and starts the browser's print dialog (which can save a PDF). */
export function printReturn(result: TaxResult, title: string, money: (n: number, country: 'US' | 'CA') => string) {
  const rows = result.lines
    .filter((l) => l.heading || l.bold || l.amount !== 0)
    .map((l) =>
      l.heading
        ? `<tr><th colspan="3">${esc(l.label)}</th></tr>`
        : `<tr class="${l.bold ? 'b' : ''}"><td>${esc(l.label)}</td><td class="r">${esc(l.ref ?? '')}</td><td class="n">${esc(money(l.amount, result.country))}</td></tr>`,
    )
    .join('');
  const not = result.notComputed.map((n) => `<li>${esc(n)}</li>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${result.taxYear} return</title><style>
    body{font:13px/1.45 system-ui,sans-serif;margin:32px;color:#0f172a} h1{font-size:20px;margin:0 0 4px} p{margin:4px 0;color:#475569}
    table{width:100%;border-collapse:collapse;margin-top:16px} td,th{padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
    th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding-top:14px} .b td{font-weight:700} .n{text-align:right;font-variant-numeric:tabular-nums} .r{color:#94a3b8;font-size:11px}
    ul{color:#475569;font-size:12px}
  </style></head><body>
    <h1>${esc(title)}: ${result.taxYear} ${result.country === 'US' ? 'U.S. federal' : 'Canadian federal'} return</h1>
    <p>Preparation estimate. Not filed with the ${result.country === 'US' ? 'IRS' : 'CRA'}.</p>
    <table>${rows}</table>
    <h3>Not included in this estimate</h3><ul>${not}</ul>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
