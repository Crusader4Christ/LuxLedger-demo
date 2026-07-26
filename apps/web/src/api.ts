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
  reset_enabled: boolean;
  transactions: DemoTransaction[];
}

export class DemoApiError extends Error {}

export interface DemoRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, string>;
}

export const demoRequests = {
  state: (): DemoRequest => ({ method: 'GET', path: '/demo/state' }),
  reset: (): DemoRequest => ({ method: 'POST', path: '/demo/reset' }),
  createAccount: (address: string): DemoRequest => ({
    method: 'POST',
    path: '/demo/accounts',
    body: { address },
  }),
  transfer: (from: string, to: string, amountMinor: string): DemoRequest => ({
    method: 'POST',
    path: '/demo/transfers',
    body: { from, to, amount_minor: amountMinor },
  }),
};

const request = async (operation: DemoRequest): Promise<DemoState> => {
  const response = await fetch(operation.path, {
    method: operation.method,
    headers: operation.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
  });
  const body = (await response.json()) as DemoState | { message?: string };
  if (!response.ok) {
    throw new DemoApiError('message' in body && body.message ? body.message : 'Demo request failed');
  }
  return body as DemoState;
};

export const demoApi = {
  state: () => request(demoRequests.state()),
  reset: () => request(demoRequests.reset()),
  createAccount: (address: string) => request(demoRequests.createAccount(address)),
  transfer: (from: string, to: string, amountMinor: string) =>
    request(demoRequests.transfer(from, to, amountMinor)),
};

export const requestToCurl = (operation: DemoRequest, origin: string): string => {
  const lines = [`curl -X ${operation.method} '${origin}${operation.path}'`];
  if (operation.body !== undefined) {
    lines.push("  -H 'content-type: application/json'");
    lines.push(`  --data '${JSON.stringify(operation.body)}'`);
  }
  return lines.join(' \\\n');
};
