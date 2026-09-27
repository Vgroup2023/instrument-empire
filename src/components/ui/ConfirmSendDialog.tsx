'use client';

import { ReactNode, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ConfirmSendDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Rendered preview of exactly what will be sent (recipient, subject, amount, message, etc). */
  children: ReactNode;
  onConfirm: () => Promise<void>;
  onSuccess?: () => void;
}

/**
 * Every outbound action in the app (send invoice/estimate, send payment
 * link, send reminder) routes through this dialog so nothing goes out
 * without an explicit preview + confirmation click.
 */
export function ConfirmSendDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Send',
  children,
  onConfirm,
  onSuccess,
}: ConfirmSendDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Nothing was sent.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">{children}</div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
