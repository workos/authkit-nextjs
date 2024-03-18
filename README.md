# WorkOS NextJS Library

The WorkOS library for Next.js provides convenient helpers for authentication and session management using WorkOS & AuthKit with Next.js.

## Installation

Install the package with:

```
npm i @workos-inc/nextjs
```

or

```
yarn add @workos-inc/nextjs
```

## Pre-flight

Make sure the following values are present in your `.env.local` environment variables file. The client ID and API key can be found in the [WorkOS dashboard](https://dashboard.workos.com), and the redirect URI can also be configured there.

```sh
WORKOS_CLIENT_ID="<your Client ID>"
WORKOS_API_KEY="<your Secret Key>"
WORKOS_REDIRECT_URI="<your Redirect URI>"
WORKOS_COOKIE_PASSWORD="<your password>"
```

`WORKOS_COOKIE_PASSWORD` is the private key used to encrypt the cookie. It has to be at least 32 characters long. You can use https://1password.com/password-generator/ to generate strong passwords.

## Usage

### Callback route

WorkOS requires that you have a callback URL to redirect users back to after they've authenticated. In your Next.js app, create `/src/app/callback/route.ts` and add the following. Make sure this route matches the `WORKOS_REDIRECT_URI` variable and the configured redirect URI in your WorkOS dashboard.

```ts
export { authkitCallbackRoute as GET } from '@workos-inc/nextjs';
```

### Middleware

This library relies on Next.js middleware to provide session management for routes. Put the following in your `/src/middleware.ts` file:

```ts
import { authkitMiddleware } from '@workos-inc/nextjs';

export default authkitMiddleware();

// Match against pages that require auth, e.g.:
export const config = { matcher: ['/', '/account/:path*'] };
```

### Conditional auth

For pages where you want to display a signed-in and signed-out view, use `getUser` to retrieve the user profile from WorkOS.

```jsx
import { getUser, getSignInUrl } from '@workos-inc/nextjs';
import { Button, Flex, Heading, Text } from '@radix-ui/themes';

export default async function HomePage() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user } = await getUser();

  // If there's no user, get the URL to redirect the user to AuthKit to sign in
  const signInUrl = user ? null : await getSignInUrl();

  return (
    <Flex direction="column" align="center" gap="2">
      {user ? (
        <>
          <Heading size="8">Welcome back{user?.firstName && `, ${user?.firstName}`}</Heading>
          <Text size="5" color="gray">
            You are now authenticated into the application
          </Text>
        </>
      ) : (
        <>
          <Heading size="8">AuthKit authentication example</Heading>
          <Text size="5" color="gray" mb="4">
            Sign in to view your account details
          </Text>
          <Button size="3" asChild>
            <a href={signInUrl}>Sign In with AuthKit</a>
          </Button>
        </>
      )}
    </Flex>
  );
}
```

### Required auth

For pages where a signed-in user is mandatory, you can use the `ensureSignedIn` option:

```jsx
const { user } = await getUser({ ensureSignedIn: true });
```
