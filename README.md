# AuthKit Next.js Library

The AuthKit library for Next.js provides convenient helpers for authentication and session management using WorkOS & AuthKit with Next.js.

> Note: This library is intended for use with the Next.js App Router.

## Installation

Install the package with:

```
npm i @workos-inc/authkit-nextjs
```

or

```
yarn add @workos-inc/authkit-nextjs
```

## Video tutorial

<a href="https://youtu.be/W8TmptLkEvA?feature=shared" target="_blank">
  <img src="https://github.com/user-attachments/assets/08c77835-1140-412a-baa9-a587ab27fc5e" alt="YouTube tutorial: Next.js App Router Authentication with AuthKit" style="display: block; width: 100%; max-width: 720px; height: auto; aspect-ratio: 16/9; object-fit: cover; object-position: center; margin: 1em auto;" onerror="this.onerror=null; this.src='https://i3.ytimg.com/vi/W8TmptLkEvA/maxresdefault.jpg'" />
</a>

## Pre-flight

Make sure the following values are present in your `.env.local` environment variables file. The client ID and API key can be found in the [WorkOS dashboard](https://dashboard.workos.com), and the redirect URI can also be configured there.

```sh
WORKOS_CLIENT_ID="client_..." # retrieved from the WorkOS dashboard
WORKOS_API_KEY="sk_test_..." # retrieved from the WorkOS dashboard
WORKOS_COOKIE_PASSWORD="<your password>" # generate a secure password here
NEXT_PUBLIC_WORKOS_REDIRECT_URI="http://localhost:3000/callback" # configured in the WorkOS dashboard
```

`WORKOS_COOKIE_PASSWORD` is the private key used to encrypt the session cookie. It has to be at least 32 characters long. You can use the [1Password generator](https://1password.com/password-generator/) or the `openssl` library to generate a strong password via the command line:

```
openssl rand -base64 24
```

To use the `signOut` method, you'll need to set a default Logout URI in your WorkOS dashboard settings under "Redirects".

### Optional configuration

Certain environment variables are optional and can be used to debug or configure cookie settings.

| Environment Variable     | Default Value         | Description                                                                               |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| `WORKOS_COOKIE_MAX_AGE`  | `34560000` (400 days) | Maximum age of the cookie in seconds                                                      |
| `WORKOS_COOKIE_DOMAIN`   | None                  | Domain for the cookie. When empty, the cookie is only valid for the current domain        |
| `WORKOS_COOKIE_NAME`     | `'wos-session'`       | Name of the session cookie                                                                |
| `WORKOS_API_HOSTNAME`    | `'api.workos.com'`    | Base WorkOS API URL                                                                       |
| `WORKOS_API_HTTPS`       | `true`                | Whether to use HTTPS in API calls                                                         |
| `WORKOS_API_PORT`        | None                  | Port to use for API calls. When not set, uses standard ports (443 for HTTPS, 80 for HTTP) |
| `WORKOS_COOKIE_SAMESITE` | `'lax'`               | SameSite attribute for cookies. Options: `'lax'`, `'strict'`, or `'none'`                 |

Example usage:

```sh
WORKOS_COOKIE_MAX_AGE='600'
WORKOS_COOKIE_DOMAIN='example.com'
WORKOS_COOKIE_NAME='my-auth-cookie'
```

> [!WARNING]
> Setting `WORKOS_COOKIE_SAMESITE='none'` allows cookies to be sent in cross-origin contexts (like iframes), but reduces protection against CSRF attacks. This setting forces cookies to be secure (HTTPS only) and should only be used when absolutely necessary for your application architecture.

> [!TIP] >`WORKOS_COOKIE_DOMAIN` can be used to share WorkOS sessions between apps/domains. Note: The `WORKOS_COOKIE_PASSWORD` would need to be the same across apps/domains. Not needed for most use cases.

## Setup

### Callback route

WorkOS requires that you have a callback URL to redirect users back to after they've authenticated. In your Next.js app, [expose an API route](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) and add the following.

```ts
import { handleAuth } from '@workos-inc/authkit-nextjs';

export const GET = handleAuth();
```

Make sure this route matches the `WORKOS_REDIRECT_URI` variable and the configured redirect URI in your WorkOS dashboard. For instance if your redirect URI is `http://localhost:3000/auth/callback` then you'd put the above code in `/app/auth/callback/route.ts`.

You can also control the pathname the user will be sent to after signing-in by passing a `returnPathname` option to `handleAuth` like so:

```ts
export const GET = handleAuth({ returnPathname: '/dashboard' });
```

If your application needs to persist data upon a successful authentication, like the `oauthTokens` from an upstream provider, you can pass in a `onSuccess` function that will get called after the user has successfully authenticated:

```ts
export const GET = handleAuth({
  onSuccess: async ({ user, oauthTokens, authenticationMethod, organizationId, state }) => {
    await saveTokens(oauthTokens);
    if (authenticationMethod) {
      await saveAuthMethod(user.id, authenticationMethod);
    }
    // Access custom state data passed through the auth flow
    const customData = state ? JSON.parse(state) : null;
    if (customData?.teamId) {
      await addUserToTeam(user.id, customData.teamId);
    }
  },
});
```

When running in environments like Docker, set the `baseURL` explicitly to ensure the redirects point to the correct location.

```ts
export const GET = handleAuth({
  baseURL: 'http://localhost:3000',
});
```

`handleAuth` can be used with the following options.

| Option           | Default     | Description                                                                                                                                                                                                 |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `returnPathname` | `/`         | The pathname to redirect the user to after signing in                                                                                                                                                       |
| `baseURL`        | `undefined` | The base URL to use for the redirect URI instead of the one in the request. **Required** if the app is being run in a container like docker where the hostname can be different from the one in the request |
| `onSuccess`      | `undefined` | A function that receives successful authentication data and can be used for side-effects like persisting tokens                                                                                             |
| `onError`        | `undefined` | A function that can receive the error and the request and handle the error in its own way.                                                                                                                  |

#### onSuccess callback data

The `onSuccess` callback receives the following data:

| Property               | Type                        | Description                                                                                        |
| ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `user`                 | `User`                      | The authenticated user object                                                                      |
| `accessToken`          | `string`                    | JWT access token                                                                                   |
| `refreshToken`         | `string`                    | Refresh token for session renewal                                                                  |
| `impersonator`         | `Impersonator \| undefined` | Present if user is being impersonated                                                              |
| `oauthTokens`          | `OauthTokens \| undefined`  | OAuth tokens from upstream provider                                                                |
| `authenticationMethod` | `string \| undefined`       | How the user authenticated (e.g., 'password', 'google-oauth'). Only available during initial login |
| `organizationId`       | `string \| undefined`       | Organization context of authentication                                                             |
| `state`                | `string \| undefined`       | Custom state string passed through the authentication flow (parse with JSON.parse if needed)       |

**Note**: `authenticationMethod` is only provided during the initial authentication callback. It will not be available in subsequent requests or session refreshes.

### Middleware / Proxy

This library relies on Next.js middleware to provide session management for routes.

**For Next.js ≤15:** Create a `middleware.ts` file in the root of your project.
**For Next.js 16+:** Create a `proxy.ts` file in the root of your project.

The code remains the same; only the filename changes:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware();

// Match against pages that require auth
// Leave this out if you want auth on every resource (including images, css etc.)
export const config = { matcher: ['/', '/admin'] };
```

The middleware can be configured with several options.

| Option           | Default     | Description                                                                                                             |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `redirectUri`    | `undefined` | Used in cases where you need your redirect URI to be set dynamically (e.g. Vercel preview deployments)                  |
| `middlewareAuth` | `undefined` | Used to configure middleware auth options. See [middleware auth](#middleware-auth) for more details.                    |
| `debug`          | `false`     | Enables debug logs.                                                                                                     |
| `signUpPaths`    | `[]`        | Used to specify paths that should use the 'sign-up' screen hint when redirecting to AuthKit.                            |
| `eagerAuth`      | `false`     | Enables synchronous access token availability for third-party services. See [eager auth](#eager-auth) for more details. |

#### Custom redirect URI

In cases where you need your redirect URI to be set dynamically (e.g. Vercel preview deployments), use the `redirectUri` option in `authkitMiddleware`:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({
  redirectUri: 'https://foo.example.com/callback',
});

// Match against pages that require auth
// Leave this out if you want auth on every resource (including images, css etc.)
export const config = { matcher: ['/', '/admin'] };
```

Custom redirect URIs will be used over a redirect URI configured in the environment variables.

## Usage

### Wrap your app in `AuthKitProvider`

Use `AuthKitProvider` to wrap your app layout, which provides client side auth methods adds protections for auth edge cases.

```jsx
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
```

### Get the current user in a server component

For pages where you want to display a signed-in and signed-out view, use `withAuth` to retrieve the user session from WorkOS.

```jsx
import Link from 'next/link';
import { getSignInUrl, getSignUpUrl, withAuth, signOut } from '@workos-inc/authkit-nextjs';

export default async function HomePage() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user } = await withAuth();

  if (!user) {
    // Get the URL to redirect the user to AuthKit to sign in
    const signInUrl = await getSignInUrl();

    // Get the URL to redirect the user to AuthKit to sign up
    const signUpUrl = await getSignUpUrl();

    // You can also pass custom state data through the auth flow
    const signInUrlWithState = await getSignInUrl({
      state: JSON.stringify({
        teamId: 'team_123',
        referrer: 'homepage',
      }),
    });

    return (
      <>
        <Link href={signInUrl}>Log in</Link>
        <Link href={signUpUrl}>Sign Up</Link>
      </>
    );
  }

  return (
    <form
      action={async () => {
        'use server';
        await signOut();
      }}
    >
      <p>Welcome back {user?.firstName && `, ${user?.firstName}`}</p>
      <button type="submit">Sign out</button>
    </form>
  );
}
```

### Get the current user in a client component

For client components, use the `useAuth` hook to get the current user session.

```jsx
'use client';
// Note the updated import path
import { useAuth } from '@workos-inc/authkit-nextjs/components';

export default function MyComponent() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return <div>{user?.firstName}</div>;
}
```

### Get the enabled flags for the logged in user

For situations where you need access to the authenticated user's currently active feature flags, use `withAuth` to retrieve the flags from the WorkOS session.

```jsx
const { featureFlags } = await withAuth();
```

### Requiring auth

For pages where a signed-in user is mandatory, you can use the `ensureSignedIn` option:

```jsx
// Server component
const { user } = await withAuth({ ensureSignedIn: true });

// Client component
const { user, loading } = useAuth({ ensureSignedIn: true });
```

Enabling `ensureSignedIn` will redirect users to AuthKit if they attempt to access the page without being authenticated.

### Refreshing the session

Use the `refreshSession` method in a server action or route handler to fetch the latest session details, including any changes to the user's roles or permissions.

The `organizationId` parameter can be passed to `refreshSession` in order to switch the session to a different organization. If the current session is not authorized for the next organization, an appropriate [authentication error](https://workos.com/docs/reference/user-management/authentication-errors) will be returned.

In client components, you can refresh the session with the `refreshAuth` hook.

```tsx
'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import React, { useEffect } from 'react';

export function SwitchOrganizationButton() {
  const { user, organizationId, loading, refreshAuth } = useAuth();

  useEffect(() => {
    // This will log out the new organizationId after refreshing the session
    console.log('organizationId', organizationId);
  }, [organizationId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  const handleRefreshSession = async () => {
    const result = await refreshAuth({
      // Provide the organizationId to switch to
      organizationId: 'org_123',
    });
    if (result?.error) {
      console.log('Error refreshing session:', result.error);
    }
  };

  if (user) {
    return <button onClick={handleRefreshSession}>Refresh session</button>;
  } else {
    return <div>Not signed in</div>;
  }
}
```

### Access Token Management

#### useAccessToken Hook

This library provides a `useAccessToken` hook for client-side access token management with automatic refresh functionality.

##### Features

- Automatic token refresh before expiration
- Manual refresh capability
- Loading and error states
- Synchronized with the main authentication session
- Race condition prevention

##### When to Use

Use this hook when you need direct access to the JWT token for:

- Making authenticated API calls
- Setting up external auth-dependent libraries
- Implementing custom authentication logic

##### Basic Usage

```jsx
function ApiClient() {
  const { accessToken, loading, error, refresh } = useAccessToken();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!accessToken) return <div>Not authenticated</div>;

  return (
    <div>
      <p>Token available: {accessToken.substring(0, 10)}...</p>
      <button onClick={refresh}>Refresh token</button>
    </div>
  );
}
```

##### API Reference

| Property      | Type                                 | Description                                   |
| ------------- | ------------------------------------ | --------------------------------------------- |
| `accessToken` | `string \| undefined`                | The current access token                      |
| `loading`     | `boolean`                            | True when token is being fetched or refreshed |
| `error`       | `Error \| null`                      | Error during token fetch/refresh, or null     |
| `refresh`     | `() => Promise<string \| undefined>` | Manually refresh the token                    |

##### Integration with useAuth

The `useAccessToken` hook automatically synchronizes with the main authentication session. When you call `refreshAuth()` from `useAuth`, the access token will update accordingly. Similarly, using the `refresh()` method from `useAccessToken` will update the entire authentication session.

##### Security Considerations

JWT tokens are sensitive credentials and should be handled carefully:

- Only use the token where necessary
- Don't store tokens in localStorage or sessionStorage
- Be cautious about exposing tokens in your application state

### Passing Custom State Through Authentication

You can pass custom state data through the authentication flow using the `state` parameter. The state parameter is a string value that gets passed through OAuth and returned in the callback. To pass complex data, serialize it as JSON:

```ts
// When generating sign-in/sign-up URLs, serialize your data as JSON
const signInUrl = await getSignInUrl({
  state: JSON.stringify({
    teamId: 'team_123',
    feature: 'billing',
    referrer: 'pricing-page',
    timestamp: Date.now(),
  }),
});

// The state data is available in the callback handler
export const GET = handleAuth({
  onSuccess: async ({ user, state }) => {
    // Parse the state string back to an object
    const customData = state ? JSON.parse(state) : null;

    // Access your custom state data
    if (customData?.teamId) {
      await addUserToTeam(user.id, customData.teamId);
    }

    if (customData?.feature) {
      await trackFeatureActivation(user.id, customData.feature);
    }

    // Track where the user came from
    await analytics.track('sign_in_completed', {
      userId: user.id,
      referrer: customData?.referrer,
      timestamp: customData?.timestamp,
    });
  },
});
```

> **Note**: The `state` parameter is an opaque string as defined by OAuth 2.0 (RFC 6749). If you need to pass structured data, you must serialize it yourself using `JSON.stringify()` and parse it with `JSON.parse()` in the callback.

This is useful for:

- Tracking user journey and referral sources
- Maintaining context about what the user was trying to do before authentication
- Implementing custom onboarding flows
- Analytics and attribution tracking

### Session Refresh Callbacks

When using the `authkit` function directly, you can provide callbacks to be notified when a session is refreshed:

```typescript
const { session, headers } = await authkit(request, {
  onSessionRefreshSuccess: async ({ accessToken, user, impersonator }) => {
    // Log successful refresh
    console.log(`Session refreshed for ${user.email}.`);
  },
  onSessionRefreshError: async ({ error, request }) => {
    // Log refresh failure
    console.error('Session refresh failed:', error);
    // Notify monitoring system
    await notifyMonitoring('session_refresh_failed', {
      url: request.url,
      error: error.message,
    });
  },
});
```

These callbacks provide a way to perform side effects when sessions are refreshed in the middleware. Common use cases include:

- Logging authentication events
- Updating last activity timestamps
- Triggering organization-specific data prefetching
- Recording failed refresh attempts

### Middleware auth

The default behavior of this library is to request authentication via the `withAuth` method on a per-page basis. There are some use cases where you don't want to call `withAuth` (e.g. you don't need user data for your page) or if you'd prefer a "secure by default" approach where every route defined in your middleware matcher is protected unless specified otherwise. In those cases you can opt-in to use middleware auth instead:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/about'],
  },
});

// Match against pages that require auth
// Leave this out if you want auth on every resource (including images, css etc.)
export const config = { matcher: ['/', '/admin/:path*', '/about'] };
```

In the above example the `/admin` page will require a user to be signed in, whereas `/` and `/about` can be accessed without signing in.

`unauthenticatedPaths` uses the same glob logic as the [Next.js matcher](https://nextjs.org/docs/pages/building-your-application/routing/middleware#matcher).

### Eager auth

The `eagerAuth` option enables synchronous access to authentication tokens on initial page load, which is required by some third-party services that validate tokens directly with WorkOS. When enabled, tokens are available immediately without requiring an asynchronous fetch.

#### How it works

When `eagerAuth: true` is set, the middleware temporarily stores the access token in a short-lived cookie (30 seconds) that is:

- Only set on initial page loads (not API or prefetch requests)
- Immediately consumed and deleted by the client
- Available synchronously on the first render

#### Usage

Enable eager auth in your middleware configuration:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({
  eagerAuth: true,
});
```

Then access the token synchronously in your client components:

```tsx
'use client';

import { useAccessToken } from '@workos-inc/authkit-nextjs/components';

function MyComponent() {
  const { getAccessToken } = useAccessToken();

  // Token is available immediately on initial page load
  const token = getAccessToken();

  // Use with third-party services that need immediate token access
  if (token) {
    // Initialize your third-party client with the token
    thirdPartyClient.authenticate(token);
  }

  return <div>...</div>;
}
```

#### Security considerations

Eager auth makes tokens briefly accessible via JavaScript (30-second window) to enable synchronous access. This is a common pattern used by many authentication libraries and is generally safe with standard XSS protections.

**Best practices:**

- Implement a Content Security Policy (CSP) if handling sensitive data
- Review third-party scripts on authenticated pages
- Use the standard `getAccessToken()` method when synchronous access isn't required

**When to use:**

- Third-party services that require synchronous token access
- Real-time features that need immediate authentication
- When you want to avoid loading states on initial render

**When to use standard async tokens:**

- Most API calls where a brief loading state is acceptable
- When you don't need immediate token access on page load

### Composing middleware

> **Security note:** Always forward `request.headers` when returning `NextResponse.*` to mitigate SSRF issues in Next.js < 14.2.32 (14.x) or < 15.4.7 (15.x). This pattern is safe on all versions. We strongly recommend upgrading to the latest Next.js.

If you don't want to use `authkitMiddleware` and instead want to compose your own middleware, you can use the `authkit` method. In this mode you are responsible to handling what to do when there's no session on a protected route.

> **Note:** For Next.js 16+, name your file `proxy.ts` and the function `proxy` instead of `middleware`.

```ts
export default async function middleware(request: NextRequest) {
  // Perform logic before or after AuthKit

  // Auth object contains the session, response headers and an authorization URL in the case that the session isn't valid
  // This method will automatically handle setting the cookie and refreshing the session
  const {
    session,
    headers: authkitHeaders,
    authorizationUrl,
  } = await authkit(request, {
    debug: true,
  });

  const { pathname } = new URL(request.url);

  // Control of what to do when there's no session on a protected route is left to the developer
  if (pathname.startsWith('/account') && !session.user) {
    console.log('No session on protected path');
    return NextResponse.redirect(authorizationUrl);
  }

  // Forward the incoming request headers (mitigation) and pass AuthKit headers as request headers
  const response = NextResponse.next({
    request: { headers: authkitHeaders },
  });

  // Copy Set-Cookie and cache control headers to the response, but exclude the internal
  // x-workos-session header which contains encrypted session data and should never appear
  // in HTTP responses (it's only used to pass session data between middleware and page handlers)
  for (const [key, value] of authkitHeaders) {
    if (key.toLowerCase() === 'x-workos-session') {
      continue; // Internal header - must not leak to response
    }
    if (key.toLowerCase() === 'set-cookie') {
      response.headers.append(key, value);
    } else {
      response.headers.set(key, value);
    }
  }

  return response;
}

// Match against the pages
export const config = { matcher: ['/', '/account/:path*'] };
```

### Signing out

Use the `signOut` method to sign out the current logged in user and redirect to your app's default Logout URI. The Logout URI is set in your WorkOS dashboard settings under "Redirect".

To use a non-default Logout URI, you can use the `returnTo` parameter.

```tsx
await signOut({ returnTo: 'https://your-app.com/signed-out' });
```

### Visualizing an impersonation

Render the `Impersonation` component in your app so that it is clear when someone is [impersonating a user](https://workos.com/docs/user-management/impersonation).
The component will display a frame with some information about the impersonated user, as well as a button to stop impersonating.

```jsx
import { Impersonation, AuthKitProvider } from '@workos-inc/authkit-nextjs/components';

export default function App() {
  return (
    <div>
      <AuthKitProvider>
        <Impersonation />
        {/* Your app content */}
      </AuthKitProvider>
    </div>
  );
}
```

### Get the access token

Sometimes it is useful to obtain the access token directly, for instance to make API requests to another service.

```jsx
import { withAuth } from '@workos-inc/authkit-nextjs';

export default async function HomePage() {
  const { accessToken } = await withAuth();

  if (!accessToken) {
    return <div>Not signed in</div>;
  }

  const serviceData = await fetch('/api/path', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return <div>{serviceData}</div>;
}
```

### Sign up paths

The `signUpPaths` option can be passed to `authkitMiddleware` to specify paths that should use the 'sign-up' screen hint when redirecting to AuthKit. This is useful for cases where you want a path that mandates authentication to be treated as a sign up page.

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({
  signUpPaths: ['/account/sign-up', '/dashboard/:path*'],
});
```

### Validate an API key

Use the `validateApiKey` function in your application's public API endpoints to parse a [Bearer Authentication](https://swagger.io/docs/specification/v3_0/authentication/bearer-authentication/) header and validate the [API key](https://workos.com/docs/authkit/api-keys) with WorkOS.

```ts
import { NextResponse } from 'next/server';
import { validateApiKey } from '@workos-inc/authkit-nextjs';

export async function GET() {
  const { apiKey } = await validateApiKey();

  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
```

### Advanced: Direct access to the WorkOS client

For advanced use cases or functionality not covered by the helper methods, you can access the underlying WorkOS client directly:

```typescript
import { getWorkOS } from '@workos-inc/authkit-nextjs';

// Get the configured WorkOS client instance
const workos = getWorkOS();

// Use any WorkOS SDK method
const organizations = await workos.organizations.listOrganizations({
  limit: 10,
});
```

### Advanced: Custom authentication flows

While the standard authentication flow handles session management automatically, some use cases require manually creating and storing a session. This is useful for custom authentication flows like email verification or token exchange.

For these scenarios, you can use the `saveSession` function:

```typescript
import { saveSession } from '@workos-inc/authkit-nextjs';
import { getWorkOS } from '@workos-inc/authkit-nextjs';

// Example: Email verification flow
async function handleEmailVerification(req) {
  const { code } = await req.json();

  // Authenticate with the WorkOS API directly
  const authResponse = await getWorkOS().userManagement.authenticateWithEmailVerification({
    clientId: process.env.WORKOS_CLIENT_ID,
    code,
  });

  // Save the session data to a cookie
  await saveSession(
    {
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
      user: authResponse.user,
      impersonator: authResponse.impersonator,
    },
    req,
  );

  return Response.redirect('/dashboard');
}
```

> [!NOTE]
> This is an advanced API intended for specific integration scenarios, such as those users using self-hosted AuthKit. If you're using hosted AuthKit you should not need this.

The `saveSession` function accepts either a `NextRequest` object or a URL string as its second parameter.

```typescript
// With NextRequest
await saveSession(session, req);

// With URL string
await saveSession(session, 'https://example.com/callback');
```

### CDN Deployments and Caching

AuthKit automatically implements cache security measures to protect against session leakage in CDN environments. This is particularly important when deploying to AWS with SST/OpenNext, Cloudflare, or other CDN configurations.

#### How It Works

The library automatically sets appropriate cache headers on all authenticated requests:

- `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0` - Aggressive cache prevention with multiple directives
- `Pragma: no-cache` - HTTP/1.0 compatibility
- `Expires: 0` - HTTP/1.0 cache expiration
- `Vary: Cookie` - Ensures CDNs differentiate between different users (defense-in-depth)
- `x-middleware-cache: no-cache` - Prevents Next.js middleware result caching

These headers are applied automatically when:

- A session cookie is present in the request
- An Authorization header is detected
- An active authenticated session exists

#### Performance Considerations

**Authenticated pages:** Will not be cached at the CDN level and will always hit your origin server. This is the correct and secure behavior for session-based authentication.

**Public pages:** Unaffected by these security measures. Public routes without authentication context can still be cached normally.

### Debugging

To enable debug logs, initialize the middleware with the debug flag enabled.

```js
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({ debug: true });
```

### Troubleshooting

#### NEXT_REDIRECT error when using try/catch blocks

Wrapping a `withAuth({ ensureSignedIn: true })` call in a try/catch block will cause a `NEXT_REDIRECT` error. This is because `withAuth` will attempt to redirect the user to AuthKit if no session is detected and redirects in Next must be [called outside a try/catch](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#redirecting).

#### Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins (Unhandled scheme)

You may encounter this error if you attempt to import server side code from authkit-nextjs into a client component. Likely you are using `withAuth` in a client component instead of the `useAuth` hook. Either move the code to a server component or use the `useAuth` hook.
