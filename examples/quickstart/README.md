# AuthKit Next.js Quickstart

A minimal Next.js App Router application demonstrating how to authenticate users
with [AuthKit](https://workos.com/docs/authkit/nextjs) and the WorkOS Node SDK.

## Prerequisites

- Node.js >= 22.11
- A [WorkOS account](https://dashboard.workos.com/signup)

## Setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy the example environment file:

   ```bash
   cp .env.local.example .env.local
   ```

3. In the [WorkOS dashboard](https://dashboard.workos.com/environment/applications),
   select your application and open its Redirects tab. Configure:
   - Redirect URI: `http://localhost:3000/callback`
   - Initiate login URI: `http://localhost:3000/login`
   - Sign-out URI: `http://localhost:3000`

4. From the API keys tab, copy the _Client ID_ and _Secret Key_ into `.env.local` as
   `WORKOS_CLIENT_ID` and `WORKOS_API_KEY`.

5. Generate a cookie password (at least 32 characters) and set it as
   `WORKOS_COOKIE_PASSWORD`:

   ```bash
   openssl rand -base64 32
   ```

6. Confirm `.env.local` contains all four required variables:

   ```bash
   WORKOS_API_KEY=
   WORKOS_CLIENT_ID=
   WORKOS_COOKIE_PASSWORD=
   NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
   ```

## Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Learn more

For the full integration guide, see the
[AuthKit Next.js documentation](https://workos.com/docs/authkit/nextjs).
