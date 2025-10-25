# Frontend Demo

Simple HTML page demonstrating the OAuth flow for mobile and desktop apps.

## Running

### Option 1: Open directly
Simply open `index.html` in your browser.

### Option 2: Use a local server (recommended)
```bash
npx serve .
```

Then open http://localhost:3000

### Option 3: Python HTTP server
```bash
python3 -m http.server 3000
```

## Configuration

Before testing:

1. Make sure the backend server is running (see `backend/README.md`)
2. Update the backend URL if needed (default: http://localhost:3001)
3. Configure your redirect URI in WorkOS Dashboard

## How to Use

1. Click "Sign In with WorkOS"
2. Complete authentication in WorkOS
3. You'll be redirected back with an authorization code
4. The code is automatically exchanged for tokens
5. User information is displayed

## Capacitor Translation

This demo uses standard web APIs. Here's how each part translates to Capacitor:

### Opening the Auth URL

**HTML (this demo):**
```javascript
window.location.href = authorizationUrl;
```

**Capacitor:**
```typescript
import { Browser } from '@capacitor/browser';

await Browser.open({ url: authorizationUrl });
```

### Handling the Callback

**HTML (this demo):**
```javascript
// Automatically handled by URL parameters
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
```

**Capacitor:**
```typescript
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (event) => {
    const url = new URL(event.url);
    const code = url.searchParams.get('code');
    // Exchange code for tokens
});
```

### Storing Tokens

**HTML (this demo):**
```javascript
localStorage.setItem('access_token', accessToken);
```

**Capacitor:**
```typescript
import { Preferences } from '@capacitor/preferences';

await Preferences.set({
    key: 'access_token',
    value: accessToken
});
```

For production, use more secure storage:
- iOS: Keychain via `@capacitor-community/secure-storage-plugin`
- Android: EncryptedSharedPreferences

### Backend API Calls

These are identical in both HTML and Capacitor - just use `fetch()`:

```typescript
const response = await fetch('https://your-backend.com/auth/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
});
```

## Testing with Mobile

To test with an actual mobile device or emulator:

1. Deploy the backend to a public URL (use ngrok for quick testing):
   ```bash
   ngrok http 3001
   ```

2. Update the backend URL in the demo to the ngrok URL

3. In WorkOS Dashboard, configure redirect URI:
   - For this demo: `http://localhost:3000/callback`
   - For Capacitor: `myapp://auth/callback` (custom scheme)

## Key Concepts Demonstrated

1. **Authorization URL Generation** - Building the OAuth URL with parameters
2. **Code Exchange** - Trading authorization code for access/refresh tokens
3. **Token Storage** - Saving tokens securely (localStorage in demo, secure storage in production)
4. **Token Refresh** - Using refresh token to get new access tokens
5. **Session Management** - Loading existing tokens on app start

## Differences from Web Apps

Traditional web apps can:
- Redirect naturally without opening external browsers
- Store sessions in HTTP-only cookies
- Run authentication entirely on the server

Mobile/desktop apps must:
- Open system browser for authentication
- Register custom URL schemes for callbacks
- Store tokens client-side in secure storage
- Always exchange codes on the backend (never expose client secret)

## Next Steps

To implement this in your Capacitor app:

1. Install required plugins:
   ```bash
   npm install @capacitor/browser @capacitor/app @capacitor/preferences
   ```

2. Register your custom URL scheme in `capacitor.config.ts`:
   ```typescript
   {
       appId: 'com.yourcompany.app',
       appName: 'Your App',
       ios: {
           scheme: 'yourapp'
       },
       android: {
           scheme: 'yourapp'
       }
   }
   ```

3. Add URL scheme to `Info.plist` (iOS) and `AndroidManifest.xml` (Android)

4. Implement the auth flow using the patterns shown in this demo

5. Update WorkOS Dashboard redirect URIs to use your custom scheme

## Troubleshooting

### "Invalid redirect_uri" error
- Make sure the redirect URI matches exactly what's configured in WorkOS Dashboard
- Include the protocol (http:// or custom scheme)

### Callback not received
- Check that your custom URL scheme is registered properly
- Verify the redirect URI in the authorization URL matches your configuration
- Test with a web browser first to isolate mobile-specific issues

### CORS errors
- These only apply when calling the backend from a browser
- Mobile apps don't face CORS restrictions
- If testing in browser, ensure your backend enables CORS

### Tokens not persisting
- Check that you're storing tokens after receiving them
- Verify storage permissions on mobile devices
- Use secure storage plugins for production
