import { randomUUID } from 'node:crypto';
import {
  AccountSide,
  EntryDirection,
  type ApplicationServices,
} from '@luxledger/core/application';
import { OverdraftPolicy, type AccountEntity } from '@luxledger/core/account';
import type { DbClient } from '@luxledger/postgres-adapter';

const LEDGER_NAME = 'LuxLedger transfer demo';
const CURRENCY = 'USD';
const FUNDING_ADDRESS = 'system:funding';
const ADDRESS_PATTERN = /^[a-z][a-z0-9]*(?::[a-z][a-z0-9-]*)+$/;

export class DemoInputError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'DEMO_INPUT_ERROR';
  }
}

export class DemoNotReadyError extends Error {
  readonly statusCode = 409;
  constructor() {
    super('Demo data has not been seeded');
    this.name = 'DEMO_NOT_READY';
  }
}

export class DemoService {
  private resetPromise: Promise<unknown> | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly services: ApplicationServices,
    private readonly config: { adminApiKey: string; adminKeyName: string; tenantName: string },
  ) {}

  async getState() {
    const { tenantId, ledgerId } = await this.context();
    const accounts = await this.accounts(tenantId, ledgerId);
    const addresses = new Map(accounts.map((account) => [account.id, account.name]));
    const transactions = await this.services.transactions.list({ tenantId, ledgerId, limit: 100 });

    return {
      currency: CURRENCY,
      ledger_id: ledgerId,
      accounts: accounts
        .filter((account) => account.name !== FUNDING_ADDRESS)
        .map((account) => ({
          id: account.id,
          address: account.name,
          balance_minor: account.balanceMinor.toString(),
          currency: account.currency,
        }))
        .sort((left, right) => left.address.localeCompare(right.address)),
      transactions: transactions.data.map((transaction) => ({
        id: transaction.id.toString(),
        reference: transaction.reference,
        description: transaction.description,
        created_at: transaction.createdAt?.toISOString() ?? null,
        entries: transaction.entries.map((entry) => ({
          account_address: addresses.get(String(entry.accountId)) ?? String(entry.accountId),
          amount_minor: entry.money.amountMinor.toString(),
          direction: entry.direction,
        })),
      })),
    };
  }

  async createAccount(address: string) {
    const normalized = normalizeAddress(address);
    const { tenantId, ledgerId } = await this.context();
    if ((await this.accounts(tenantId, ledgerId)).some((account) => account.name === normalized)) {
      throw new DemoInputError(`Account ${normalized} already exists`);
    }
    await this.services.accounts.create({
      tenantId,
      ledgerId,
      name: normalized,
      side: AccountSide.CREDIT,
      overdraftPolicy: OverdraftPolicy.DISALLOW,
      currency: CURRENCY,
    });
    return this.getState();
  }

  async fund(address: string, amountMinor: string, reference = `demo-funding-${randomUUID()}`) {
    const amount = parseAmount(amountMinor);
    const { tenantId, ledgerId } = await this.context();
    const accounts = await this.accounts(tenantId, ledgerId);
    const destination = findAccount(accounts, normalizeAddress(address));
    const funding = findAccount(accounts, FUNDING_ADDRESS);
    await this.services.transactions.create({
      tenantId,
      ledgerId,
      reference,
      currency: CURRENCY,
      description: `Fund ${destination.name}`,
      entries: [
        entry(funding.id, EntryDirection.DEBIT, amount),
        entry(destination.id, EntryDirection.CREDIT, amount),
      ],
    });
    return this.getState();
  }

  async transfer(from: string, to: string, amountMinor: string) {
    const sourceAddress = normalizeAddress(from);
    const destinationAddress = normalizeAddress(to);
    if (sourceAddress === destinationAddress) {
      throw new DemoInputError('Source and destination accounts must be different');
    }
    const amount = parseAmount(amountMinor);
    const { tenantId, ledgerId } = await this.context();
    const accounts = await this.accounts(tenantId, ledgerId);
    const source = findAccount(accounts, sourceAddress);
    const destination = findAccount(accounts, destinationAddress);
    await this.services.transactions.create({
      tenantId,
      ledgerId,
      reference: `demo-transfer-${randomUUID()}`,
      currency: CURRENCY,
      description: `${source.name} to ${destination.name}`,
      entries: [
        entry(source.id, EntryDirection.DEBIT, amount),
        entry(destination.id, EntryDirection.CREDIT, amount),
      ],
    });
    return this.getState();
  }

  async reset() {
    if (this.resetPromise !== null) return this.resetPromise;
    this.resetPromise = this.performReset();
    try {
      return await this.resetPromise;
    } finally {
      this.resetPromise = null;
    }
  }

  private async performReset() {
    if (this.config.adminApiKey.length === 0) {
      throw new Error('BOOTSTRAP_ADMIN_API_KEY is required for demo reset');
    }
    await this.db.sql.unsafe(`truncate table recon_results, recon_runs, recon_records,
      recon_uploads, recon_rules, balance_snapshots, hold_entries, holds, entries,
      transactions, accounts, ledgers, api_keys, tenants restart identity cascade`);
    const bootstrap = await this.services.apiKeys.bootstrapInitialAdmin({
      tenantName: this.config.tenantName,
      keyName: this.config.adminKeyName,
      rawApiKey: this.config.adminApiKey,
    });
    if (!bootstrap.created || bootstrap.tenantId === undefined) {
      throw new Error('Unable to create the demo tenant');
    }
    const ledger = await this.services.ledgers.create({ tenantId: bootstrap.tenantId, name: LEDGER_NAME });
    for (const account of [
      { name: FUNDING_ADDRESS, side: AccountSide.DEBIT, policy: OverdraftPolicy.ALLOW },
      { name: 'wallet:alice', side: AccountSide.CREDIT, policy: OverdraftPolicy.DISALLOW },
      { name: 'wallet:bob', side: AccountSide.CREDIT, policy: OverdraftPolicy.DISALLOW },
    ]) {
      await this.services.accounts.create({
        tenantId: bootstrap.tenantId,
        ledgerId: ledger.id,
        name: account.name,
        side: account.side,
        overdraftPolicy: account.policy,
        currency: CURRENCY,
      });
    }
    await this.fund('wallet:alice', '10000', 'demo-seed-funding-alice-v1');
    return this.getState();
  }

  private async context(): Promise<{ tenantId: string; ledgerId: string }> {
    let tenantId: string;
    try {
      tenantId = (await this.services.apiKeys.authenticate(this.config.adminApiKey)).tenantId;
    } catch {
      throw new DemoNotReadyError();
    }
    const ledger = (await this.services.ledgers.list(tenantId)).find((item) => item.name === LEDGER_NAME);
    if (ledger === undefined) throw new DemoNotReadyError();
    return { tenantId, ledgerId: ledger.id };
  }

  private async accounts(tenantId: string, ledgerId: string): Promise<AccountEntity[]> {
    return (await this.services.accounts.list({ tenantId, ledgerId, limit: 100 })).data;
  }
}

const normalizeAddress = (value: string): string => {
  const address = value.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(address) || address.length > 80) {
    throw new DemoInputError('Address must look like wallet:alice');
  }
  if (address === FUNDING_ADDRESS) throw new DemoInputError('The system funding account is reserved');
  return address;
};

const parseAmount = (value: string): bigint => {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new DemoInputError('amount_minor must be a positive base-10 integer string');
  }
  return BigInt(value);
};

const findAccount = (accounts: AccountEntity[], address: string): AccountEntity => {
  const account = accounts.find((candidate) => candidate.name === address);
  if (account === undefined) throw new DemoInputError(`Unknown account ${address}`);
  return account;
};

const entry = (accountId: string, direction: 'DEBIT' | 'CREDIT', amountMinor: bigint) => ({
  accountId,
  direction,
  amountMinor,
  currency: CURRENCY,
});
