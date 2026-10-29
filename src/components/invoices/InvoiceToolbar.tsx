'use client';

import { useEffect } from 'react';

/** Style switch and download button. Hidden when the page is printed, so the PDF holds only the invoice. */
export function InvoiceToolbar({ id, style, fileName }: { id: string; style: 'pro-forma' | 'classic'; fileName: string }) {
  useEffect(() => {
    // The browser names a saved PDF after the page title.
    const before = document.title;
    document.title = fileName;
    return () => {
      document.title = before;
    };
  }, [fileName]);

  const tab = (key: 'pro-forma' | 'classic', label: string) => (
    <a
      href={`/invoice/${id}?style=${key}`}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        style === key ? 'border-[#0a3d66] bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </a>
  );

  return (
    <div className="mx-auto mb-4 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="flex items-center gap-2">
        <a href="/dashboard/invoices" className="text-sm text-slate-600 underline">← Invoices</a>
        <span className="mx-2 text-slate-300">|</span>
        {tab('pro-forma', 'Pro forma')}
        {tab('classic', 'Classic')}
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-royal-gradient px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Download PDF
      </button>
    </div>
  );
}
