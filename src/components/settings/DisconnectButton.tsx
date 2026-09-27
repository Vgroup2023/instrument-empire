'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function DisconnectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    if (!window.confirm('Disconnect QuickBooks? You can reconnect at any time.')) return;
    setLoading(true);
    try {
      await fetch('/api/auth/disconnect', { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={handleDisconnect} loading={loading}>
      Disconnect QuickBooks
    </Button>
  );
}
