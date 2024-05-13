# AuthKit Next.js Library

The AuthKit library for Next.js provides convenient helpers for authentication and session management using WorkOS & AuthKit with Next.js.

## Installation

Install the package with:

```
npm i @workos-inc/authkit-nextjs
```

or

```
yarn add @workos-inc/authkit-nextjs
```

## Pre-flight

Make sure the following values are present in your `.env.local` environment variables file. The client ID and API key can be found in the [WorkOS dashboard](https://dashboard.workos.com), and the redirect URI can also be configured there.

```sh
WORKOS_CLIENT_ID="client_..." # retrieved from the WorkOS dashboard
WORKOS_API_KEY="sk_test_..." # retrieved from the WorkOS dashboard
WORKOS_REDIRECT_URI="http://localhost:3000/callback" # configured in the WorkOS dashboard
WORKOS_COOKIE_PASSWORD="<your password>" # generate a secure password here
```

`WORKOS_COOKIE_PASSWORD` is the private key used to encrypt the session cookie. It has to be at least 32 characters long. You can use the [1Password generator](https://1password.com/password-generator/) or the `openssl` library to generate a strong password via the command line:

```
openssl rand -base64 24
```

To use the `signOut` method, you'll need to set your app's homepage in your WorkOS dashboard settings under "Redirects".

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

### Middleware

This library relies on [Next.js middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware) to provide session management for routes. Put the following in your `middleware.ts` file in the root of your project:

```ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware();

// Match against pages that require auth
// Leave this out if you want auth on every resource (including images, css etc.)
export const config = { matcher: ['/', '/admin'] };
```

## Usage

### Get the current user

For pages where you want to display a signed-in and signed-out view, use `getUser` to retrieve the user profile from WorkOS.

```jsx
import Link from 'next/link';
import { getSignInUrl, getSignUpUrl, getUser, signOut } from '@workos-inc/authkit-nextjs';

export default async function HomePage() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user } = await getUser();

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
const { user } = await getUser({ ensureSignedIn: true });
```

Enabling `ensureSignedIn` will redirect users to AuthKit if they attempt to access the page without being authenticated.

### Middleware auth

The default behavior of this library is to request authentication via the `getUser` method on a per-page basis. There are some use cases where you don't want to call `getUser` (e.g. you don't need user data for your page) or if you'd prefer a "secure by default" approach where every route defined in your middleware matcher is protected unless specified otherwise. In those cases you can opt-in to use middleware auth instead:

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

Sometimes it is useful to obtain the access token directly (e.g. to make API requests to another service).

```jsx
import { getAccessToken } from '@workos-inc/authkit-nextjs';

export default async function CoolComponent() {
  const accessToken = await getAccessToken();

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

### Debugging

To enable debug logs, initialize the middleware with the debug flag enabled.

```js
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware({ debug: true });
```

### Troubleshooting

#### NEXT_REDIRECT error when using try/catch blocks

Wrapping a `getUser({ ensureSignedIn: true })` call in a try/catch block will cause a `NEXT_REDIRECT` error. This is because `getUser` will attempt to redirect the user to AuthKit if no session is detected and redirects in Next must be [called outside a try/catch](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#redirecting).
