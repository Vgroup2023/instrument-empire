import { INVOICE_LOGO } from '@/lib/invoiceLogo';
/**
 * Who the invoice is from. Set INVOICE_COMPANY_* on the host to fill in the address block; anything left unset is
 * simply not printed, so a document never shows made-up details.
 */
export const INVOICE_BRAND = {
  name: process.env.INVOICE_COMPANY_NAME || 'Globlex AI',
  slogan: process.env.INVOICE_COMPANY_SLOGAN || 'AI-Powered Copilot',
  addressLines: (process.env.INVOICE_COMPANY_ADDRESS || '').split('|').map((s) => s.trim()).filter(Boolean),
  phone: process.env.INVOICE_COMPANY_PHONE || '',
  email: process.env.INVOICE_COMPANY_EMAIL || '',
  website: process.env.INVOICE_COMPANY_WEBSITE || 'globlexai.com',
  paymentNote: process.env.INVOICE_PAYMENT_NOTE || '',
  terms: process.env.INVOICE_TERMS || '',
  logo: INVOICE_LOGO,
};
