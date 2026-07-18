# LuxLedger Demo API

Reference REST API built on top of the LuxLedger packages.

## Purpose

- Demonstrate how to compose `@luxledger/core` with Fastify, Drizzle, and PostgreSQL.
- Keep the core LuxLedger repository focused on reusable packages.
- Provide a runnable OpenAPI-backed demo for new users.

## Local setup

1. Start PostgreSQL: `docker compose up -d`
2. Copy environment defaults: `cp .env.example .env`
3. Install dependencies: `bun install`
4. Run migrations: `bun run db:migrate`
5. Start the API: `bun run dev`

The demo installs LuxLedger packages from the public npm registry.

## OpenAPI

- Contract file: `openapi/openapi.yaml`
- Local raw spec endpoint: `GET /openapi.yaml`
- Local Swagger UI: `GET /docs`

## Main endpoints

- `GET /health`, `GET /ready`
- `POST /v1/auth/token`
- `POST/GET /v1/ledgers`, `GET /v1/ledgers/:id`
- `POST/GET /v1/transactions`, `POST/GET /v1/accounts`, `GET /v1/accounts/:id`, `GET /v1/entries`
- `GET /v1/ledgers/:ledger_id/trial-balance`
- `GET/POST /v1/admin/api-keys`, `POST /v1/admin/api-keys/:id/revoke`
