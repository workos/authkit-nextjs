# Quick Start Guide

Get the demo running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- WorkOS account ([sign up](https://workos.com))
- WorkOS Client ID and API Key

## Step 1: Get WorkOS Credentials

1. Go to [WorkOS Dashboard](https://dashboard.workos.com/)
2. Create a new application or use existing one
3. Note your **Client ID** (starts with `client_`)
4. Generate an **API Key** (starts with `sk_`)
5. In **Redirects**, add: `http://localhost:3000/callback`

## Step 2: Setup Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and add your credentials:
```
WORKOS_API_KEY=sk_test_your_api_key_here
WORKOS_CLIENT_ID=client_your_client_id_here
```

Start the server:
```bash
npm start
```

You should see:
```
🚀 WorkOS Mobile Auth Demo Backend
📡 Server running on http://localhost:3001
```

## Step 3: Setup Frontend

In a new terminal:

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000 in your browser.

## Step 4: Test the Flow

1. Click **"Sign In with WorkOS"**
2. You'll be redirected to WorkOS AuthKit
3. Create an account or sign in
4. You'll be redirected back to the demo
5. Your user information will be displayed

## What Just Happened?

1. **Frontend** generated an authorization URL
2. **Browser** redirected to WorkOS for authentication
3. **WorkOS** authenticated you and redirected back with a code
4. **Frontend** sent the code to the backend
5. **Backend** exchanged the code for tokens using your client secret
6. **Backend** returned tokens and user info to frontend
7. **Frontend** stored tokens and displayed user info

## Next Steps

### Test Token Refresh
Click the **"Refresh Token"** button to get new access tokens without re-authenticating.

### Test with Mobile (Optional)

1. Install ngrok: `npm install -g ngrok`
2. Expose your backend: `ngrok http 3001`
3. Update frontend's backend URL to the ngrok URL
4. Test from a mobile device

### Implement in Your Capacitor App

See the comments in `frontend/index.html` for Capacitor-specific code.

Key changes needed:
- Replace `window.location` with `Browser.open()`
- Add `App.addListener('appUrlOpen')` for callbacks
- Use `Preferences` or secure storage instead of localStorage
- Register custom URL scheme (e.g., `myapp://`)

## Troubleshooting

### Backend won't start
- Check that .env file exists and has correct credentials
- Verify Node.js 18+ is installed: `node --version`
- Check port 3001 isn't already in use

### "Invalid redirect_uri" error
- Make sure you added `http://localhost:3000/callback` to WorkOS Dashboard
- Check the redirect URI in frontend matches exactly

### Frontend can't connect to backend
- Verify backend is running on port 3001
- Check backend URL in frontend (default: http://localhost:3001)
- Open browser console for detailed error messages

### Authentication redirects but nothing happens
- Check browser console for errors
- Verify the code parameter is in the URL after redirect
- Check backend logs for token exchange errors

## Understanding the Code

### Backend (`backend/server.js`)
- **POST /auth/url** - Generates WorkOS authorization URL
- **POST /auth/callback** - Exchanges code for tokens (requires client secret)
- **POST /auth/refresh** - Refreshes access token
- **POST /auth/roles** - Gets user roles for RBAC

### Frontend (`frontend/index.html`)
- **startAuth()** - Initiates OAuth flow
- **handleCallback()** - Processes redirect with code
- **exchangeCodeForTokens()** - Calls backend to get tokens
- **refreshToken()** - Gets new tokens using refresh token

## Protocol Summary

```
┌──────────┐          ┌─────────┐          ┌─────────┐
│ Frontend │          │ WorkOS  │          │ Backend │
└─────┬────┘          └────┬────┘          └────┬────┘
      │                    │                     │
      │ 1. Get auth URL    │                     │
      ├───────────────────────────────────────>│
      │                    │                     │
      │ 2. Auth URL        │                     │
      │<──────────────────────────────────────┤
      │                    │                     │
      │ 3. Redirect        │                     │
      ├──────────────────>│                     │
      │                    │                     │
      │ 4. User authenticates                    │
      │                    │                     │
      │ 5. Redirect with code                    │
      │<───────────────────┤                     │
      │                    │                     │
      │ 6. Send code       │                     │
      ├───────────────────────────────────────>│
      │                    │                     │
      │                    │ 7. Exchange code    │
      │                    │<────────────────────┤
      │                    │                     │
      │                    │ 8. Return tokens    │
      │                    ├────────────────────>│
      │                    │                     │
      │ 9. Return tokens & user                  │
      │<──────────────────────────────────────┤
      │                    │                     │
```

## Security Notes

- The backend uses your client secret - never expose this in frontend code
- The authorization code is single-use and expires in 10 minutes
- Access tokens typically expire after 1 hour
- Refresh tokens are long-lived and should be stored securely
- Always exchange codes on the backend, never client-side

## Additional Resources

- [Main README](README.md) - Comprehensive protocol documentation
- [Backend README](backend/README.md) - Backend API documentation
- [Frontend README](frontend/README.md) - Capacitor translation guide
- [WorkOS Docs](https://workos.com/docs/user-management/authkit) - Official documentation
