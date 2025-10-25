# Mobile OAuth: What You Need to Know

This guide directly answers your questions about implementing WorkOS OAuth in Capacitor and understanding the callback mechanism.

## Your Questions Answered

### "What do the SDKs do during callback from AuthKit?"

**Short answer:** They parse a URL and send an authorization code to the backend.

**Detailed explanation:**

When WorkOS finishes authentication, it redirects to your callback URL:
```
workosauthdemo://callback?code=01ABCDEF123&state=xyz
```

Your SDK needs to:
1. Parse this URL string
2. Extract the `code` parameter
3. Send the code to your backend
4. Backend exchanges code for tokens using client secret

**See it in action:** `capacitor-app/src/auth.ts` lines 35-73

The callback handler is surprisingly simple:
```typescript
App.addListener('appUrlOpen', async (event) => {
  const url = new URL(event.url);  // Parse the URL
  const code = url.searchParams.get('code');  // Extract code

  // Send to backend
  await fetch('https://your-backend.com/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
});
```

That's the entire callback mechanism. Your native plugin likely overcomplicated this.

---

### "How does the callback work? It's not a redirect per se"

**You're right - it's not a web redirect.**

Here's what actually happens:

1. **Your app opens the browser:**
   ```typescript
   Browser.open({ url: 'https://api.workos.com/...' });
   ```

2. **User authenticates in browser**

3. **WorkOS "redirects" to custom scheme:**
   ```
   workosauthdemo://callback?code=...
   ```

4. **iOS/Android intercepts this:**
   - iOS: Because you registered URL type in Info.plist
   - Android: Because you have an intent filter in AndroidManifest.xml

5. **Your app receives the URL:**
   - iOS: Via ASWebAuthenticationSession or Universal Links
   - Android: Via intent filter
   - Capacitor: Both handled automatically, fires `appUrlOpen` event

6. **Browser may or may not close automatically** (platform-dependent)

**Key insight:** It's not a redirect in the HTTP sense. It's a URL that the OS intercepts and routes to your app.

**See configuration:**
- iOS: `capacitor-app/ios-url-scheme.xml`
- Android: `capacitor-app/android-intent-filter.xml`

---

### "Holistic advice about the protocol of exchange/callback"

The protocol is identical across all platforms. Only the delivery mechanism differs.

#### Universal (Same Everywhere):

**Step 1 - Generate auth URL:**
```http
GET https://api.workos.com/user_management/authorize
  ?client_id=client_123
  &redirect_uri=yourapp://callback
  &response_type=code
  &state=random_string
```

**Step 2 - User authenticates** (platform-agnostic)

**Step 3 - Callback URL format:**
```
yourapp://callback?code=01ABCDEF&state=random_string
```

**Step 4 - Exchange code for tokens (backend only):**
```http
POST https://api.workos.com/user_management/authenticate
Content-Type: application/json

{
  "client_id": "client_123",
  "client_secret": "sk_secret",  // NEVER in mobile app
  "code": "01ABCDEF",
  "grant_type": "authorization_code"
}
```

**Response:**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "ey_refresh...",
  "user": {
    "id": "user_01...",
    "email": "user@example.com",
    ...
  }
}
```

#### Platform-Specific (Different Implementations):

| Step | Web | iOS | Android | Capacitor |
|------|-----|-----|---------|-----------|
| Open auth URL | `window.location` | `ASWebAuthenticationSession` | `Custom Tabs` | `Browser.open()` |
| Receive callback | HTTP redirect to route | URL type interception | Intent filter | `App.addListener('appUrlOpen')` |
| Parse callback | Route handler | Completion handler | `onNewIntent()` | Event handler |

**Everything else is identical.**

---

### "RBAC Migration from Auth0"

After authentication, you need role data. WorkOS stores this in organization memberships:

```typescript
// Call from your backend
const membership = await workos.userManagement.getOrganizationMembership({
  userId: 'user_01...',
  organizationId: 'org_01...'
});

const role = membership.role;  // { slug: 'admin', name: 'Admin' }
```

**Middleware pattern** (see `backend/server.js` lines 115-140):

```javascript
async function requireRole(requiredRole) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifyToken(token);

    const membership = await workos.userManagement.getOrganizationMembership({
      organizationId: user.organizationId,
      userId: user.id,
    });

    if (membership.role.slug !== requiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Usage
app.get('/api/admin', requireRole('admin'), handler);
```

Your mobile app sends the access token with each request:
```typescript
fetch('/api/admin', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

---

## What Your Capacitor Plugin Should Do

Based on your description, you wrote a native plugin to handle authentication callbacks. Here's what it needs to do:

### Minimum Implementation:

```typescript
// 1. Register URL listener (one line)
App.addListener('appUrlOpen', handleCallback);

// 2. Parse callback URL (four lines)
function handleCallback(event) {
  const url = new URL(event.url);
  const code = url.searchParams.get('code');
  sendToBackend(code);
}

// 3. Open browser (one line)
Browser.open({ url: authUrl });
```

**That's it.** You don't need complex native code.

### What You DON'T Need:

- Custom native modules for URL handling (Capacitor's `App` plugin does this)
- Custom browser implementation (Capacitor's `Browser` plugin handles this)
- Token exchange logic in the app (backend does this)
- Webview manipulation (system browser is better)

### What You DO Need:

1. **Register custom URL scheme** in `capacitor.config.ts`
2. **Listen for callback** with `App.addListener`
3. **Call your backend** to exchange code for tokens
4. **Store tokens securely** (use `@capacitor-community/secure-storage-plugin`)

---

## Reference Implementation

The complete working example is in `capacitor-app/`.

**Key files:**

1. **`src/auth.ts`** - Shows exactly what your plugin should do
2. **`capacitor.config.ts`** - URL scheme configuration
3. **`ios-url-scheme.xml`** - iOS Info.plist snippet
4. **`android-intent-filter.xml`** - Android manifest snippet

**To run it:**

```bash
cd capacitor-app
npm install
npm run build
npx cap add ios  # or android
npm run sync
npm run open:ios  # or open:android
```

---

## Common Misconceptions

### ❌ "I need to implement OAuth in native code"

**✅ Correct:** Use Capacitor plugins. They handle everything.

### ❌ "The callback is a complex native callback mechanism"

**✅ Correct:** It's just a URL string. Parse it like any URL.

### ❌ "I need to handle different OAuth flows for iOS and Android"

**✅ Correct:** The OAuth protocol is identical. Only URL handling differs, which Capacitor abstracts.

### ❌ "I should exchange tokens client-side"

**✅ Correct:** ALWAYS exchange on backend. Client secret must never be in mobile app.

---

## Testing Checklist

- [ ] Backend running and accessible
- [ ] WorkOS redirect URI configured (`yourscheme://callback`)
- [ ] Custom URL scheme registered in app
- [ ] Can click "Sign In" and browser opens
- [ ] Can complete auth in browser
- [ ] App comes to foreground after auth
- [ ] Callback URL is received and logged
- [ ] Code is extracted from URL
- [ ] Backend exchange succeeds
- [ ] Tokens are stored
- [ ] User info is displayed

**Debug by checking logs at each step.**

---

## Next Steps

1. **Run the demo** to see the flow
2. **Compare with your plugin** - likely you overcomplicated it
3. **Use Capacitor plugins** instead of custom native code
4. **Implement RBAC** using the backend middleware pattern
5. **Test on real devices** with ngrok for backend

---

## Questions?

The code is your documentation. Read:

- `capacitor-app/src/auth.ts` - The complete OAuth flow
- `backend/server.js` - Backend token exchange
- `capacitor-app/README.md` - Full setup guide

The protocol is simple. The confusion comes from thinking it's more complex than it is.
