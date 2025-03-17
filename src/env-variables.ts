/* istanbul ignore file */

function getEnvVariable(name: string): string | undefined {
  return process.env[name];
}

// Optional env variables
const WORKOS_API_HOSTNAME = getEnvVariable('WORKOS_API_HOSTNAME');
const WORKOS_API_HTTPS = getEnvVariable('WORKOS_API_HTTPS');
const WORKOS_API_PORT = getEnvVariable('WORKOS_API_PORT');
const WORKOS_COOKIE_DOMAIN = getEnvVariable('WORKOS_COOKIE_DOMAIN');
const WORKOS_COOKIE_MAX_AGE = getEnvVariable('WORKOS_COOKIE_MAX_AGE');
const WORKOS_COOKIE_NAME = getEnvVariable('WORKOS_COOKIE_NAME');
const WORKOS_COOKIE_SAMESITE = getEnvVariable('WORKOS_COOKIE_SAMESITE');

// Required env variables
const WORKOS_API_KEY = getEnvVariable('WORKOS_API_KEY') ?? '';
const WORKOS_CLIENT_ID = getEnvVariable('WORKOS_CLIENT_ID') ?? '';
const WORKOS_COOKIE_PASSWORD = getEnvVariable('WORKOS_COOKIE_PASSWORD') ?? '';
const WORKOS_REDIRECT_URI = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? '';

export {
  WORKOS_API_HOSTNAME,
  WORKOS_API_HTTPS,
  WORKOS_API_KEY,
  WORKOS_API_PORT,
  WORKOS_CLIENT_ID,
  WORKOS_COOKIE_DOMAIN,
  WORKOS_COOKIE_MAX_AGE,
  WORKOS_COOKIE_NAME,
  WORKOS_COOKIE_PASSWORD,
  WORKOS_REDIRECT_URI,
  WORKOS_COOKIE_SAMESITE,
};
