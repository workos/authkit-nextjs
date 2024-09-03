import { AuthkitOptions } from './interfaces.js';

class Variables {
  public WORKOS_API_HOSTNAME: string | undefined;
  public WORKOS_API_HTTPS: string | undefined;
  public WORKOS_API_KEY: string;
  public WORKOS_API_PORT: string | undefined;
  public WORKOS_CLIENT_ID: string;
  public WORKOS_COOKIE_DOMAIN: string | undefined;
  public WORKOS_COOKIE_MAX_AGE: string | undefined;
  public WORKOS_COOKIE_NAME: string | undefined;
  public WORKOS_COOKIE_PASSWORD: string;
  public WORKOS_REDIRECT_URI: string;

  constructor() {
    this.WORKOS_API_HOSTNAME = this.getEnvVariable('WORKOS_API_HOSTNAME');
    this.WORKOS_API_HTTPS = this.getEnvVariable('WORKOS_API_HTTPS');
    this.WORKOS_API_KEY = this.getEnvVariable('WORKOS_API_KEY') ?? '';
    this.WORKOS_API_PORT = this.getEnvVariable('WORKOS_API_PORT');
    this.WORKOS_CLIENT_ID = this.getEnvVariable('WORKOS_CLIENT_ID') ?? '';
    this.WORKOS_COOKIE_DOMAIN = this.getEnvVariable('WORKOS_COOKIE_DOMAIN');
    this.WORKOS_COOKIE_MAX_AGE = this.getEnvVariable('WORKOS_COOKIE_MAX_AGE');
    this.WORKOS_COOKIE_NAME = this.getEnvVariable('WORKOS_COOKIE_NAME');
    this.WORKOS_COOKIE_PASSWORD = this.getEnvVariable('WORKOS_COOKIE_PASSWORD') ?? '';
    this.WORKOS_REDIRECT_URI = this.getEnvVariable('WORKOS_REDIRECT_URI') ?? '';
  }

  setUserProvidedOptions(options: AuthkitOptions) {
    if (options.clientId) {
      this.WORKOS_CLIENT_ID = options.clientId;
    }

    if (options.cookiePassword) {
      this.WORKOS_COOKIE_PASSWORD = options.cookiePassword;
    }

    if (options.redirectUri) {
      this.WORKOS_REDIRECT_URI = options.redirectUri;
    }

    if (options.apiKey) {
      this.WORKOS_API_KEY = options.apiKey;
    }

    if (options.cookieDomain) {
      this.WORKOS_COOKIE_DOMAIN = options.cookieDomain;
    }

    if (options.cookieMaxAge) {
      this.WORKOS_COOKIE_MAX_AGE = options.cookieMaxAge.toString();
    }

    if (options.hostname) {
      this.WORKOS_API_HOSTNAME = options.hostname;
    }

    if (options.https) {
      this.WORKOS_API_HTTPS = options.https.toString();
    }

    if (options.port) {
      this.WORKOS_API_PORT = options.port.toString();
    }

    if (options.cookieName) {
      this.WORKOS_COOKIE_NAME = options.cookieName;
    }
  }

  private getEnvVariable(name: string): string | undefined {
    return process.env[name];
  }
}

const variables = new Variables();

export { variables };
