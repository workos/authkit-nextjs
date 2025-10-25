import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { CONFIG } from './config';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profilePictureUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
  organizationId?: string;
}

export class WorkOSAuth {
  private urlListenerRegistered = false;

  constructor() {
    this.setupUrlListener();
  }

  /**
   * THIS IS THE KEY PART FOR MOBILE OAUTH
   *
   * This listener captures custom URL scheme redirects from WorkOS.
   * When WorkOS redirects to: workosauthdemo://callback?code=123&state=abc
   * iOS/Android intercepts it and fires this event.
   *
   * This is what your Capacitor plugin needs to do!
   */
  private setupUrlListener() {
    if (this.urlListenerRegistered) return;

    App.addListener('appUrlOpen', async (event: URLOpenListenerEvent) => {
      console.log('📱 App URL opened:', event.url);

      try {
        // Parse the callback URL
        const url = new URL(event.url);

        // Check if this is our OAuth callback
        if (url.protocol === `${CONFIG.URL_SCHEME}:` && url.host === CONFIG.CALLBACK_PATH) {
          // Extract the authorization code and state
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');

          console.log('✅ OAuth callback received');
          console.log('  Code:', code?.substring(0, 10) + '...');
          console.log('  State:', state);

          if (code) {
            // Close the browser window
            await Browser.close();

            // THIS IS THE CRITICAL STEP:
            // Exchange the code for tokens on the backend
            await this.exchangeCodeForTokens(code);

            // Dispatch event so UI can update
            window.dispatchEvent(
              new CustomEvent('auth-success', {
                detail: { code, state },
              })
            );
          } else {
            throw new Error('No authorization code in callback URL');
          }
        }
      } catch (error) {
        console.error('❌ Error handling app URL:', error);
        window.dispatchEvent(
          new CustomEvent('auth-error', {
            detail: { error: error instanceof Error ? error.message : String(error) },
          })
        );
      }
    });

    this.urlListenerRegistered = true;
  }

  /**
   * Step 1: Start the OAuth flow
   * Opens the system browser with the WorkOS authorization URL
   */
  async signIn(): Promise<void> {
    try {
      console.log('🚀 Starting OAuth flow...');

      // Generate the authorization URL from the backend
      const response = await fetch(`${CONFIG.BACKEND_URL}/auth/url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          redirectUri: CONFIG.REDIRECT_URI,
          state: this.generateState(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get authorization URL: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📝 Authorization URL generated');

      // THIS IS THE KEY MOBILE DIFFERENCE:
      // Instead of window.location.href, we open the system browser
      // The user authenticates in a secure browser context
      // Then WorkOS redirects to our custom URL scheme
      await Browser.open({ url: data.authorizationUrl });

      console.log('🌐 Browser opened with authorization URL');
    } catch (error) {
      console.error('❌ Error starting sign in:', error);
      throw error;
    }
  }

  /**
   * Step 2: Exchange the authorization code for tokens
   * THIS MUST HAPPEN ON THE BACKEND (never expose client secret)
   */
  private async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      console.log('🔄 Exchanging authorization code for tokens...');

      const response = await fetch(`${CONFIG.BACKEND_URL}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const data: AuthTokens = await response.json();
      console.log('✅ Tokens received');

      // Store tokens securely
      // In production, use more secure storage like Keychain (iOS) or Keystore (Android)
      // via a plugin like @capacitor-community/secure-storage-plugin
      await this.storeTokens(data);

      console.log('💾 Tokens stored');
    } catch (error) {
      console.error('❌ Error exchanging code:', error);
      throw error;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<AuthTokens> {
    const refreshToken = await Preferences.get({ key: 'refresh_token' });

    if (!refreshToken.value) {
      throw new Error('No refresh token available');
    }

    console.log('🔄 Refreshing access token...');

    const response = await fetch(`${CONFIG.BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: refreshToken.value,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: AuthTokens = await response.json();
    await this.storeTokens(data);

    console.log('✅ Token refreshed');
    return data;
  }

  /**
   * Sign out and clear stored tokens
   * Also revokes the session on WorkOS by opening logout URL in browser
   */
  async signOut(): Promise<void> {
    try {
      const accessToken = await Preferences.get({ key: 'access_token' });

      if (accessToken.value) {
        // Decode the access token to get the session ID
        const tokenPayload = JSON.parse(atob(accessToken.value.split('.')[1]));
        const sessionId = tokenPayload.sid;

        if (sessionId) {
          // Get logout URL from backend
          const response = await fetch(`${CONFIG.BACKEND_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
          });

          if (response.ok) {
            const data = await response.json();
            // Open logout URL in browser to clear Safari cookies
            // This is critical for clearing the WorkOS session
            await Browser.open({ url: data.logoutUrl });

            // Give browser a moment to load, then close it
            await new Promise(resolve => setTimeout(resolve, 1000));
            await Browser.close();

            console.log('🔒 Session revoked on WorkOS');
          }
        }
      }
    } catch (error) {
      console.error('Error revoking session:', error);
      // Continue with local cleanup even if revocation fails
    }

    // Clear local storage
    await Preferences.remove({ key: 'access_token' });
    await Preferences.remove({ key: 'refresh_token' });
    await Preferences.remove({ key: 'user' });
    await Preferences.remove({ key: 'organization_id' });
    console.log('👋 Signed out locally');
  }

  /**
   * Get the currently stored auth session
   */
  async getSession(): Promise<AuthTokens | null> {
    const accessToken = await Preferences.get({ key: 'access_token' });
    const refreshToken = await Preferences.get({ key: 'refresh_token' });
    const user = await Preferences.get({ key: 'user' });

    if (!accessToken.value || !refreshToken.value || !user.value) {
      return null;
    }

    return {
      accessToken: accessToken.value,
      refreshToken: refreshToken.value,
      user: JSON.parse(user.value),
    };
  }

  /**
   * Store tokens securely
   * In production, use a secure storage plugin for iOS Keychain / Android Keystore
   */
  private async storeTokens(tokens: AuthTokens): Promise<void> {
    await Preferences.set({
      key: 'access_token',
      value: tokens.accessToken,
    });

    await Preferences.set({
      key: 'refresh_token',
      value: tokens.refreshToken,
    });

    await Preferences.set({
      key: 'user',
      value: JSON.stringify(tokens.user),
    });

    if (tokens.organizationId) {
      await Preferences.set({
        key: 'organization_id',
        value: tokens.organizationId,
      });
    }
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  private generateState(): string {
    return `state_${Math.random().toString(36).substring(2)}`;
  }
}
