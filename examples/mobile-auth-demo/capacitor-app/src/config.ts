// Configuration for the app
export const CONFIG = {
  // Backend API URL - update this to your backend server
  // For local development with a real device, use your machine's IP address
  // For iOS simulator: use localhost
  // For Android emulator: use 10.0.2.2
  // For real devices: use your machine's IP or deployed URL
  BACKEND_URL: 'http://localhost:3001',

  // Custom URL scheme for OAuth callback
  // This must match:
  // 1. capacitor.config.ts scheme
  // 2. iOS Info.plist URL scheme
  // 3. Android intent filter scheme
  // 4. WorkOS Dashboard redirect URI
  URL_SCHEME: 'workosauthdemo',
  CALLBACK_PATH: 'callback',

  // Get the full callback URL
  get REDIRECT_URI() {
    return `${this.URL_SCHEME}://${this.CALLBACK_PATH}`;
  },
};
