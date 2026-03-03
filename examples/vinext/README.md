# AuthKit + vinext Example

This example demonstrates how to use [`@workos-inc/authkit-nextjs`](https://github.com/workos/authkit-nextjs) with [vinext](https://github.com/cloudflare/vinext) — a Vite-based reimplementation of the Next.js API surface targeting Cloudflare Workers.

## Features

- Sign in / sign out via WorkOS AuthKit
- Middleware-based route protection
- Server component auth via `withAuth()`
- Client-side auth via `useAuth()` hook
- PKCE support for OAuth 2.1

## Prerequisites

- A [WorkOS](https://workos.com) account with AuthKit configured
- Node.js 18+
- pnpm

## Setup

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Copy the environment file and fill in your WorkOS credentials:

   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:

   | Variable | Description |
   |----------|-------------|
   | `WORKOS_CLIENT_ID` | Your WorkOS Client ID |
   | `WORKOS_API_KEY` | Your WorkOS API Key (secret) |
   | `WORKOS_COOKIE_PASSWORD` | A random string of at least 32 characters for session encryption |
   | `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | OAuth callback URL (default: `http://localhost:3000/callback`) |

3. In your WorkOS Dashboard, add `http://localhost:3000/callback` as a redirect URI.

4. Start the dev server:

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## How It Works

This example mirrors the structure of the [`examples/next`](../next) Next.js app. The key difference is that it runs on vinext (Vite) instead of Next.js, while importing the same `@workos-inc/authkit-nextjs` library.

Vinext shims the Next.js API surface (`next/headers`, `next/server`, `next/navigation`, etc.), so the AuthKit library works without a separate integration package.

### File Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with AuthKitProvider
│   ├── page.tsx                # Home page (server component with withAuth)
│   ├── account/page.tsx        # Protected account page
│   ├── callback/route.ts       # OAuth callback handler
│   ├── login/route.ts          # Sign-in redirect
│   ├── actions/signOut.ts      # Server action for sign out
│   └── components/
│       ├── sign-in-button.tsx  # Client component with useAuth hook
│       └── footer.tsx          # Footer with WorkOS links
└── proxy.ts                    # Route protection via authkitMiddleware (Next.js 16 convention)
```

## Known Limitations

- **Experimental**: vinext is an experimental project. Some edge cases may behave differently than Next.js.
- **Radix UI requires `"use client"` layout**: vinext's RSC plugin doesn't handle barrel re-exports of `"use client"` modules the same way Next.js does. The layout is marked `"use client"` to work around this.
- **No `withAuth()` in server components**: vinext doesn't propagate `headers()` AsyncLocalStorage context into RSC rendering, so `withAuth()` can't be called from server components. This example uses client-side `useAuth()` instead. Route handlers and middleware work fine.
- **`switchToOrganization` revalidation**: The `revalidatePath`/`revalidateTag` calls used by `switchToOrganization()` may not function identically to Next.js ISR. The library wraps these in try-catch for graceful degradation.
- **Image optimization**: vinext does not support Next.js build-time image optimization.

## Deploy to Cloudflare Workers

### Prerequisites

- A [Cloudflare](https://cloudflare.com) account
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated (`wrangler login`)

### Set secrets

Set your WorkOS credentials as Workers secrets. Update the redirect URI to your Workers URL:

```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_API_KEY
wrangler secret put WORKOS_COOKIE_PASSWORD
wrangler secret put NEXT_PUBLIC_WORKOS_REDIRECT_URI
# Enter: https://authkit-vinext-example.<your-subdomain>.workers.dev/callback
```

Then add this same callback URL as a redirect URI in your [WorkOS Dashboard](https://dashboard.workos.com).

### Deploy

```bash
pnpm run deploy
```

`vinext deploy` auto-generates the Cloudflare-specific build configuration (including `@cloudflare/vite-plugin` and RSC entries) and deploys to Workers. The `wrangler.jsonc` in this directory provides the Worker name and `nodejs_compat` flag.

### Local development with wrangler

To test with the Workers runtime locally (instead of `vinext dev` which uses Node.js), create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
# Fill in your credentials
```

Then run:

```bash
wrangler dev
```

This runs your app in the local workerd runtime, matching production behavior more closely than `vinext dev`.
