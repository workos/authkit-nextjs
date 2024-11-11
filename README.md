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

<a href="https://youtu.be/gMkHOotg0xc?feature=shared" target="_blank">
  <img src="https://github.com/user-attachments/assets/ed67129b-3b27-4745-8960-64db4c8ab393" alt="YouTube tutorial: Next.js App Router Authentication with AuthKit" style="display: block; width: 100%; max-width: 720px; height: auto; aspect-ratio: 16/9; object-fit: cover; object-position: center; margin: 1em auto;" onerror="this.onerror=null; this.src='https://img.youtube.com/vi/gMkHOotg0xc/0.jpg'" />
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

To use the `signOut` method, you'll need to set your app's homepage in your WorkOS dashboard settings under "Redirects".

### Optional configuration

Certain environment variables are optional and can be used to debug or configure cookie settings.

```sh
WORKOS_COOKIE_MAX_AGE='600' # maximum age of the cookie in seconds. Defaults to 400 days, the maximum allowed in Chrome
WORKOS_COOKIE_DOMAIN='example.com'
WORKOS_COOKIE_NAME='authkit-cookie'
WORKOS_API_HOSTNAME='api.workos.com' # base WorkOS API URL
WORKOS_API_HTTPS=true # whether to use HTTPS in API calls
WORKOS_API_PORT=3000 # port to use for API calls
```

`WORKOS_COOKIE_DOMAIN` can be used to share WorkOS sessions between apps/domains.
Note: The `WORKOS_COOKIE_PASSWORD` would need to be the same across apps/domains.
Not needed for most use cases.

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

`handleAuth` can be used with several options.

| Option           | Default     | Description                                                                                                                                                                                           |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `returnPathname` | `/`         | The pathname to redirect the user to after signing in                                                                                                                                                 |
| `baseURL`        | `undefined` | The base URL to use for the redirect URI instead of the one in the request. Useful if the app is being run in a container like docker where the hostname can be different from the one in the request |

### Middleware

This library relies on [Next.js middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware) to provide session management for routes. Put the following in your `middleware.ts` file in the root of your project:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware();

// Match against pages that require auth
// Leave this out if you want auth on every resource (including images, css etc.)
export const config = { matcher: ['/', '/admin'] };
```

The middleware can be configured with several options.

| Option           | Default     | Description                                                                                            |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `redirectUri`    | `undefined` | Used in cases where you need your redirect URI to be set dynamically (e.g. Vercel preview deployments) |
| `middlewareAuth` | `undefined` | Used to configure middleware auth options. See [middleware auth](#middleware-auth) for more details.   |
| `debug`          | `false`     | Enables debug logs.                                                                                    |

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

Use `AuthKitProvider` to wrap your app layout, which adds some protections for auth edge cases.

```jsx
import { AuthKitProvider } from '@workos-inc/authkit-nextjs';

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

### Get the current user

For pages where you want to display a signed-in and signed-out view, use `withAuth` to retrieve the user profile from WorkOS.

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

### Requiring auth

For pages where a signed-in user is mandatory, you can use the `ensureSignedIn` option:

```jsx
const { user } = await withAuth({ ensureSignedIn: true });
```

Enabling `ensureSignedIn` will redirect users to AuthKit if they attempt to access the page without being authenticated.

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

### Retrieve session in middleware

Sometimes it's useful to check the user session if you want to compose custom middleware. The `getSession` helper method will retrieve the session from the cookie and verify the access token.

```ts
import { authkitMiddleware, getSession } from '@workos-inc/authkit-nextjs';
import { NextRequest, NextFetchEvent } from 'next/server';

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // authkitMiddleware will handle refreshing the session if the access token has expired
  const response = await authkitMiddleware()(request, event);

  // If session is undefined, the user is not authenticated
  const session = await getSession(response);

  // ...add additional middleware logic here

  return response;
}

// Match against pages that require auth
export const config = { matcher: ['/', '/account/:path*'] };
```

### Signing out

Use the `signOut` method to sign out the current logged in user and redirect to your app's homepage. The homepage redirect is set in your WorkOS dashboard settings under "Redirect".

### Visualizing an impersonation

Render the `Impersonation` component in your app so that it is clear when someone is [impersonating a user](https://workos.com/docs/user-management/impersonation).
The component will display a frame with some information about the impersonated user, as well as a button to stop impersonating.

```jsx
import { Impersonation } from '@workos-inc/authkit-nextjs';

export default function App() {
  return (
    <div>
      <Impersonation />
      {/* Your app content */}
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

### Refreshing the session

Use the `refreshSession` method in a server action or route handler to fetch the latest session details, including any changes to the user's roles or permissions.

The `organizationId` parameter can be passed to `refreshSession` in order to switch the session to a different organization. If the current session is not authorized for the next organization, an appropriate [authentication error](https://workos.com/docs/reference/user-management/authentication-errors) will be returned.

### Troubleshooting

#### NEXT_REDIRECT error when using try/catch blocks

Wrapping a `withAuth({ ensureSignedIn: true })` call in a try/catch block will cause a `NEXT_REDIRECT` error. This is because `withAuth` will attempt to redirect the user to AuthKit if no session is detected and redirects in Next must be [called outside a try/catch](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#redirecting).
