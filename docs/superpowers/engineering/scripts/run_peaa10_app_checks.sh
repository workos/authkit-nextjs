#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

pnpm vitest run examples/next/src/lib/customer-person-store.spec.ts examples/next/src/lib/customer-person-flows.spec.ts
pnpm exec tsc --noEmit -p examples/next/tsconfig.json
(
  cd examples/next
  NODE_ENV=production pnpm build
)

echo "PEAA-10 app checks completed successfully"
