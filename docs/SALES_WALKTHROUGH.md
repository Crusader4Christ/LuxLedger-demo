# Five-Minute Sales Walkthrough

## Before the call

1. Run the operator reset from [HOSTED_DEMO.md](HOSTED_DEMO.md).
2. Confirm `/ready` returns `{"ok":true}`.
3. Open the UI and keep `/docs` available in a second tab.

Do not show `.env.hosted`, raw API keys, JWT signing keys, or container environment output.

## Story

### 1. Start with the product boundary — 30 seconds

“LuxLedger is an embeddable double-entry ledger. This small application is an ordinary Fastify
and React product built from the published LuxLedger packages.”

Point out that the UI uses product-level addresses such as `wallet:alice`; it does not need to
understand database tables or ledger internals.

### 2. Show deterministic starting state — 30 seconds

Alice has USD 100.00 and Bob has USD 0.00. Explain that the hidden system funding account keeps
the opening transaction balanced.

### 3. Transfer USD 25.00 — 90 seconds

Choose Alice as source, Bob as destination, enter `25.00`, and submit.

Expected result:

- Alice: USD 75.00;
- Bob: USD 25.00;
- one LuxLedger transaction;
- one USD 25.00 debit and one USD 25.00 credit.

Scroll to “Request sent by this UI.” Show the JSON payload, then use **Copy curl** to demonstrate
that the same product action can be reproduced from a terminal.

### 4. Explain the backend — 90 seconds

Open the source or architecture diagram and show the composition:

- `@luxledger/core` enforces financial invariants;
- `@luxledger/postgres-adapter` persists the atomic transaction;
- `@luxledger/fastify-routes` exposes the canonical OpenAPI routes;
- the demo service maps wallet addresses to account IDs;
- the administrative API key never reaches the browser.

### 5. Show the integration surface — 60 seconds

Use the **API docs** link to open `/docs`. Emphasize typed HTTP contracts, idempotent transaction references, tenant
isolation, health/readiness, structured logs, and PostgreSQL transactions.

Keep the conversation on the working MVP. Holds, reconciliation, customer identity, and a hosted
administration console are possible follow-up scope, not features claimed by this demo UI.

## Qualification questions

- What event in your product should create a ledger transaction?
- Which balances must be available synchronously?
- Do you already have account/address identifiers?
- What are your idempotency and audit requirements?
- Would the first pilot run embedded in your backend or as a separately deployed service?

## Close

Offer a narrow pilot: map one real business event to a balanced LuxLedger transaction, import a
small representative dataset, and verify balances and audit entries with the customer.
