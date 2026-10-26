# Next.js integration example using AuthKit

An example application demonstrating how to authenticate users with AuthKit and the WorkOS Node SDK.

> Refer to the [User Management](https://workos.com/docs/user-management) documentation for reference.

## Prerequisites

You will need a [WorkOS account](https://dashboard.workos.com/signup).

## Running the example

1. In the [WorkOS dashboard](https://dashboard.workos.com), head to the Redirects tab and create a [sign-in callback redirect](https://workos.com/docs/user-management/1-configure-your-project/configure-a-redirect-uri) for `http://localhost:3000/callback` and set the app homepage URL to `http://localhost:3000`.

2. After creating the redirect URI, navigate to the API keys tab and copy the _Client ID_ and the _Secret Key_. Rename the `.env.local.example` file to `.env.local` and supply your Client ID and API key as environment variables.

3. Additionally, create a cookie password as the private key used to encrypt the session cookie. Copy the output into the environment variable `WORKOS_COOKIE_PASSWORD`.

   It has to be at least 32 characters long. You can use https://1password.com/password-generator/ to generate strong passwords.

4. Verify your `.env.local` file has the following variables filled.

   ```bash
   WORKOS_CLIENT_ID=<YOUR_CLIENT_ID>
   WORKOS_API_KEY=<YOUR_API_SECRET_KEY>
   WORKOS_COOKIE_PASSWORD=<YOUR_COOKIE_PASSWORD>

   NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
   ```

5. Run the following command and navigate to [http://localhost:3000](http://localhost:3000).

   ```bash
   pnpm dev
   ```
