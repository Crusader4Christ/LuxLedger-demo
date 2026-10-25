export interface DemoAccount {
  id: string;
  address: string;
  balance_minor: string;
  currency: string;
}

export interface DemoEntry {
  account_address: string;
  signed_amount_minor: string;
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
  holds: { id: string; reference: string; description: string | null; state: string;
    original_amount_minor: string; remaining_amount_minor: string }[];
  trial_balance: { debits_minor: string; credits_minor: string };
  transactions_limited: boolean;
}

export interface DemoReconciliation {
  id: string;
  matchedCount: number;
  mismatchedCount: number;
  unmatchedExternalCount: number;
  unmatchedInternalCount: number;
  results: { id: string; status: string; reason: string }[];
}

export interface DemoAccountDetails {
  address: string;
  currency: string;
  available_minor: string;
  history_limited: boolean;
  history: { id: string; event: string; posted_minor: string; reserved_minor: string; created_at: string }[];
}

export const loadAccountDetails = async (address: string, signal: AbortSignal): Promise<DemoAccountDetails> => {
  const response = await fetch(`/demo/accounts/${encodeURIComponent(address)}/details`, { signal });
  const body = await response.json();
  if (!response.ok) throw new DemoApiError(body.message ?? 'Account details unavailable');
  return body;
};

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
  reconcile: (reference: string, amountMinor: string): DemoRequest => ({
    method: 'POST',
    path: '/demo/reconciliation',
    body: { reference, amount_minor: amountMinor },
  }),
  transfer: (from: string, to: string, amountMinor: string): DemoRequest => ({
    method: 'POST',
    path: '/demo/transfers',
    body: { from, to, amount_minor: amountMinor },
  }),
};

export const request = async <T = DemoState>(operation: DemoRequest): Promise<T> => {
  const response = await fetch(operation.path, {
    method: operation.method,
    headers: operation.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new DemoApiError('message' in body && body.message ? body.message : 'Demo request failed');
  }
  return body as T;
};

export const demoApi = {
  state: () => request(demoRequests.state()),
  reconcile: (reference: string, amountMinor: string) =>
    request<DemoReconciliation>(demoRequests.reconcile(reference, amountMinor)),
  reset: () => request(demoRequests.reset()),
  createAccount: (address: string) => request(demoRequests.createAccount(address)),
  transfer: (from: string, to: string, amountMinor: string) =>
    request(demoRequests.transfer(from, to, amountMinor)),
};

// POSIX shell: close the single-quoted string, emit an apostrophe in double quotes, then reopen it.
const shellSingleQuote = (value: string): string => `'${value.replaceAll("'", "'\"'\"'")}'`;

export const requestToCurl = (operation: DemoRequest, origin: string): string => {
  const lines = [`curl -X ${operation.method} ${shellSingleQuote(`${origin}${operation.path}`)}`];
  if (operation.body !== undefined) {
    lines.push("  -H 'content-type: application/json'");
    lines.push(`  --data ${shellSingleQuote(JSON.stringify(operation.body))}`);
  }
  return lines.join(' \\\n');
};
