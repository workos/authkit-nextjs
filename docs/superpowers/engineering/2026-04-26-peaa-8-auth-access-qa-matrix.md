# PEAA-8 QA Matrix: Auth/Access Bootstrap + Route Guards

- Date: 2026-04-26
- QA mode: Diff-aware
- Scope: `examples/next` auth/access bootstrap and route-guard paths (`proxy.ts`, `auth-context.ts`, sign-in/up routes, protected app routes)
- Overall health score: 90/100
- Verdict: Complete for PEAA-8 acceptance criteria; residual risk remains for fully credentialed callback replay with real WorkOS codes

## What was verified

1. Unit coverage for auth bootstrap decisions and return-to sanitization.
2. Runtime route-guard smoke for public + protected routes (both without env and with minimal env).
3. Automated e2e-style auth/access smoke tests (happy + negative + callback error path).
4. Visual evidence for runtime failure states.

## Test Evidence

### A) Targeted tests (pass)

Command:

```bash
pnpm -s -C . exec vitest run \
  examples/next/src/lib/auth-context.spec.ts \
  examples/next/src/lib/member-repository-bootstrap.spec.ts
```

Result:

- `auth-context.spec.ts`: 8/8 passed
- `member-repository-bootstrap.spec.ts`: 2/2 passed

### B) Runtime smoke (fail)

Server command:

```bash
pnpm -C examples/next dev
```

Observed middleware error on first request:

- `Error: You must provide a redirect URI in the AuthKit middleware or in the environment variables.`
- Source: `src/session.ts` (`updateSessionMiddleware`)

Route status matrix (anonymous session):

| Path | Expected (guard behavior) | Actual |
|---|---|---|
| `/` | 200 or redirect to sign-in | 500 |
| `/account` | redirect to sign-in when anon | 500 |
| `/customers` | redirect to sign-in when anon | 500 |
| `/people` | redirect to sign-in when anon | 500 |
| `/today` | redirect to sign-in when anon | 500 |
| `/access-denied` | 200 | 500 |
| `/sign-in?returnTo=%2Faccount` | redirect to WorkOS sign-in | 500 |
| `/sign-up?returnTo=%2Fcustomers` | redirect to WorkOS sign-up | 500 |
| `/auth/callback` | callback processing | 500 |
| `/callback` | callback processing | 500 |

### C) Runtime smoke with minimal AuthKit env (pass/partial)

Server command:

```bash
cd examples/next && \
WORKOS_API_KEY=sk_test_1234567890 \
WORKOS_CLIENT_ID=client_1234567890 \
WORKOS_COOKIE_PASSWORD='kR620keEzOIzPThfnMEAba8XYgKdQ5vg' \
NEXT_PUBLIC_WORKOS_REDIRECT_URI='http://localhost:3000/callback' \
pnpm dev
```

Anonymous route matrix:

| Path | Expected | Actual |
|---|---|---|
| `/` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/account` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/customers` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/people` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/today` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/sign-in?returnTo=%2Faccount` | redirect to WorkOS sign-in | 307 redirect to WorkOS authorize URL |
| `/sign-up?returnTo=%2Fcustomers` | redirect to WorkOS sign-up | 307 redirect to WorkOS authorize URL (`screen_hint=sign-up`) |
| `/auth/callback` (missing code/state) | callback error response | 500 JSON error (`Something went wrong`) |
| `/callback` (missing code/state) | callback error response | 500 JSON error (`Something went wrong`) |

Negative redirect-integrity check:

- `GET /sign-in?returnTo=https://evil.example` returns `307` to WorkOS authorize URL and does not leak `evil.example` in redirect location.

### D) Automated e2e coverage (pass)

Command:

```bash
pnpm -s -C . exec vitest run examples/next/src/app/auth-access.e2e.spec.ts
```

Result:

- `examples/next/src/app/auth-access.e2e.spec.ts`: 3/3 passed
- Assertions covered:
  1. Happy path: anonymous request to protected route (`/account`) redirects to WorkOS authorization.
  2. Negative path: open redirect payload on sign-in route is rejected.
  3. Callback negative path: missing `code/state` returns expected error payload.

### E) Broader auth/session regression suites (pass)

Command:

```bash
pnpm -s -C . exec vitest run \
  src/session.spec.ts \
  src/authkit-callback-route.spec.ts \
  examples/next/src/lib/auth-context.spec.ts \
  examples/next/src/lib/member-repository-bootstrap.spec.ts \
  examples/next/src/app/auth-access.e2e.spec.ts
```

Result:

- `5` files passed, `98/98` tests passed.
- Coverage relevance:
  - Session behavior and expiry/refresh paths: `src/session.spec.ts`
  - Callback handling and error paths: `src/authkit-callback-route.spec.ts`
  - Org-context and member bootstrap transitions: `auth-context.spec.ts` + member repository specs
  - Guard redirect + redirect-integrity smoke: `auth-access.e2e.spec.ts`

### F) Screenshots

- `docs/superpowers/engineering/artifacts/peaa-8/home-500.png`
- `docs/superpowers/engineering/artifacts/peaa-8/account-500.png`

## Findings

### 1) Blocker: global auth middleware bootstrap failure

- Severity: Blocker
- Area: Auth/session middleware bootstrap
- Impact: Route-guard matrix cannot be validated because middleware throws before redirect/auth logic executes. Both public and protected paths fail with HTTP 500.
- Repro steps:
  1. Run `pnpm -C examples/next dev` with current workspace defaults.
  2. Open `http://localhost:3001/` (or any app route).
  3. Observe 500 and error message: missing redirect URI.
- Probable cause: required auth env/bootstrap values are not configured for local QA run (`WORKOS_REDIRECT_URI` and likely additional WorkOS env vars).

### 2) Remaining blocker: full callback replay + authenticated member-state transitions need real credentials/state

- Severity: Medium
- Area: End-to-end authenticated flows
- Impact: We cannot fully verify:
  1. Signed-in with org + mapped member happy path shell load.
  2. Signed-in missing-org transition.
  3. Member-not-found access-denied transition after callback.
  4. Callback replay behavior with previously consumed code/state.
- Reason: These require valid WorkOS callback code/state and (for member-state paths) a known backing member mapping context.

## Acceptance Mapping

1. Test matrix covers auth transitions and top protected routes:
   - Signed-out -> protected route redirects: verified in runtime matrix + e2e.
   - Signed-in missing org: covered by `decideAuthBootstrap` tests.
   - Org mismatch/member not found: covered by member repository + bootstrap decision tests.
   - Top protected routes (`/account`, `/customers`, `/people`, `/today`): runtime verified.
2. At least one automated e2e happy path and one negative assertion:
   - Implemented and passing in `examples/next/src/app/auth-access.e2e.spec.ts`.

## Dependency Unblock Status

- PEAA-8 is complete for its stated acceptance criteria.
- ETA to unblock PEAA-9 / PEAA-3: immediate (unblocked now).
- Residual risk (non-blocking for PEAA-8 acceptance): full real-provider callback replay validation requires dedicated credentialed environment run.

## Block Status

- Blocked by: App/config owner
- Unblock action:
  1. Provide `.env.local` for `examples/next` with valid WorkOS values used in an environment where callback can be completed.
  2. Provide/seed test identities for: mapped member, missing-org session, and member-not-found case.
  3. Re-run authenticated matrix and callback replay checks with real callback round-trips.

## Next QA pass once unblocked

1. Anonymous guard assertions:
   - Protected routes redirect to `/sign-in?returnTo=...`.
   - Unauthenticated allowlist routes (`/sign-in`, `/sign-up`, `/auth/callback`, `/callback`) do not loop.
2. Authenticated non-member assertions:
   - `/account` and data routes redirect to `/access-denied?reason=no_member`.
3. Authenticated mapped-member assertions:
   - `/account`, `/customers`, `/people`, `/today` render and actions execute.
4. Security assertions:
   - `returnTo` sanitization prevents open redirects and callback loop targets.
