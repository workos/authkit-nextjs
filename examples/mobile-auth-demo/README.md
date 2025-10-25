# WorkOS OAuth for Mobile and Desktop Apps

This demo shows the OAuth authentication flow for platforms that cannot handle traditional web redirects, including:
- Capacitor/Ionic apps
- React Native apps
- Desktop apps (Electron, Tauri)
- Any non-web platform using WorkOS AuthKit

## The Problem

Web applications can redirect naturally during OAuth:
1. Redirect user to WorkOS
2. User authenticates
3. WorkOS redirects back to your app

Native and desktop apps cannot handle redirects the same way. They need to:
1. Open a system browser with WorkOS URL
2. Register a custom URL scheme to receive the callback
3. Extract the authorization code
4. Exchange the code for tokens on the backend

## The OAuth Protocol Flow

### Step 1: Generate Authorization URL

Build the WorkOS authorization URL with required parameters:

```
GET https://api.workos.com/user_management/authorize
  ?client_id={YOUR_CLIENT_ID}
  &redirect_uri={YOUR_CALLBACK_URL}
  &response_type=code
  &state={OPTIONAL_STATE}
  &organization_id={OPTIONAL_ORG_ID}
```

**Required Parameters:**
- `client_id`: Your WorkOS Client ID
- `redirect_uri`: Where WorkOS should redirect after auth (must use custom scheme for mobile)
- `response_type`: Always `code` for authorization code flow

**Optional Parameters:**
- `state`: CSRF protection token and/or routing information
- `organization_id`: Pre-select an organization
- `screen_hint`: `sign-in` or `sign-up` to show specific screen

**Example:**
```
https://api.workos.com/user_management/authorize?client_id=client_123&redirect_uri=myapp://auth/callback&response_type=code&state=abc123
```

### Step 2: Open Browser

Open this URL in the system browser. The implementation differs by platform:

**iOS (ASWebAuthenticationSession):**
```swift
import AuthenticationServices

let session = ASWebAuthenticationSession(
    url: authURL,
    callbackURLScheme: "myapp"
) { callbackURL, error in
    // Handle callback
}
session.start()
```

**Android (Custom Tabs):**
```kotlin
val intent = CustomTabsIntent.Builder().build()
intent.launchUrl(context, Uri.parse(authUrl))
```

**Capacitor:**
```typescript
import { Browser } from '@capacitor/browser';

await Browser.open({ url: authorizationUrl });
```

**React Native:**
```typescript
import { Linking } from 'react-native';

Linking.openURL(authorizationUrl);
```

**Tauri:**
```rust
use tauri::api::shell;

shell::open(&shell_scope, authUrl, None)?;
```

### Step 3: User Authenticates

User completes authentication in WorkOS AuthKit:
- Enters credentials
- Completes SSO flow
- Completes MFA if required
- Accepts organization invitation

### Step 4: Receive Callback

WorkOS redirects to your callback URL with the authorization code:

```
myapp://auth/callback?code=01ABCDEF...&state=abc123
```

**Query Parameters:**
- `code`: Authorization code (single-use, expires in 10 minutes)
- `state`: The same state you provided in Step 1

Platform-specific callback handling:

**iOS (ASWebAuthenticationSession):**
```swift
// Handled automatically in the completion handler from Step 2
```

**Android:**
```kotlin
// In AndroidManifest.xml:
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="myapp" android:host="auth" />
</intent-filter>

// In your Activity:
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    val data: Uri? = intent?.data
    val code = data?.getQueryParameter("code")
}
```

**Capacitor:**
```typescript
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (event) => {
    const url = new URL(event.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    // Send code to backend
});
```

**React Native:**
```typescript
import { Linking } from 'react-native';

Linking.addEventListener('url', (event) => {
    const url = new URL(event.url);
    const code = url.searchParams.get('code');
    // Send code to backend
});
```

### Step 5: Exchange Code for Tokens (Backend)

**Critical: This MUST happen on your backend** because it requires your client secret.

Your mobile app sends the authorization code to your backend:

```typescript
// Mobile app
const response = await fetch('https://your-backend.com/api/auth/mobile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
});

const { accessToken, refreshToken, user } = await response.json();
```

Your backend exchanges the code for tokens:

```javascript
// Backend (Node.js)
const workos = new WorkOS(process.env.WORKOS_API_KEY);

const { user, accessToken, refreshToken, organizationId } =
    await workos.userManagement.authenticateWithCode({
        clientId: process.env.WORKOS_CLIENT_ID,
        code: authorizationCode,
    });
```

Under the hood, this makes a server-to-server request:

```bash
curl -X POST https://api.workos.com/user_management/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client_123",
    "client_secret": "sk_secret_456",
    "code": "01ABCDEF...",
    "grant_type": "authorization_code"
  }'
```

**Response:**
```json
{
    "access_token": "eyJhbGc...",
    "refresh_token": "ey_refresh...",
    "user": {
        "id": "user_01HGXY...",
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "email_verified": true,
        "profile_picture_url": "https://...",
        "object": "user",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    },
    "organization_id": "org_01HGXY...",
    "impersonator": null
}
```

### Step 6: Store Tokens Securely

Store tokens in secure platform-specific storage:

**iOS:**
```swift
import Security

// Store in Keychain
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "accessToken",
    kSecValueData as String: tokenData
]
SecItemAdd(query as CFDictionary, nil)
```

**Android:**
```kotlin
import androidx.security.crypto.EncryptedSharedPreferences

val sharedPreferences = EncryptedSharedPreferences.create(
    "secure_prefs",
    MasterKey.DEFAULT_MASTER_KEY_ALIAS,
    context,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

sharedPreferences.edit()
    .putString("access_token", accessToken)
    .apply()
```

**Capacitor:**
```typescript
import { Preferences } from '@capacitor/preferences';

await Preferences.set({
    key: 'access_token',
    value: accessToken
});
```

**React Native:**
```typescript
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('access_token', accessToken);
```

### Step 7: Refresh Tokens

Access tokens expire (typically after 1 hour). Use the refresh token to get new tokens:

```javascript
// Backend
const { accessToken, refreshToken } =
    await workos.userManagement.authenticateWithRefreshToken({
        clientId: process.env.WORKOS_CLIENT_ID,
        refreshToken: storedRefreshToken,
    });
```

This makes a POST request:

```bash
curl -X POST https://api.workos.com/user_management/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client_123",
    "client_secret": "sk_secret_456",
    "refresh_token": "ey_refresh...",
    "grant_type": "refresh_token"
  }'
```

## RBAC and Authorization

After authentication, you need to fetch role and permission data for authorization.

### Getting User Roles

WorkOS stores roles in the Directory (organization members):

```javascript
// Backend
const directoryUser = await workos.directorySync.listDirectoryUsers({
    directory: organizationId,
    user: userId,
});

const roles = directoryUser.data[0]?.groups || [];
```

Or use the UserManagement API:

```javascript
const orgMembership = await workos.userManagement.getOrganizationMembership({
    organizationId,
    userId,
});

const role = orgMembership.role;
```

### Middleware Pattern

Create backend middleware that checks roles:

```javascript
// Express middleware
async function requireRole(requiredRole) {
    return async (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');

        // Verify token and get user
        const { user, organizationId } = await verifyToken(token);

        // Get user's role
        const membership = await workos.userManagement.getOrganizationMembership({
            organizationId,
            userId: user.id,
        });

        if (membership.role.slug !== requiredRole) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        req.user = user;
        req.organizationId = organizationId;
        next();
    };
}

// Usage
app.get('/api/admin/users', requireRole('admin'), async (req, res) => {
    // Only accessible to admins
});
```

## Common Issues and Solutions

### Issue: "Invalid redirect_uri"

**Cause:** WorkOS doesn't recognize your callback URL.

**Solution:** Add your custom URL scheme to allowed redirects in WorkOS Dashboard:
- Development: `myapp://auth/callback`
- Production: Use the same scheme or a different one

### Issue: "Code has already been used"

**Cause:** Authorization codes are single-use. You tried to exchange it twice.

**Solution:** Only call the token exchange endpoint once per code.

### Issue: "Client authentication failed"

**Cause:** Client secret is incorrect or the code exchange is happening client-side.

**Solution:** Verify your client secret and ensure exchange happens on backend.

### Issue: Callback not received

**Cause:** Custom URL scheme not registered properly.

**Solution:**
- iOS: Check `Info.plist` has URL scheme registered
- Android: Check `AndroidManifest.xml` has intent filter
- Capacitor: Ensure `appUrlOpen` listener is registered before opening browser

### Issue: State mismatch

**Cause:** The state parameter doesn't match what you sent.

**Solution:** Store the state before starting auth and verify it matches on callback.

## Security Best Practices

1. **Never store client secret in mobile app** - Always exchange code on backend
2. **Always validate state parameter** - Prevents CSRF attacks
3. **Use secure storage** - Keychain (iOS), Keystore (Android), not localStorage
4. **Implement token refresh** - Don't force users to re-authenticate
5. **Use PKCE** (optional but recommended) - Additional security layer for public clients
6. **Validate tokens on backend** - Never trust client-provided tokens without verification

## Platform-Specific Considerations

### Capacitor/Ionic

Capacitor provides plugins that handle most complexity:
- `@capacitor/browser` - Opens system browser
- `@capacitor/app` - Handles URL callbacks
- `@capacitor/preferences` - Secure storage

The flow is nearly identical to web development.

### React Native

React Native requires more manual setup:
- Deep linking configuration in both iOS and Android
- Manual URL scheme registration
- Use `react-native-app-auth` library for abstraction

### Tauri

Tauri desktop apps face similar challenges:
- Register custom protocol handler
- Open system browser for auth
- Listen for protocol callback
- Same backend token exchange

### Native iOS/Android

Building native apps requires:
- iOS: `ASWebAuthenticationSession` (recommended) or custom implementation
- Android: Chrome Custom Tabs or WebView
- Manual URL scheme handling
- Native secure storage implementation

## Three Demo Implementations

This demo includes three different implementations:

### 1. Capacitor App (Recommended for Mobile)

**Location:** `/capacitor-app`

Real mobile implementation using Capacitor with custom URL schemes. This shows exactly how OAuth works in a native mobile app.

**Use this if you want to:**
- Understand mobile OAuth with custom URL schemes
- See how iOS/Android intercept callback URLs
- Learn what your Capacitor plugin should do

[Read Capacitor App README](capacitor-app/README.md)

### 2. Backend Server (Required)

**Location:** `/backend`

Express server that handles token exchange. Required by both frontend demos.

[Read Backend README](backend/README.md)

### 3. HTML Demo (Web Reference)

**Location:** `/frontend`

Simple HTML page showing the protocol. Good for understanding the API calls, but doesn't demonstrate mobile-specific behavior.

[Read Frontend README](frontend/README.md)

## Quick Start

See [QUICKSTART.md](QUICKSTART.md) for a 5-minute setup guide.

For mobile development, start with the Capacitor app:

```bash
# 1. Start backend
cd backend
npm install && cp .env.example .env
# Edit .env with your WorkOS credentials
npm start

# 2. Setup Capacitor app
cd ../capacitor-app
npm install
npm run build
npx cap add ios  # or android
npm run sync
npm run open:ios  # or open:android
```

## Additional Resources

- [WorkOS AuthKit Documentation](https://workos.com/docs/user-management/authkit)
- [WorkOS User Management API](https://workos.com/docs/reference/user-management)
- [OAuth 2.0 Specification](https://oauth.net/2/)
- [PKCE Specification](https://oauth.net/2/pkce/)
