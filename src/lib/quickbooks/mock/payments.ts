import { readJsonFile, writeJsonFile } from '@/lib/store/jsonStore';
import { getAppBaseUrl } from '@/lib/config';
import type { PaymentLink, CreatePaymentLinkInput, UpdatePaymentLinkInput } from '@/lib/quickbooks/payments';

const FILE_NAME = 'payment-links.json';

async function loadAll(): Promise<PaymentLink[]> {
  return readJsonFile<PaymentLink[]>(FILE_NAME, []);
}

async function saveAll(links: PaymentLink[]): Promise<void> {
  await writeJsonFile(FILE_NAME, links);
}

export async function mockListPaymentLinks(): Promise<PaymentLink[]> {
  const links = await loadAll();
  return links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function mockCreatePaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
  const links = await loadAll();
  const id = crypto.randomUUID();
  const link: PaymentLink = {
    id,
    customerId: input.customerId,
    customerName: input.customerName,
    email: input.email,
    amount: input.amount,
    description: input.description,
    status: 'active',
    url: `${getAppBaseUrl()}/pay/demo-${id.slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  links.push(link);
  await saveAll(links);
  return link;
}

export async function mockSendPaymentLink(id: string, email?: string): Promise<PaymentLink> {
  const links = await loadAll();
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error('Payment link not found.');
  link.status = 'sent';
  link.sentAt = new Date().toISOString();
  if (email) link.email = email;
  await saveAll(links);
  return link;
}

export async function mockUpdatePaymentLink(id: string, input: UpdatePaymentLinkInput): Promise<PaymentLink> {
  const links = await loadAll();
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error('Payment link not found.');
  if (link.status !== 'active') throw new Error('Only a link that hasn’t been sent yet can be edited.');
  if (input.amount !== undefined) link.amount = input.amount;
  if (input.description !== undefined) link.description = input.description;
  if (input.email !== undefined) link.email = input.email;
  await saveAll(links);
  return link;
}

export async function mockCancelPaymentLink(id: string): Promise<PaymentLink> {
  const links = await loadAll();
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error('Payment link not found.');
  if (link.status === 'paid') throw new Error('A paid link can’t be cancelled.');
  link.status = 'cancelled';
  await saveAll(links);
  return link;
}
