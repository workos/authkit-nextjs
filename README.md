# WorkOS NextJS Library

The WorkOS library for Next.js provides convenient helpers for authentication and session management using WorkOS & AuthKit with Next.js.

## Installation

Install the package with:

```
yarn add @workos-inc/nextjs
```

## Configuration

To use the library you must provide a few environement variables, most of them located in the WorkOS dashboard:

```sh
WORKOS_CLIENT_ID="<your Client ID>"
WORKOS_API_KEY="<your Secret Key>"
WORKOS_REDIRECT_URI="<your Redirect URI>"
WORKOS_COOKIE_PASSWORD="<your password>"
```

`WORKOS_COOKIE_PASSWORD` is the private key used to encrypt the cookie. It has to be at least 32 characters long. Use https://1password.com/password-generator/ to generate strong passwords.
