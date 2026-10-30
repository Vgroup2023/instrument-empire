import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { appUsers } from '@/db/schema';
import { smtpConfig } from '@/lib/config';
import { sendCustomerMail } from '@/lib/desk/notify';
import { BRAND } from '@/lib/brand';
import type { TeamTask } from './tasks';

/**
 * Emails the person a task was handed to. Only for work addressed to one person (a department hears about its work in
 * the Team inbox and the bell). Best effort: it returns whether a mail went out and never throws, so a mail problem can
 * not undo the assignment.
 */
export async function emailAssignee(task: TeamTask, from: string, baseUrl: string): Promise<boolean> {
  try {
    if (!task.toUserId || !smtpConfig.isConfigured) return false;
    const [u] = await getDb().select({ email: appUsers.email, name: appUsers.name, status: appUsers.status }).from(appUsers).where(eq(appUsers.id, task.toUserId));
    if (!u || u.status !== 'active') return false;
    const first = u.name.trim().split(/\s+/)[0] || 'there';
    const lines = [
      `Hi ${first},`,
      '',
      `${from} handed you some work in ${BRAND.name}:`,
      '',
      task.title,
      ...(task.detail ? ['', task.detail] : []),
      ...(task.dueDate ? ['', `Due: ${task.dueDate}`] : []),
      '',
      `Open your Team inbox: ${baseUrl.replace(/\/$/, '')}/dashboard/inbox`,
      '',
    ];
    const r = await sendCustomerMail(u.email, `${from} handed you work: ${task.title}`.slice(0, 150), lines.join('\n'));
    return r.ok;
  } catch {
    return false;
  }
}
