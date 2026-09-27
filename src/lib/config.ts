function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

export function getSessionSecret(): string {
  return required('SESSION_SECRET', process.env.SESSION_SECRET);
}

export function getAppPassword(): string {
  return required('APP_PASSWORD', process.env.APP_PASSWORD);
}

export const qboConfig = {
  get clientId() {
    return required('QBO_CLIENT_ID', process.env.QBO_CLIENT_ID);
  },
  get clientSecret() {
    return required('QBO_CLIENT_SECRET', process.env.QBO_CLIENT_SECRET);
  },
  get redirectUri() {
    return required('QBO_REDIRECT_URI', process.env.QBO_REDIRECT_URI);
  },
  get environment(): 'sandbox' | 'production' {
    return process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  },
  get accountingApiBaseUrl(): string {
    return this.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  },
};

export type ProviderMode = 'mock' | 'live';

function providerMode(name: string): ProviderMode {
  return process.env[name] === 'live' ? 'live' : 'mock';
}

export const providers = {
  get payments(): ProviderMode {
    return providerMode('PAYMENTS_PROVIDER');
  },
  get payroll(): ProviderMode {
    return providerMode('PAYROLL_PROVIDER');
  },
  get capital(): ProviderMode {
    return providerMode('CAPITAL_PROVIDER');
  },
  get benchmark(): ProviderMode {
    return providerMode('BENCHMARK_PROVIDER');
  },
};
