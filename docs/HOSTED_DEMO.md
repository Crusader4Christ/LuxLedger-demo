# Hosted Demo Runbook

This runbook deploys the interactive console as three containers:

```text
browser → nginx (web + same-origin proxy) → Fastify API → PostgreSQL 16
```

It is a private sales demo, not a production SaaS deployment. Put port 8080 behind HTTPS and
access control supplied by the hosting platform, VPN, or identity-aware proxy. Do not expose it
as an anonymous public service.

## Configure

Copy the example without committing the resulting secret file:

```sh
cp .env.hosted.example .env.hosted
```

Generate independent secrets:

```sh
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Use the first value as `POSTGRES_PASSWORD`, the second as `BOOTSTRAP_ADMIN_API_KEY`, and the
base64url value as `JWT_SIGNING_KEY`. URL-encode the database password when placing it inside
`DATABASE_URL`.

## Start and verify

```sh
docker compose --env-file .env.hosted -f compose.hosted.yml up -d --build
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
curl -fsS http://127.0.0.1:8080/demo/contract > /dev/null
```

The API container applies checked-in migrations and runs the idempotent demo seed before it
accepts traffic. The seed creates the same logical ledger, account addresses, reference, amount,
and balances on a new database. Restarting containers does not reset customer-visible state.

Only nginx publishes a host port. PostgreSQL and the API remain on the private Compose network.
The browser never receives `BOOTSTRAP_ADMIN_API_KEY` or `JWT_SIGNING_KEY`.

## Start a guided call

Open the UI in a private window or click **New sandbox**. This creates a private tenant and revokes only this browser's previous service credential; Alice starts at 100.00 and Bob at zero in USD/EUR. Whole-database reset is unnecessary between visitors.

For a full maintenance reset only, stop visitor traffic and use:

```sh
docker compose --env-file .env.hosted -f compose.hosted.yml run --rm \
  -e DEMO_ALLOW_RESET=true api npm run reset:demo
```

The command requires `DEMO_ALLOW_RESET=true` and a database named exactly `luxledger_demo_hosted`. It truncates that dedicated database, including all sandboxes. Never point it at a customer or shared ledger database.

Private sessions last eight hours. Replaced/expired tenant audit data is retained until maintenance reset; this is not a production data-retention service. See [OPERATIONS.md](OPERATIONS.md#private-sandbox-lifecycle).

## Operate

```sh
docker compose --env-file .env.hosted -f compose.hosted.yml ps
docker compose --env-file .env.hosted -f compose.hosted.yml logs --tail=200 api
docker compose --env-file .env.hosted -f compose.hosted.yml restart api web
```

Before each call, verify `/ready`, open the UI in a private window, and follow
[SALES_WALKTHROUGH.md](SALES_WALKTHROUGH.md).

Back up the PostgreSQL volume before upgrades. Deploy a single API replica: migrations and the
process-local rate limiter in this reference deployment are intentionally not designed for
multi-replica orchestration.
