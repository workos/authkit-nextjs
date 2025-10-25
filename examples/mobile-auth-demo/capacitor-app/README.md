# Capacitor OAuth Demo

Real mobile OAuth implementation showing how to authenticate with WorkOS in a Capacitor app using custom URL schemes.

## What's Different from Web OAuth?

### Web OAuth Flow:
```
1. window.location.href = authUrl  // Redirect
2. User authenticates
3. Server redirects back to /callback
4. Server handles the callback route
```

### Mobile OAuth Flow (this demo):
```
1. Browser.open(authUrl)  // Opens system browser
2. User authenticates
3. WorkOS redirects to: workosauthdemo://callback?code=...
4. iOS/Android intercepts the custom URL scheme
5. App.addListener('appUrlOpen') fires with the URL
6. App parses the URL and extracts the code
7. App sends code to backend for token exchange
```

## Key Files to Understand

### `src/auth.ts` - The Core OAuth Logic

This is what your Capacitor plugin needs to do:

```typescript
// 1. Listen for the custom URL callback
App.addListener('appUrlOpen', async (event) => {
  const url = new URL(event.url);
  const code = url.searchParams.get('code');

  // 2. Send code to backend
  await exchangeCodeForTokens(code);
});

// 3. Start auth by opening browser
await Browser.open({ url: authorizationUrl });
```

That's it. The rest is just UI and storage.

### `capacitor.config.ts` - Register Your URL Scheme

```typescript
{
  appId: 'com.workos.authdemo',
  ios: {
    scheme: 'workosauthdemo'
  },
  android: {
    scheme: 'workosauthdemo'
  }
}
```

### Platform-Specific Configuration

**iOS:** `ios-url-scheme.xml` shows what gets added to Info.plist

**Android:** `android-intent-filter.xml` shows the manifest configuration

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Backend URL

Edit `src/config.ts` and set your backend URL:

```typescript
// For local development with iOS simulator:
BACKEND_URL: 'http://localhost:3001'

// For Android emulator:
BACKEND_URL: 'http://10.0.2.2:3001'

// For real device (use your machine's IP):
BACKEND_URL: 'http://192.168.1.100:3001'

// For production (use your deployed backend):
BACKEND_URL: 'https://your-backend.com'
```

### 3. Configure WorkOS Dashboard

Add the redirect URI to your WorkOS application:

```
workosauthdemo://callback
```

Go to: WorkOS Dashboard → Your Application → Configuration → Redirect URIs

### 4. Build the Web Assets

```bash
npm run build
```

### 5. Sync with Native Projects

```bash
# Initialize iOS and Android projects (first time only)
npx cap add ios
npx cap add android

# Sync the web assets and configuration
npm run sync
```

This will:
- Copy your built web assets to native projects
- Register the custom URL scheme in iOS Info.plist
- Add the intent filter to Android AndroidManifest.xml

### 6. Open in Xcode or Android Studio

```bash
# iOS
npm run open:ios

# Android
npm run open:android
```

## Running the App

### iOS Simulator

```bash
npm run build
npm run sync:ios
npm run open:ios
```

Then click ▶ in Xcode to run.

### Android Emulator

```bash
npm run build
npm run sync:android
npm run open:android
```

Then click ▶ in Android Studio to run.

### Real Device

For testing on a real device, you need to:

1. Make your backend accessible to the device:
   ```bash
   # Option 1: Use ngrok
   ngrok http 3001

   # Option 2: Use your machine's IP
   # Find your IP: ifconfig (macOS/Linux) or ipconfig (Windows)
   # Update BACKEND_URL in src/config.ts to http://YOUR_IP:3001
   ```

2. Update the backend URL in `src/config.ts`

3. Rebuild and sync:
   ```bash
   npm run build
   npm run sync
   ```

4. Run on device from Xcode or Android Studio

## Testing the Flow

1. Click "Sign In with WorkOS"
2. System browser opens with WorkOS AuthKit
3. Sign up or sign in
4. Browser redirects to `workosauthdemo://callback?code=...`
5. System intercepts and returns to your app
6. App extracts the code and exchanges it for tokens
7. User information is displayed

## What Happens Under the Hood

### Step 1: Generate Authorization URL

```typescript
// App calls backend
POST /auth/url
{ "redirectUri": "workosauthdemo://callback" }

// Backend generates WorkOS URL
https://api.workos.com/user_management/authorize?
  client_id=...
  &redirect_uri=workosauthdemo://callback
  &response_type=code
```

### Step 2: Open Browser

```typescript
await Browser.open({
  url: "https://api.workos.com/user_management/authorize?..."
});
```

User authenticates in the system browser (Safari on iOS, Chrome on Android).

### Step 3: WorkOS Redirects

After authentication, WorkOS redirects to:
```
workosauthdemo://callback?code=01ABCDEF...&state=xyz
```

### Step 4: System Captures Callback

iOS/Android intercepts this URL because you registered the scheme.

The browser closes automatically and your app comes to foreground.

### Step 5: App Receives URL

```typescript
App.addListener('appUrlOpen', (event) => {
  // event.url = "workosauthdemo://callback?code=01ABCDEF...&state=xyz"
  const url = new URL(event.url);
  const code = url.searchParams.get('code'); // "01ABCDEF..."
});
```

### Step 6: Exchange Code for Tokens

```typescript
// App calls backend with code
POST /auth/callback
{ "code": "01ABCDEF..." }

// Backend calls WorkOS with client secret
POST https://api.workos.com/user_management/authenticate
{
  "client_id": "...",
  "client_secret": "sk_...",  // SECRET - never in mobile app
  "code": "01ABCDEF...",
  "grant_type": "authorization_code"
}

// Backend receives tokens
{
  "access_token": "eyJ...",
  "refresh_token": "ey_...",
  "user": { ... }
}

// Backend returns to app (without client secret)
```

### Step 7: Store Tokens

```typescript
await Preferences.set({
  key: 'access_token',
  value: accessToken
});
```

In production, use secure storage:
- iOS: Keychain via `@capacitor-community/secure-storage-plugin`
- Android: Keystore/EncryptedSharedPreferences

## Common Issues

### "Invalid redirect_uri" Error

**Cause:** WorkOS doesn't recognize your custom URL scheme.

**Solution:**
1. Check WorkOS Dashboard → Redirect URIs
2. Make sure you added: `workosauthdemo://callback`
3. Scheme must match exactly (case-sensitive)

### Callback Not Received

**Cause:** Custom URL scheme not registered properly.

**Solution:**
1. Run `npm run sync` to regenerate native configs
2. iOS: Check `ios/App/App/Info.plist` has CFBundleURLTypes
3. Android: Check `android/app/src/main/AndroidManifest.xml` has intent-filter
4. Clean and rebuild the native projects

### Backend Connection Fails

**Cause:** Device can't reach localhost.

**Solution:**
- iOS Simulator: `localhost` works
- Android Emulator: Use `10.0.2.2` instead of `localhost`
- Real Device: Use your machine's IP address or deploy backend

### Browser Doesn't Close After Auth

**Cause:** Browser plugin behavior varies by platform.

**Solution:** This is expected. The browser may stay open, but your app should come to foreground and handle the callback. You can manually close the browser if needed, but the auth flow will complete.

## Security Best Practices

1. **Never store client secret in app** - Always exchange code on backend
2. **Use secure storage** - Keychain (iOS) / Keystore (Android) for production
3. **Validate state parameter** - Prevent CSRF attacks
4. **Use short-lived access tokens** - Implement token refresh
5. **Handle token expiration** - Refresh before making API calls

## Adapting for Your App

To use this pattern in your own Capacitor app:

1. **Choose your URL scheme** (e.g., `myapp://`)
2. **Update `capacitor.config.ts`** with your scheme
3. **Copy `src/auth.ts`** and modify CONFIG
4. **Run `cap sync`** to apply changes
5. **Add to WorkOS Dashboard** redirect URIs
6. **Test on simulator first**, then real device

The core logic in `src/auth.ts` is reusable - just update the configuration.

## Differences from Your Current Implementation

If you wrote a "native plugin" for Capacitor, you might have overcomplicated it. The built-in Capacitor plugins handle everything:

- `@capacitor/browser` - Opens system browser
- `@capacitor/app` - Listens for URL callbacks
- `@capacitor/preferences` - Stores tokens

You don't need a custom native plugin. Just use these three plugins.

## Next Steps

1. **Test this demo** to understand the flow
2. **Adapt for your app** by changing the URL scheme
3. **Implement RBAC** by calling `/auth/roles` endpoint
4. **Add token refresh** before API calls
5. **Use secure storage** in production

## Protocol Summary

The OAuth protocol is identical across platforms. Only the implementation details differ:

| Step | Protocol | Web | Capacitor |
|------|----------|-----|-----------|
| 1. Generate URL | Same | Same | Same |
| 2. Open browser | Same URL | `window.location` | `Browser.open()` |
| 3. Authenticate | Same | Same | Same |
| 4. Redirect | Same URL | HTTP redirect | Custom scheme |
| 5. Receive callback | Same params | Route handler | `App.addListener()` |
| 6. Exchange code | Same API | Same | Same |
| 7. Store tokens | Same tokens | Cookies | Secure storage |

The HTTP requests (steps 1, 6) are identical. Only the browser interaction (steps 2, 4, 5) and storage (step 7) differ.
