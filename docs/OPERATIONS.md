# Operations Guide

## Environment variables

The demo reads process environment directly. For local commands, set `NODE_OPTIONS=--env-file=.env`; production runtimes should inject secrets/configuration through their normal secret manager.

| Variable | Required/default | Constraints and purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required by adapter/migrations | PostgreSQL connection URL for API, bootstrap, and migrations. |
| `DATABASE_URL_TEST` | Not used by normal API | Conventional URL for local test PostgreSQL on port 5433. |
| `DB_POOL_MAX` | `10` | Positive integer maximum connections in the process-local PostgreSQL pool. |
| `DB_IDLE_TIMEOUT` | `20` | Positive integer idle connection timeout in seconds. |
| `DB_CONNECT_TIMEOUT` | `10` | Positive integer connection timeout in seconds. |
| `NODE_ENV` | `development` in example | Runtime mode passed to dependencies; the demo does not branch on it directly. |
| `PORT` | `3000` | Positive integer; server binds `0.0.0.0`. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Positive integer hard deadline for graceful shutdown. |
| `JWT_SIGNING_KEY` | **Required** | Unpadded base64url encoding of at least 32 random bytes. Secret. |
| `JWT_PREVIOUS_SIGNING_KEYS` | Empty | Comma-separated valid old signing keys; no duplicates and must exclude current key. |
| `JWT_ISSUER` | `luxledger-api` | Issuer written to and required from access tokens. |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Integer 300–900; the supported/documented demo profile is exactly `900`. |
| `JWT_CLOCK_SKEW_SECONDS` | `5` | Integer 0–60 used for `iat`/`exp` verification. |
| `RATE_LIMIT_AUTH_TOKEN_MAX_REQUESTS` | `20` | Positive integer token-exchange requests per source IP/window/process. |
| `RATE_LIMIT_AUTH_TOKEN_WINDOW_SECONDS` | `60` | Positive integer fixed-window size. |
| `RATE_LIMIT_WRITE_MAX_REQUESTS` | `120` | Positive integer POST `/v1/*` requests per source IP/window/process, excluding separate token policy. |
| `RATE_LIMIT_WRITE_WINDOW_SECONDS` | `60` | Positive integer fixed-window size. |
| `BOOTSTRAP_TENANT_NAME` | **Required by bootstrap only** | Initial tenant display name. |
| `BOOTSTRAP_ADMIN_KEY_NAME` | `Initial admin key` | Initial key display name. |
| `BOOTSTRAP_ADMIN_API_KEY` | **Required by bootstrap only** | Raw initial admin key. Secret; choose a high-entropy value in shared environments. |

Unknown variables are ignored. Configuration is validated at process startup; invalid values fail fast.

## Rate limits

The token endpoint and write endpoints use separate in-memory, fixed-window policies keyed by client IP. A rejected call returns `429`, `Retry-After`, and:

```json
{"error":"RATE_LIMIT_EXCEEDED","message":"Rate limit exceeded","retry_after_seconds":42}
```

GET requests are not limited by the demo limiter. Counters are neither shared nor persisted, so limits reset on restart and multiply with replica count. Production deployments should use a trusted proxy configuration and shared ingress/gateway limiter; the demo does not process forwarded-IP trust explicitly.

## Health, readiness, and metrics

| Endpoint | Auth | Semantics |
| --- | --- | --- |
| `GET /health` | None | Process liveness only; `200 {"ok":true}`. |
| `GET /ready` | None | Runs `select 1`; 200 when PostgreSQL is reachable, otherwise 503. |
| `GET /metrics` | None | Prometheus text exposition from this process. |
| `GET /openapi.yaml` | None | Checked-in API contract. |
| `GET /docs` | None | Swagger UI; browser downloads UI assets from `unpkg.com`. |

Metrics include request totals and duration histograms labeled by route/status, authentication failures, and token-issuance failures. The registry is process-local and resets on restart. These endpoints are unauthenticated; restrict them at the network/ingress layer when needed.

Logs are structured JSON and include request ID, tenant/key IDs when authenticated, route, method, status, and duration. Secret values and JWTs are not intentionally logged.

## Graceful shutdown

On the first `SIGTERM` or `SIGINT`, the process:

1. asks Fastify to stop accepting and drain in-flight requests;
2. closes the PostgreSQL client (five-second database close timeout);
3. exits 0 on success.

If the total exceeds `SHUTDOWN_TIMEOUT_MS` (default 10 seconds), the hard-stop timer exits 1. Configure an orchestrator termination grace period longer than this value and remove the instance from readiness/load balancing before termination.

## Migrations and upgrades

Migrations are versioned SQL under `drizzle/`; Drizzle state is under `drizzle/meta/`. Run from the exact application release with the same `DATABASE_URL`:

```sh
export NODE_OPTIONS="--env-file=.env"
npm ci
npm run db:migrate
```

For a release:

1. back up the database and test restore;
2. compare package/OpenAPI versions with the [versioned checklist](releases/0.2.0.md);
3. rehearse migration against a production-like copy;
4. quiesce incompatible writers if a future migration requires it;
5. run migrations once as a release job, not independently in every replica;
6. deploy API instances and require `/ready` before traffic;
7. run the quickstart/smoke walkthrough and monitor errors/latency.

The baseline migration has no application-level downgrade command. Rollback means deploying compatible code and, when schema rollback is truly necessary, applying a separately reviewed reverse migration or restoring a backup. Never edit a migration already applied to a shared environment.

## Production limitations and non-goals

This is an integration demo and reusable financial-core composition, not a hosted or managed accounting product. In particular:

- no TLS termination, WAF, CORS policy, shared rate limiter, or trusted-proxy setup;
- no built-in secret manager or automated signing-key rotation;
- no PostgreSQL HA, backups, disaster recovery, external pooler, or capacity tuning;
- no distributed traces, alert rules, dashboards, audit export, or log retention policy;
- metrics/rate-limit state is per process and ephemeral;
- `/metrics`, `/docs`, and the OpenAPI contract are public unless the deployment restricts them;
- no FX conversion, currency exponent catalog, tax, fees, settlement orchestration, or general-ledger chart governance;
- only PostgreSQL 16 is supported; alternative persistence adapters are not implemented;
- reporting is limited to the documented ledger, entry, balance-history, and trial-balance surfaces;
- no asynchronous job system/webhooks for reconciliation and no file parser—the caller sends normalized external records;
- no UI, customer identity system, API-key self-service, fine-grained roles, or tenant lifecycle endpoints;
- no claim of regulatory, accounting-standard, PCI, or jurisdictional compliance.

Core records are not soft-deleted. Reversal/correction are the supported way to preserve immutable posting history. Features absent from the canonical OpenAPI contract must not be inferred from package internals.

Before production use, threat-model the deployment, pin exact package versions, establish database/audit/retention controls, and validate the domain model against the intended accounting policy.
