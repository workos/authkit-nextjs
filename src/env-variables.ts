function getEnvVariable(name: string) {
  const envVariable = process.env[name];
  if (!envVariable) {
    throw new Error(`${name} environment variable is not set`);
  }
  return envVariable;
}

const WORKOS_CLIENT_ID = getEnvVariable('WORKOS_CLIENT_ID');
const WORKOS_API_KEY = getEnvVariable('WORKOS_API_KEY');
const WORKOS_REDIRECT_URI = getEnvVariable('WORKOS_REDIRECT_URI');
const WORKOS_COOKIE_PASSWORD = getEnvVariable('WORKOS_COOKIE_PASSWORD');

if (WORKOS_COOKIE_PASSWORD.length < 32) {
  throw new Error('WORKOS_COOKIE_PASSWORD must be at least 32 characters long');
}

export { WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_REDIRECT_URI, WORKOS_COOKIE_PASSWORD };
