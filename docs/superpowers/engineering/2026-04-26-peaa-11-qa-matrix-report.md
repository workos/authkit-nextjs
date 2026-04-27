# PEAA-11 QA Matrix: Customer + Person Surfaces

- Date: 2026-04-26 (America/Los_Angeles)
- QA mode: Diff-aware
- Scope: `examples/next` customer/person surfaces and PEAA-10 handoff checklist validation for PEAA-11
- Overall health score: 74/100
- Verdict: DONE_WITH_CONCERNS

## What was verified

1. Targeted app-layer regressions for customer/person store + flow logic.
2. Production build viability for customer/person routes.
3. Runtime route smoke for `/customers`, `/customers/[customerId]`, and `/people` under:
   - default env (no AuthKit vars)
   - minimal AuthKit env bootstrap
4. Visual evidence capture for runtime failures.

## Test Evidence

### A) PEAA-10 app-check harness (pass)

Command:

```bash
./docs/superpowers/engineering/scripts/run_peaa10_app_checks.sh
```

Result:

- `customer-person-flows.spec.ts`: 2/2 passed
- `customer-person-store.spec.ts`: 6/6 passed
- Typecheck (`examples/next/tsconfig.json`): passed
- Production build: passed
- Built routes include `/customers`, `/customers/[customerId]`, `/people`

### B) Runtime smoke with default env (fail)

Server:

```bash
cd examples/next && PORT=4123 NODE_ENV=production pnpm start
```

Route status:

- `/`: 500
- `/customers`: 500
- `/customers/cust_001`: 500
- `/people`: 500

Observed error:

- `Error: You must provide a redirect URI in the AuthKit middleware or in the environment variables.`

### C) Runtime smoke with minimal AuthKit env (pass for guard behavior)

Server:

```bash
cd examples/next && \
PORT=4126 NODE_ENV=production \
WORKOS_API_KEY=sk_test_1234567890 \
WORKOS_CLIENT_ID=client_1234567890 \
WORKOS_COOKIE_PASSWORD='kR620keEzOIzPThfnMEAba8XYgKdQ5vg' \
NEXT_PUBLIC_WORKOS_REDIRECT_URI='http://localhost:4126/callback' \
pnpm start
```

Anonymous route status:

- `/`: 307 (redirect to WorkOS authorize)
- `/customers`: 307 (redirect to WorkOS authorize)
- `/customers/cust_001`: 307 (redirect to WorkOS authorize)
- `/people`: 307 (redirect to WorkOS authorize)
- `/today`: 307 (redirect to WorkOS authorize)
- `/sign-in`: 307 (WorkOS sign-in)
- `/sign-up`: 307 (`screen_hint=sign-up`)

Interpretation:

- Customer/Person routes are wired and reachable behind expected auth guards once required env bootstrap exists.

### D) Screenshots

- `docs/superpowers/engineering/artifacts/peaa-11/customers-runtime.png`
- `docs/superpowers/engineering/artifacts/peaa-11/customer-detail-runtime.png`
- `docs/superpowers/engineering/artifacts/peaa-11/people-runtime.png`

## Findings

### 1) Blocker (environment bootstrap): missing AuthKit redirect URI causes global 500

- Severity: Blocker (for local/default-env runtime smoke)
- Impact: Customer and Person pages cannot be validated in a default local run because middleware throws before route-specific behavior.
- Repro steps:
  1. `cd examples/next && PORT=4123 NODE_ENV=production pnpm start`
  2. Open `/customers` or `/people`
  3. Observe HTTP 500 and middleware error about missing redirect URI
- Evidence: runtime logs + screenshots in `artifacts/peaa-11`

### 2) Resolved follow-up: SQL matrix executed after `DATABASE_URL` was provided

- Severity: Resolved
- Follow-up execution (2026-04-26, America/Los_Angeles):
  - `DATABASE_URL=postgres://$(whoami)@localhost:5432/postgres ./docs/superpowers/engineering/sql/run_peaa10_verification.sh`
- Evidence:
  - `docs/superpowers/engineering/sql/artifacts/peaa15_sql_matrix_20260426_193814.log`
- Result:
  - Harness passed with all assertions and rollback marker.

## Checklist Mapping (PEAA-10 Customer + Person QA Checklist)

1. Customer List + Metrics: `PASS` (validated by SQL harness follow-up run)
2. Customer Detail Bundle: `PASS` (validated by SQL harness follow-up run)
3. Customer CRUD Org Boundaries: `PASS` (cross-org owner rejection verified)
4. Person CRUD Linked to Customer: `PASS` (foreign-org customer rejection verified)
5. Member-Org and Note-Link Guards: `PASS` (note link guardrail assertion verified)
6. Regression Cases: `PARTIAL` (app/unit coverage strong; concurrent multi-session SQL race scenarios still unexercised)

## CTO Handoff

- Recommended issue status for PEAA-11 after this heartbeat: `in_progress` with concerns logged.
- Unblock owner/action:
  1. App/config owner: provide working AuthKit env bootstrap in the QA runtime (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`).
  2. Data/infra owner: `DONE` for this matrix run (`DATABASE_URL` provided and evidence attached).
- Next QA action after unblock:
  1. Execute authenticated cookie-backed browser matrix for customer/person CRUD with screenshots per route and per failure mode.
