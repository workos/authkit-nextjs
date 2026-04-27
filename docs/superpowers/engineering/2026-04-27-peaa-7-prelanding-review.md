# PEAA-7 Pre-Landing Structural Review (Staff Engineer)

Date: 2026-04-27
Issue: PEAA-7 Implement WorkOS/AuthKit foundation auth + org context bootstrap
Reviewer mode: Paranoid structural audit

## Scope observed on checkout

- Current branch: `main`
- Diff against `main...HEAD`: none
- Latest local commit (`d7f0cee`) is docs-only and does not implement PEAA-7 auth/org bootstrap paths.

Decision: **Not approved for release handoff**.

Reason: There is no implementation diff for PEAA-7 available to structurally audit, so safety cannot be established.

## Structural findings from available SQL artifacts (untracked work-product)

Although not part of a committed PEAA-7 diff, the SQL artifacts in `docs/superpowers/engineering/sql` expose production invariants that must be fixed before these patterns are copied into implementation:

1. **Cross-org referential integrity is not enforced at DB level (high risk)**
- Tables include `organization_id`, but foreign keys use only surrogate IDs (`customer_id`, `member_id`, etc.).
- A row can reference a parent from another org if application logic misses an org predicate.
- This is a trust-boundary failure: tenant isolation relies solely on app code.

Required fix:
- Add composite uniqueness on parent tables and composite foreign keys that include `organization_id`, for example:
  - `customers (organization_id, id)` unique, then child FK `(organization_id, customer_id) -> customers(organization_id, id)`
  - Repeat for member/task/meeting/list relationships.

2. **Polymorphic note links have no DB invariant (medium risk)**
- `notes.linked_object_type + linked_object_id` is documented as service-validated only.
- This allows orphaned or cross-org pointers if validation is bypassed or regresses.

Required fix:
- Introduce safer shape for V1 (preferred): separate nullable FK columns per object type plus check constraints.
- If polymorphic shape is retained, enforce with trigger that validates target existence and same-org ownership.

## Release gate status

- `PEAA-7` remains blocked pending an actual implementation diff and structural re-review.
- No handoff to Release Engineer.

## Next action for implementer

1. Push/attach the PEAA-7 branch containing WorkOS/AuthKit bootstrap code (middleware, callback handling, org resolution boundary, and repository org predicates).
2. Include tests for tenant isolation failure modes, not only happy-path auth success.
3. Request re-review once diff is available.
