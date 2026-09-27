import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-steel-700 text-steel-100',
  success: 'bg-emerald-500/15 text-emerald-300',
  warning: 'bg-gold-500/15 text-gold-300',
  danger: 'bg-red-500/15 text-red-300',
  brand: 'bg-brand-500/15 text-brand-300',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
