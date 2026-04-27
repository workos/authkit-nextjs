# PEAA-9 Release Readiness for Auth Foundations

Date: 2026-04-27 (PT)
Issue: `PEAA-9`
Depends on: `PEAA-7`, `PEAA-8`

## Decision

- Status: `GO`
- Residual risk: full credentialed callback replay still needs environment-run validation with real WorkOS callback state.

## Environment Matrix

Required AuthKit variables (all environments: dev/staging/prod):

| Variable | Purpose | Required |
|---|---|---|
| `WORKOS_CLIENT_ID` | WorkOS app client identifier | Yes |
| `WORKOS_API_KEY` | WorkOS API credential | Yes |
| `WORKOS_COOKIE_PASSWORD` | Session-cookie encryption secret (>=32 chars) | Yes |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Auth callback URI used by app and dashboard config | Yes |

Verification evidence:
- Source of truth and requirements: `README.md` pre-flight section.
- Runtime behavior matrix with and without env values documented in:
  - `docs/superpowers/engineering/2026-04-26-peaa-8-auth-access-qa-matrix.md`
- Route guard + callback smoke validation covered by:
  - `examples/next/src/app/auth-access.e2e.spec.ts`

## Secret Handling and Rotation Path

Secret handling rules:
- `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` must be provided through environment-secret managers, not committed in repo.
- Cookie secret length and strength requirement is documented in README (>=32 characters).

Rotation runbook (no code change required):
1. Create new `WORKOS_API_KEY` in WorkOS dashboard.
2. Generate new `WORKOS_COOKIE_PASSWORD`.
3. Update secret stores for each environment (staging then production).
4. Restart/redeploy services to pick up new values.
5. Verify anonymous protected-route redirect and callback path health (`/account`, `/auth/callback`).
6. Revoke old WorkOS API key after successful validation.

Risk note:
- Rotating `WORKOS_COOKIE_PASSWORD` invalidates existing sessions; schedule rotation in a maintenance window or communicate forced re-authentication.

## Callback URL and Redirect Checklist

Validated deployment checklist:
- App callback route exists at `examples/next/src/app/auth/callback/route.ts`.
- Middleware unauthenticated allowlist includes callback paths in `examples/next/src/proxy.ts`:
  - `/auth/callback`
  - `/callback`
- Redirect URI value in env must match the dashboard redirect URI exactly.
- Open redirect defense is covered by `auth-access.e2e.spec.ts` negative test (`returnTo=https://evil.example`).

## Rollback Procedure and Validation

Rollback options:
1. Fast operational mitigation: disable auth route guard gate in middleware auth config as emergency fallback.
2. Code rollback: revert release commit.

Dry-run validation performed:
- Command (clean isolated worktree):
  - `git revert --no-commit 4ee06a1`
- Result: `PASS` (exit code `0`), confirming revert path is executable on clean tip.

Why isolated worktree:
- Local workspace had unrelated in-flight edits; isolated worktree removed false conflicts and gave a valid rollback signal.

## Smallest Release Verification Checklist

Executed:
- `pnpm test` -> pass (`383 passed`, `1 skipped`)
- `pnpm --filter example typecheck` -> pass

Referenced additional evidence:
- `docs/superpowers/engineering/2026-04-27-peaa-5-sql-suite-verification.md`
- `docs/superpowers/engineering/2026-04-27-peaa-10-qa-handoff.md`

## Failures and Mitigations

Observed failure during earlier rollback check in dirty workspace:
- Reverse-apply check failed due unrelated local modifications and binary patch context drift.

Mitigation applied:
- Revalidated rollback in clean temporary worktree; revert dry-run passed.

## Final Go/No-Go Note

`GO` for release readiness of auth foundations.

Known risk (non-blocking):
- Full real-provider callback replay validation remains environment-bound and should be executed by QA in credentialed runtime before broad production traffic cutover.
