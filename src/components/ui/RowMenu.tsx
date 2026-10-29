'use client';

import { useEffect, useRef, useState } from 'react';

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** A "More" button that opens a small menu. The menu is fixed-position, so a scrolling table cannot clip it. */
export function RowMenu({ items, label = 'More' }: { items: RowMenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          if (!r) return;
          setPos(pos ? null : { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
        }}
        className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        {label} ▾
      </button>
      {pos ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 min-w-[170px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPos(null);
                  item.onClick();
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${item.danger ? 'text-red-600' : 'text-slate-700'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
