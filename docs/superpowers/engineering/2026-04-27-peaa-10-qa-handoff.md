# PEAA-10 QA Handoff

## Scope Completed

App-layer wiring for customer/person surfaces in Next example app:
- Customer list + create + delete
- Customer detail + update
- Embedded people create/delete in customer detail
- Global people list + create + delete
- Org-scoped and role-scoped guards enforced through member context + store rules
- Owner assignment trust-boundary guard: customer owner writes are constrained to authenticated actor member id.

## Changed Files

- `examples/next/src/lib/customer-person-store.ts`
- `examples/next/src/lib/customer-person-store.spec.ts`
- `examples/next/src/lib/customer-person-flows.spec.ts`
- `examples/next/src/env.d.ts`
- `examples/next/src/app/customers/actions.ts`
- `examples/next/src/app/customers/page.tsx`
- `examples/next/src/app/customers/[customerId]/page.tsx`
- `examples/next/src/app/people/actions.ts`
- `examples/next/src/app/people/page.tsx`
- `examples/next/src/app/layout.tsx`
- `examples/next/src/app/page.tsx`
- `docs/superpowers/engineering/sql/0001_init_schema.sql`
- `docs/superpowers/engineering/sql/0005_customer_person_surface_functions.sql`
- `docs/superpowers/engineering/sql/verify_peaa10_customer_person.sql`
- `docs/superpowers/engineering/sql/run_peaa10_verification.sh`
- `docs/superpowers/engineering/2026-04-27-peaa-10-customer-person-qa-checklist.md`

## Test Evidence (Executed)

- Unified app-check runner:
  - `docs/superpowers/engineering/scripts/run_peaa10_app_checks.sh`
  - Result: passed (8/8 tests + typecheck + `NODE_ENV=production` build).
- `pnpm vitest run examples/next/src/lib/customer-person-store.spec.ts examples/next/src/lib/customer-person-flows.spec.ts`
  - Result: 2 files passed, 8 tests passed.
- `pnpm exec tsc --noEmit -p examples/next/tsconfig.json`
  - Result: passed.
- `cd examples/next && NODE_ENV=production pnpm build`
  - Result: passed; app routes include `/customers`, `/customers/[customerId]`, and `/people`.

## QA Execution Steps

1. Start app:
   - `NODE_ENV=production pnpm --dir examples/next dev`
2. Optional one-shot local proof:
   - `docs/superpowers/engineering/scripts/run_peaa10_app_checks.sh`
3. Sign in with demo member that maps to `org_demo` and non-viewer role.
4. Validate customer flows:
   - Create customer on `/customers`
   - Open `/customers/{id}` and update fields
   - Delete customer from `/customers`
5. Validate people flows:
   - Create person under `/customers/{id}`
   - Remove person under `/customers/{id}`
   - Create and delete person on `/people`
6. Negative role check:
   - Use `viewer` member mapping and confirm mutations fail.

## DB Verification (If Postgres Available)

Run:

- `DATABASE_URL=postgres://... docs/superpowers/engineering/sql/run_peaa10_verification.sh`

Expected:
- migration apply succeeds
- verification script prints pass banner and rolls back assertions transaction

## Unblock Status and ETA

- Dependency chain: `PEAA-10 -> PEAA-11 -> PEAA-12`.
- Current status: PEAA-10 implementation is complete at app and test layers; closure is pending DB harness execution evidence.
- Unblock owner for final gate: QA/Release (run SQL harness and attach transcript).
- Next ETA to unblock PEAA-11:
  - Target: within one QA cycle after DB access is available.
  - Estimate: same day turnaround once `DATABASE_URL` runtime is provided.
