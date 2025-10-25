# Testing in iOS Simulator

The demo works in the iOS simulator without any modifications.

## Prerequisites

- Xcode installed
- Node.js installed
- Backend server running

## Setup Steps

### 1. Start the Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your WorkOS credentials:
```
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
```

Start the server:
```bash
npm start
```

Keep this running. You should see:
```
🚀 WorkOS Mobile Auth Demo Backend
📡 Server running on http://localhost:3001
```

### 2. Configure WorkOS Dashboard

Add the redirect URI to your WorkOS application:

1. Go to [WorkOS Dashboard](https://dashboard.workos.com/)
2. Select your application
3. Go to Configuration → Redirect URIs
4. Add: `workosauthdemo://callback`
5. Save

### 3. Setup the Capacitor App

```bash
cd capacitor-app
npm install
```

**Important:** The config is already set for simulator testing:
- `BACKEND_URL: 'http://localhost:3001'` works in iOS simulator
- URL scheme `workosauthdemo://` is pre-configured

Build the web assets:
```bash
npm run build
```

### 4. Add iOS Platform (First Time Only)

```bash
npx cap add ios
```

This creates the `ios/` directory with Xcode project.

### 5. Sync Assets and Configuration

```bash
npm run sync:ios
```

This:
- Copies your built web assets to the iOS app
- Registers the custom URL scheme in Info.plist
- Updates Capacitor configuration

### 6. Open in Xcode

```bash
npm run open:ios
```

Or manually:
```bash
open ios/App/App.xcworkspace
```

**Important:** Always open the `.xcworkspace` file, not `.xcodeproj`.

### 7. Run in Simulator

1. In Xcode, select a simulator from the device dropdown (e.g., iPhone 15 Pro)
2. Click the ▶ Play button (or Cmd+R)
3. Wait for the build and simulator to launch

The app should open in the simulator.

## Testing the OAuth Flow

1. **Click "Sign In with WorkOS"**
   - Safari should open within the simulator
   - You'll see the WorkOS AuthKit login page

2. **Create an account or sign in**
   - Use any email (test mode doesn't require verification)
   - Complete any MFA if configured

3. **Observe the callback**
   - Safari may close automatically (platform-dependent)
   - Your app should come to the foreground
   - You'll see "Authentication successful!"
   - User information is displayed

4. **Test token refresh**
   - Click "Refresh Token"
   - Should succeed without re-authentication

5. **Test sign out**
   - Click "Sign Out"
   - Should return to login screen
   - Tokens are cleared

## Debugging

### Check Console Logs

In Xcode, open the debug console (Cmd+Shift+C) to see logs:

```
🚀 Starting OAuth flow...
📝 Authorization URL generated
🌐 Browser opened with authorization URL
📱 App URL opened: workosauthdemo://callback?code=...
✅ OAuth callback received
  Code: 01ABCDEF...
🔄 Exchanging authorization code for tokens...
✅ Tokens received
💾 Tokens stored
```

These logs show each step of the flow.

### Common Issues

#### "Invalid redirect_uri" Error

**Symptom:** Error in WorkOS after authentication

**Cause:** Redirect URI not configured in WorkOS Dashboard

**Fix:**
1. Go to WorkOS Dashboard → Your App → Configuration → Redirect URIs
2. Add: `workosauthdemo://callback`
3. Try again

#### Backend Connection Error

**Symptom:** "Failed to fetch" or network error after callback

**Cause:** Backend not running or wrong URL

**Fix:**
1. Check backend is running: `curl http://localhost:3001/health`
2. In simulator, `localhost` should work
3. Check Xcode console for exact error

#### App Doesn't Come to Foreground

**Symptom:** Safari stays open after auth

**Cause:** Normal behavior - callback still works

**Solution:**
- Manually return to the app
- The callback should have been processed
- Check if user info appeared

#### URL Scheme Not Registered

**Symptom:** Safari shows "Cannot open page" for workosauthdemo://

**Cause:** Capacitor sync didn't update Info.plist

**Fix:**
```bash
npm run sync:ios
```

Then rebuild in Xcode.

#### Browser Opens But Nothing Happens

**Symptom:** WorkOS page loads but login doesn't work

**Cause:** WorkOS configuration issue

**Fix:**
1. Check your WorkOS Client ID is correct
2. Verify the environment (test vs production)
3. Try in a real browser first to isolate mobile-specific issues

### Inspecting the iOS App

View the Info.plist to confirm URL scheme is registered:

```bash
cat ios/App/App/Info.plist | grep -A 5 CFBundleURLTypes
```

Should show:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>workosauthdemo</string>
        </array>
    </dict>
</array>
```

## Simulator vs Real Device

### What Works the Same:
- OAuth flow
- Custom URL scheme callbacks
- Token exchange
- Everything else

### What Might Differ:
- Browser behavior (Safari vs SFSafariViewController)
- Performance
- Some native features

**For this demo, everything works identically in the simulator.**

## Making Changes

If you modify the code:

1. Rebuild web assets:
   ```bash
   npm run build
   ```

2. Sync to iOS:
   ```bash
   npm run sync:ios
   ```

3. Rebuild in Xcode (Cmd+B) or just run (Cmd+R)

**Note:** For TypeScript/CSS changes, you must rebuild and sync. The iOS app doesn't hot-reload.

## Next Steps

After confirming it works in simulator:

1. **Test on a real device** (optional)
   - Requires developer account for code signing
   - Flow is identical

2. **Customize for your app**
   - Change URL scheme in `capacitor.config.ts`
   - Update redirect URI in WorkOS Dashboard
   - Modify `src/config.ts` with your backend URL

3. **Implement in your project**
   - Copy `src/auth.ts` as reference
   - Use the same Capacitor plugins
   - Follow the same patterns

## Confirming Everything Works

You know it's working when:

1. ✅ Backend health check responds: `curl http://localhost:3001/health`
2. ✅ App launches in simulator
3. ✅ Safari opens when you click "Sign In"
4. ✅ WorkOS login page loads
5. ✅ After auth, app comes to foreground
6. ✅ User info is displayed
7. ✅ Console shows all log messages
8. ✅ Refresh token works

If any step fails, check the debugging section above.
