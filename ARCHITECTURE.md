# App Composition Boundary

`apps/luxledger-api` is a composition root:
- server lifecycle and bootstrap
- env/config parsing
- infrastructure wiring (db/repository/services)
- auth/rate-limit/observability hooks
- adapter registration

HTTP route bindings and transport contracts are owned by adapter packages (`@luxledger/fastify-routes`, `@luxledger/http`).

Contributor guardrail:
- Do not define request/response schemas or transport DTO types in `apps/luxledger-api`.
- Reuse `@luxledger/http/contracts` as the single source for transport contracts.
