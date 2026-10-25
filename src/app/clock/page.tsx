import type { Metadata } from 'next';
import { ClockClient } from '@/components/workforce/ClockClient';

export const metadata: Metadata = { title: 'Time clock', robots: { index: false, follow: false } };

export default function ClockPage() {
  return <ClockClient />;
}
