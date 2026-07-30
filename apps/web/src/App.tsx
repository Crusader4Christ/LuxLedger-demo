import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  DemoApiError,
  demoApi,
  demoRequests,
  type DemoRequest,
  type DemoState,
  requestToCurl,
} from './api';

const GITHUB_URL = 'https://github.com/Crusader4Christ/LuxLedger';
const DESIGN_PARTNER_URL =
  'mailto:herman.klushin@gmail.com?subject=LuxLedger%20design%20partnership';

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
        <a className="brand" href="/" aria-label="LuxLedger demo home">
          <span className="mark">L</span> LuxLedger
        </a>
        <nav>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">GitHub</a>
          <a href="/docs" rel="noreferrer" target="_blank">API docs</a>
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
        <p className="eyebrow">OPEN-SOURCE FINANCIAL INFRASTRUCTURE</p>
        <h1>The ledger layer for products that move money.</h1>
        <p className="hero-copy">
          Build wallets, marketplaces, payouts, and stored-value products without maintaining
          double-entry invariants in application code.
        </p>
        <div className="hero-actions">
          <a className="button-link primary" href="#live-demo">Try the live demo</a>
          <a className="button-link secondary" href={DESIGN_PARTNER_URL}>
            Become a design partner
          </a>
        </div>
        <p className="hero-note">
          Built for Node.js teams · PostgreSQL-backed · Framework-agnostic core
        </p>
      </section>

      <section className="proof-strip" aria-label="Core ledger guarantees">
        <div><strong>Atomic</strong><span>double-entry posting</span></div>
        <div><strong>Idempotent</strong><span>transaction references</span></div>
        <div><strong>Auditable</strong><span>reversals and corrections</span></div>
        <div><strong>Portable</strong><span>Fastify and Express adapters</span></div>
      </section>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="section-intro" id="live-demo">
        <p className="eyebrow">LIVE REFERENCE FLOW</p>
        <h2>Move value. See every entry.</h2>
        <p>
          Create a transfer between two wallets and inspect the balanced transaction LuxLedger
          records.
        </p>
      </section>

      <section className="grid" aria-label="Interactive wallet transfer demo">
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

      <section className="capabilities" aria-labelledby="capabilities-title">
        <div className="section-intro compact">
          <p className="eyebrow">WHAT THE CORE PROVIDES</p>
          <h2 id="capabilities-title">Financial correctness, kept out of your handlers.</h2>
          <p>
            LuxLedger owns the ledger invariants. Your product keeps ownership of workflows,
            customer experience, and business rules.
          </p>
        </div>
        <div className="capability-grid">
          <article>
            <span>01</span>
            <h3>Balanced by construction</h3>
            <p>Every posted transaction contains equal debit and credit totals in one currency.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Safe retries</h3>
            <p>Tenant-scoped references make repeated transaction requests deterministic.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Immutable history</h3>
            <p>Correct mistakes through linked reversals and replacements, not destructive edits.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Operational visibility</h3>
            <p>Query balances, balance history, entries, trial balances, and reconciliation runs.</p>
          </article>
        </div>
      </section>

      <section className="partner-cta">
        <div>
          <p className="eyebrow">DESIGN PARTNER PROGRAM</p>
          <h2>Bring one real money flow.</h2>
          <p>
            We are working with a small number of engineering teams building wallets, payouts,
            marketplaces, and stored-value products. Evaluate one flow with direct implementation
            support and help shape the roadmap.
          </p>
          <p className="availability">
            Early access for evaluation and controlled pilots. Production-readiness work is
            ongoing.
          </p>
        </div>
        <div className="partner-actions">
          <a className="button-link light" href={DESIGN_PARTNER_URL}>Start a conversation</a>
          <a className="text-link" href={GITHUB_URL} rel="noreferrer" target="_blank">
            Explore the source <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="mark">L</span> LuxLedger</div>
        <p>Open-source double-entry ledger infrastructure.</p>
        <div>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">GitHub</a>
          <a href="/docs" rel="noreferrer" target="_blank">API docs</a>
          <a href="/openapi.yaml" rel="noreferrer" target="_blank">OpenAPI</a>
        </div>
      </footer>
    </main>
  );
}
