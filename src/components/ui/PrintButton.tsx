'use client';

import { Button } from '@/components/ui/Button';

/** Prints the page as it appears (menu and buttons are left off by the print styles). */
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Print
    </Button>
  );
}
