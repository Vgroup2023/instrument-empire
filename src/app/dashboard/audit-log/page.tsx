import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th } from '@/components/ui/Table';
import { AuditLogRow } from '@/components/auditLog/AuditLogRow';
import { describeError } from '@/lib/errors';
import { listAuditLog, type AuditLogEntry } from '@/lib/accounting/auditLog';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="A change-history trail for journal entries and the chart of accounts — what changed, before vs. after, and when. This app has a single shared login rather than individual user accounts, so entries record what changed and when, not who made the change."
      />
      <AuditLogBody />
    </div>
  );
}

async function AuditLogBody() {
  let entries: AuditLogEntry[] = [];
  let error: string | null = null;

  try {
    entries = await listAuditLog();
  } catch (err) {
    error = describeError(err, 'Failed to load the audit log.');
  }

  if (error) {
    return <EmptyState title="Couldn't load the audit log" description={error} />;
  }

  return (
    <Card>
      <CardBody className="p-0">
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nothing logged yet"
              description="Changes to journal entries and the chart of accounts will show up here."
            />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>When</Th>
                <Th>Entity</Th>
                <Th>Action</Th>
                <Th className="text-right">Details</Th>
              </Tr>
            </Thead>
            <Tbody>
              {entries.map((entry) => (
                <AuditLogRow key={entry.Id} entry={entry} />
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
