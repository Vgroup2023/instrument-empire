'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Next scrolls the window to the top on navigation, but the dashboard scrolls
// inside <main id="app-scroll">, so do the same there.
export function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
