import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AccountSide, ApiKeyRole, UnauthorizedError, type ApplicationServices } from '@luxledger/core/application';
import { OverdraftPolicy } from '@luxledger/core/account';
import type { DbClient } from '@luxledger/postgres-adapter';
import { issueAccessToken, type JwtAuthConfig } from '../api/auth/jwt';
import { FixedWindowLimiter } from '../api/rate-limit/fixed-window-limiter';
import { RateLimitExceededError } from '../api/errors';

const COOKIE = 'luxledger_sandbox';
const SESSION_SECONDS = 8 * 60 * 60;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const cookieValue = (request: FastifyRequest) => request.headers.cookie?.split(';')
  .map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

export function registerSandbox(server: FastifyInstance, db: DbClient, services: ApplicationServices, jwt: JwtAuthConfig) {
  const limiter = new FixedWindowLimiter();
  const session = async (request: FastifyRequest) => {
    const secret = cookieValue(request);
    if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new UnauthorizedError('Start a demo session first');
    const [row] = await db.sql`select s.*, k.revoked_at from demo_sessions s
      join api_keys k on k.id = s.api_key_id
      where s.token_hash = ${hash(secret)} and s.expires_at > now() and k.revoked_at is null`;
    if (!row) throw new UnauthorizedError('Demo session expired. Start a new sandbox.');
    return row;
  };
  const payload = async (row: Record<string, any>) => ({
    access_token: issueAccessToken({ tenantId: row.tenant_id, apiKeyId: row.api_key_id, role: ApiKeyRole.SERVICE }, jwt),
    expires_in: jwt.accessTokenTtlSeconds,
    session_expires_at: new Date(row.expires_at).toISOString(),
    tenant_id: row.tenant_id,
    assets: (await services.assets.list({ tenantId: row.tenant_id, limit: 200 })).data.map(asset => ({ code: asset.code, scale: asset.scale })),
  });

  server.addHook('onRequest', async request => {
    if (!request.url.startsWith('/v1/') || !request.apiKeyId) return;
    const [expired] = await db.sql`select id from demo_sessions
      where api_key_id = ${request.apiKeyId} and expires_at <= now()`;
    if (expired) throw new UnauthorizedError('Demo session expired');
  });

  server.get('/demo/session', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    return payload(await session(request));
  });

  server.post('/demo/session', async (request, reply) => {
    // A new tenant is host provisioning, not part of the library's financial API.
    if (request.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ error: 'FORBIDDEN', message: 'Same-origin session creation required' });
    const origin = request.headers.origin;
    // Browsers set Sec-Fetch-Site before a reverse proxy can rewrite Host/Origin.
    let sameOrigin = request.headers['sec-fetch-site'] === 'same-origin' || !origin;
    try { sameOrigin ||= new URL(origin!).host === request.headers.host; } catch { /* Reject malformed Origin. */ }
    if (!sameOrigin) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Same-origin session creation required' });
    const decision = limiter.consume(request.ip, { maxRequests: 20, windowSeconds: 3600 });
    if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
    const secret = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
    const row = await db.sql.begin(async sql => {
      const [tenant] = await sql.unsafe("insert into tenants (name) values ('Interactive sandbox') returning id");
      const [key] = await sql.unsafe("insert into api_keys (tenant_id, name, role, key_hash) values ($1, 'Sandbox service', 'SERVICE', $2) returning id", [tenant.id, hash(randomBytes(32).toString('hex'))]);
      const [created] = await sql.unsafe('insert into demo_sessions (token_hash, tenant_id, api_key_id, expires_at) values ($1, $2, $3, $4) returning *', [hash(secret), tenant.id, key.id, expires.toISOString()]);
      return created;
    });
    try {
      for (const code of ['USD', 'EUR']) {
        await services.assets.create({ tenantId: row.tenant_id, code, scale: 2 });
        const ledger = await services.ledgers.create({ tenantId: row.tenant_id, name: `${code} product ledger` });
        const accounts: Record<string, string> = {};
        for (const [name, side, policy, grant] of [
          ['system:funding', AccountSide.DEBIT, OverdraftPolicy.ALLOW, false],
          ['wallet:alice', AccountSide.CREDIT, OverdraftPolicy.DISALLOW, false],
          ['wallet:bob', AccountSide.CREDIT, OverdraftPolicy.DISALLOW, false],
          ['platform:fees', AccountSide.CREDIT, OverdraftPolicy.DISALLOW, false],
          ['credits:alice', AccountSide.CREDIT, OverdraftPolicy.DISALLOW, true],
          ['service:usage', AccountSide.CREDIT, OverdraftPolicy.DISALLOW, false],
        ] as const) {
          const account = await services.accounts.create({ tenantId: row.tenant_id, ledgerId: ledger.id, name, side, overdraftPolicy: policy, grantEnabled: grant, currency: code });
          accounts[name] = account.id;
        }
        await services.transactions.create({ tenantId: row.tenant_id, ledgerId: ledger.id,
          reference: `sandbox-${code}-opening`, currency: code, description: 'Opening wallet funding',
          metadata: { scenario: 'wallet', provider: { payment_id: 'pay_opening_001' } },
          entries: [{ accountId: accounts['system:funding'], signedAmountMinor: 10000n, currency: code },
            { accountId: accounts['wallet:alice'], signedAmountMinor: -10000n, currency: code }] });
      }
    } catch (error) {
      await db.sql`update api_keys set revoked_at = now() where id = ${row.api_key_id}`;
      throw error;
    }
    // Replacing a sandbox revokes its previous credential, never truncates shared tables.
    const previous = cookieValue(request);
    if (previous) await db.sql`update api_keys set revoked_at = now() where id in
      (select api_key_id from demo_sessions where token_hash = ${hash(previous)})`;
    reply.header('set-cookie', `${COOKIE}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
    reply.header('cache-control', 'no-store');
    return reply.code(201).send(await payload(row));
  });

  server.get<{ Querystring: { ledger_id: string; cursor?: string; limit?: number } }>('/demo/session/holds', {
    schema: { querystring: { type: 'object', additionalProperties: false, required: ['ledger_id'], properties: {
      ledger_id: { type: 'string', format: 'uuid' }, cursor: { type: 'string', format: 'uuid' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
    } } },
  }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const row = await session(request);
    const { ledger_id, cursor, limit = 25 } = request.query;
    // Library 0.5 has no public hold list. This host-only read is explicitly scoped.
    const holds = await db.sql.begin(async sql => {
      await sql.unsafe("select set_config('app.tenant_id', $1, true)", [row.tenant_id]);
      return sql.unsafe(`select id, ledger_id, reference, description, state,
        original_amount_minor::text, remaining_amount_minor::text, created_at
        from holds where tenant_id = $1 and ledger_id = $2
        and ($3::uuid is null or id > $3::uuid) order by id asc limit $4`,
        [row.tenant_id, ledger_id, cursor ?? null, limit + 1]);
    });
    return { data: holds.slice(0, limit), next_cursor: holds.length > limit ? holds[limit - 1].id : null };
  });
}
