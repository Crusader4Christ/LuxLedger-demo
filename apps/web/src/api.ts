export interface DemoAccount {
  id: string;
  address: string;
  balance_minor: string;
  currency: string;
}

export interface DemoEntry {
  account_address: string;
  amount_minor: string;
  direction: 'DEBIT' | 'CREDIT';
}

export interface DemoTransaction {
  id: string;
  reference: string;
  description: string | null;
  created_at: string | null;
  entries: DemoEntry[];
}

export interface DemoState {
  accounts: DemoAccount[];
  currency: string;
  ledger_id: string;
  transactions: DemoTransaction[];
}

export class DemoApiError extends Error {}

const request = async (path: string, init?: RequestInit): Promise<DemoState> => {
  const response = await fetch(path, init);
  const body = (await response.json()) as DemoState | { message?: string };
  if (!response.ok) {
    throw new DemoApiError('message' in body && body.message ? body.message : 'Demo request failed');
  }
  return body as DemoState;
};

export const demoApi = {
  state: () => request('/demo/state'),
  reset: () => request('/demo/reset', { method: 'POST' }),
  createAccount: (address: string) =>
    request('/demo/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    }),
  transfer: (from: string, to: string, amountMinor: string) =>
    request('/demo/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, amount_minor: amountMinor }),
    }),
};
