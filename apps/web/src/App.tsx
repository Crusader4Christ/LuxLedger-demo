import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  DemoApiError,
  demoApi,
  demoRequests,
  type DemoRequest,
  type DemoState,
  requestToCurl,
} from './api';

const formatMoney = (minor: string, currency: string): string => {
  const value = BigInt(minor);
  const absolute = value < 0n ? -value : value;
  const formatted = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${value < 0n ? '-' : ''}${formatted} ${currency}`;
};

const dollarsToMinor = (value: string): string | null => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
};

const copyText = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = value;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
};

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [from, setFrom] = useState('wallet:alice');
  const [to, setTo] = useState('wallet:bob');
  const [amount, setAmount] = useState('25.00');
  const [newAddress, setNewAddress] = useState('wallet:carol');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<DemoRequest>(demoRequests.state());
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const latest = useMemo(() => state?.transactions.at(-1) ?? null, [state]);

  const run = async (operation: DemoRequest, action: () => Promise<DemoState>) => {
    setBusy(true);
    setError(null);
    setCopyStatus('idle');
    setLastRequest(operation);
    try {
      setState(await action());
    } catch (cause) {
      setError(cause instanceof DemoApiError ? cause.message : 'The demo is temporarily unavailable');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run(demoRequests.state(), demoApi.state);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const minor = dollarsToMinor(amount);
    if (minor === null || minor === '0') {
      setError('Enter a positive amount with at most two decimal places');
      return;
    }
    const operation = demoRequests.transfer(from, to, minor);
    void run(operation, () => demoApi.transfer(from, to, minor));
  };

  const curl = requestToCurl(lastRequest, window.location.origin);
  const copyCurl = async () => {
    setCopyStatus((await copyText(curl)) ? 'copied' : 'failed');
  };

  return (
    <main>
      <header>
        <div className="brand"><span className="mark">L</span> LuxLedger</div>
        <nav>
          <a href="/docs" rel="noreferrer" target="_blank">API docs</a>
          <a href="/openapi.yaml" rel="noreferrer" target="_blank">OpenAPI</a>
          {state?.reset_enabled && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(demoRequests.reset(), demoApi.reset)}
            >
              Reset demo
            </button>
          )}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">REFERENCE APPLICATION</p>
        <h1>Move value. See the ledger.</h1>
        <p>Create a transfer between two demo wallets and inspect the balanced entries LuxLedger records.</p>
      </section>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="grid">
        <div className="panel">
          <div className="panel-title"><h2>Accounts</h2><span>USD ledger</span></div>
          <div className="accounts">
            {state?.accounts.map((account) => (
              <article className="account" data-testid={`account-${account.address}`} key={account.id}>
                <div><span className="avatar">{account.address.at(-1)?.toUpperCase()}</span><strong>{account.address}</strong></div>
                <b>{formatMoney(account.balance_minor, account.currency)}</b>
              </article>
            )) ?? <p className="muted">Load or reset the demo to begin.</p>}
          </div>
          <div className="create-account">
            <input aria-label="New account address" value={newAddress} onChange={(event) => setNewAddress(event.target.value)} />
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(demoRequests.createAccount(newAddress), () =>
                  demoApi.createAccount(newAddress),
                )
              }
            >
              Add account
            </button>
          </div>
        </div>

        <form className="panel transfer" onSubmit={submit}>
          <div className="panel-title"><h2>New transfer</h2><span>Double-entry</span></div>
          <label>From<select value={from} onChange={(event) => setFrom(event.target.value)}>{state?.accounts.map((a) => <option key={a.id}>{a.address}</option>)}</select></label>
          <label>To<select value={to} onChange={(event) => setTo(event.target.value)}>{state?.accounts.map((a) => <option key={a.id}>{a.address}</option>)}</select></label>
          <label>Amount<div className="amount"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
          <button className="primary" disabled={busy || !state}>{busy ? 'Recording…' : 'Send transfer'}</button>
        </form>
      </section>

      <section className="panel ledger">
        <div className="panel-title"><h2>How LuxLedger recorded it</h2><span>{latest ? latest.reference : 'No transaction'}</span></div>
        {latest ? <>
          <div className="transaction-meta"><strong>{latest.description}</strong><code>{latest.id}</code></div>
          <div className="entries">
            {latest.entries.map((entry, index) => <div className="entry" key={`${entry.account_address}-${index}`}>
              <span className={`badge ${entry.direction.toLowerCase()}`}>{entry.direction}</span>
              <strong>{entry.account_address}</strong>
              <span>{formatMoney(entry.amount_minor, state!.currency)}</span>
            </div>)}
          </div>
          <p className="balanced">✓ Debits and credits balance</p>
        </> : <p className="muted">The two ledger entries will appear here after a transfer.</p>}
      </section>

      <section className="panel request-preview" aria-labelledby="request-preview-title">
        <div className="panel-title">
          <h2 id="request-preview-title">Request sent by this UI</h2>
          <span>Demo application API</span>
        </div>
        <div className="request-line">
          <span>{lastRequest.method}</span>
          <code>{lastRequest.path}</code>
        </div>
        {lastRequest.body !== undefined && (
          <pre data-testid="request-body">{JSON.stringify(lastRequest.body, null, 2)}</pre>
        )}
        <div className="curl-header">
          <strong>Copy and run from your terminal</strong>
          <button className="secondary" onClick={() => void copyCurl()}>
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'failed'
                ? 'Copy failed'
                : 'Copy curl'}
          </button>
        </div>
        <pre data-testid="curl-preview">{curl}</pre>
        <p className="request-note">
          The browser calls the product-specific demo API. The backend maps wallet addresses to
          LuxLedger accounts and keeps administrative credentials server-side. Explore the{' '}
          <a href="/docs" rel="noreferrer" target="_blank">canonical LuxLedger HTTP API</a>.
        </p>
      </section>
    </main>
  );
}
