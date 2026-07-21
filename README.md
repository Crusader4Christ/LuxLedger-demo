# LuxLedger Demo API

Runnable reference API for prospects evaluating LuxLedger and integrators learning how to compose `@luxledger/core`, Fastify, Drizzle, and PostgreSQL. The checked-in contract is [OpenAPI 0.2.0](openapi/openapi.yaml).

The wider product guarantees and package boundaries are maintained in the upstream [LuxLedger documentation](https://github.com/Crusader4Christ/LuxLedger/tree/main/docs). This repository documents the behavior of the exact released package set installed by the demo.

## 10–15 minute quickstart

### Prerequisites

- Node.js 22 and npm 10+
- Docker Engine with Docker Compose v2
- `curl`, `openssl`, and a POSIX shell (`bash` or `zsh`)

Commands below assume the repository root and use `http://localhost:3000`.

### 1. Install and configure

```sh
npm ci
cp .env.example .env
JWT_SIGNING_KEY="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
sed -i.bak "s|REPLACE_WITH_BASE64URL_32_BYTE_SECRET|$JWT_SIGNING_KEY|" .env
rm .env.bak
```

Node does **not** read `.env` automatically. Load it for every npm command in this shell:

```sh
export NODE_OPTIONS="--env-file=.env"
```

Do not use `source .env`: secrets or values containing shell metacharacters need not be valid shell syntax. Node's `--env-file` parser is the supported path for this demo.

### 2. Start PostgreSQL and migrate

```sh
docker compose up -d postgres
docker compose exec postgres pg_isready -U luxledger -d luxledger
npm run db:migrate
```

Expected readiness output ends with `accepting connections`; migration output ends successfully with `migrations applied successfully` (or reports that there is nothing left to migrate).

### 3. Bootstrap a tenant and its first admin key

`.env.example` supplies demo-only bootstrap values. Replace `BOOTSTRAP_ADMIN_API_KEY` before any shared deployment.

```sh
npm run bootstrap:admin-key
```

Expected first-run result (`tenantId` and `apiKeyId` vary):

```json
{
  "created": true,
  "tenantId": "<uuid>",
  "apiKeyId": "<uuid>"
}
```

Bootstrap is deliberately one-shot for the database. A retry prints `Bootstrap skipped: api_keys already contains records`. To create further keys, use the admin API; do not rerun bootstrap.

### 4. Start and probe the API

```sh
npm run dev
```

In a second shell:

```sh
export BASE_URL=http://localhost:3000
curl -i "$BASE_URL/health"
curl -i "$BASE_URL/ready"
```

Both return `HTTP/1.1 200 OK` and:

```json
{"ok":true}
```

`/health` proves the process is serving. `/ready` also runs `select 1` against PostgreSQL and returns `503` with `{"error":"NOT_READY","message":"Service not ready"}` when the database is unavailable.

## Copy/paste ledger walkthrough

Keep the API running. In the second shell, load the same bootstrap key and define a JSON helper:

```sh
export BASE_URL=http://localhost:3000
export ADMIN_API_KEY=ll_demo_admin_change_me
json_value() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s)[process.argv[1]]))' "$1"; }
```

### Obtain an access token — `200`

```sh
TOKEN_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST \
  -H "x-api-key: $ADMIN_API_KEY" "$BASE_URL/v1/auth/token")"
printf '%s\n' "$TOKEN_RESPONSE"
export ACCESS_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | sed '$d' | json_value access_token)"
```

Response body (the JWT varies):

```json
{"access_token":"<jwt>","token_type":"Bearer","expires_in":900}
```

The final output line is `200`. Tokens last exactly 900 seconds with the supplied configuration.

### Create a ledger — `201`

```sh
LEDGER_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Quickstart USD"}' "$BASE_URL/v1/ledgers")"
printf '%s\n' "$LEDGER_RESPONSE"
export LEDGER_ID="$(printf '%s' "$LEDGER_RESPONSE" | sed '$d' | json_value id)"
```

```json
{"id":"<uuid>","tenantId":"<uuid>","name":"Quickstart USD","createdAt":"<date-time>","updatedAt":"<date-time>"}
```

The final line is `201`.

### Create debit and credit accounts — `201` each

```sh
DEBIT_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d "{\"ledger_id\":\"$LEDGER_ID\",\"name\":\"Cash\",\"side\":\"DEBIT\",\"overdraft_policy\":\"ALLOW\",\"currency\":\"USD\"}" \
  "$BASE_URL/v1/accounts")"
printf '%s\n' "$DEBIT_RESPONSE"
export DEBIT_ACCOUNT_ID="$(printf '%s' "$DEBIT_RESPONSE" | sed '$d' | json_value id)"

CREDIT_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d "{\"ledger_id\":\"$LEDGER_ID\",\"name\":\"Revenue\",\"side\":\"CREDIT\",\"overdraft_policy\":\"ALLOW\",\"currency\":\"USD\"}" \
  "$BASE_URL/v1/accounts")"
printf '%s\n' "$CREDIT_RESPONSE"
export CREDIT_ACCOUNT_ID="$(printf '%s' "$CREDIT_RESPONSE" | sed '$d' | json_value id)"
```

Each body has this shape and is followed by `201`:

```json
{"id":"<uuid>","tenant_id":"<uuid>","ledger_id":"<uuid>","name":"Cash","side":"DEBIT","overdraft_policy":"ALLOW","currency":"USD","balance_minor":"0","created_at":"<date-time>"}
```

### Post a balanced transaction — `201`

```sh
TX_BODY="{\"ledger_id\":\"$LEDGER_ID\",\"reference\":\"quickstart-sale-001\",\"currency\":\"USD\",\"description\":\"Quickstart sale\",\"entries\":[{\"account_id\":\"$DEBIT_ACCOUNT_ID\",\"direction\":\"DEBIT\",\"amount_minor\":\"1250\",\"currency\":\"USD\"},{\"account_id\":\"$CREDIT_ACCOUNT_ID\",\"direction\":\"CREDIT\",\"amount_minor\":\"1250\",\"currency\":\"USD\"}]}"
TX_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d "$TX_BODY" "$BASE_URL/v1/transactions")"
printf '%s\n' "$TX_RESPONSE"
export TRANSACTION_ID="$(printf '%s' "$TX_RESPONSE" | sed '$d' | json_value transaction_id)"
```

```json
{"transaction_id":"<uuid>","created":true}
```

The final line is `201`. Money is represented as a base-10 string in minor units: `"1250"` USD means USD 12.50.

### Retry the identical request — `200`, idempotent

```sh
curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d "$TX_BODY" "$BASE_URL/v1/transactions"
```

```json
{"transaction_id":"<same uuid>","created":false}
```

The final line is `200`. Idempotency is scoped by tenant plus `reference`; no separate idempotency header is used.

### Read transaction, entries, and trial balance — `200`

```sh
curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/v1/transactions/$TRANSACTION_ID"

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/v1/entries?limit=50"

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/v1/ledgers/$LEDGER_ID/trial-balance"
```

Representative bodies (IDs/timestamps vary), each followed by `200`:

```json
{"id":"<transaction uuid>","tenant_id":"<uuid>","ledger_id":"<ledger uuid>","reference":"quickstart-sale-001","currency":"USD","description":"Quickstart sale","related_transaction_id":null,"relation_type":null,"effective_at":"<date-time>","created_at":"<date-time>"}
```

```json
{"data":[{"id":"<uuid>","transaction_id":"<transaction uuid>","account_id":"<account uuid>","direction":"DEBIT","amount_minor":"1250","currency":"USD","created_at":"<date-time>"}],"next_cursor":null}
```

```json
{"ledger_id":"<ledger uuid>","accounts":[{"account_id":"<account uuid>","code":"<code>","name":"Cash","normal_balance":"DEBIT","balance":"1250","is_contra":false}],"total_debits":"1250","total_credits":"1250"}
```

## Continue evaluating

- [Integration guide](docs/INTEGRATION.md): auth, roles, wire conventions, pagination, and errors.
- [Scenario cookbook](docs/SCENARIOS.md): failure modes, bulk atomicity, reversal/correction, holds, backdating, and reconciliation.
- [Operations guide](docs/OPERATIONS.md): environment, probes, metrics, shutdown, migrations, and production limitations.
- [Architecture](ARCHITECTURE.md): package boundaries, tenancy, transactions, error mapping, and deployment.
- [Release checklist](docs/releases/0.2.0.md): pinned package/spec versions and drift/link/walkthrough checks.
- Upstream references: [product overview](https://github.com/Crusader4Christ/LuxLedger/blob/main/docs/product/overview.md), [ledger invariants](https://github.com/Crusader4Christ/LuxLedger/blob/main/docs/product/invariants.md), and [known limitations](https://github.com/Crusader4Christ/LuxLedger/blob/main/docs/product/limitations.md).
- Raw contract: `GET /openapi.yaml`; Swagger UI: `GET /docs` (its assets load from a public CDN).

Stop local services with `docker compose down`. Add `-v` only when you intentionally want to delete the demo database volume.
