# Backend Server

Express server that handles OAuth code exchange and token management for mobile and desktop apps.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your WorkOS credentials to `.env`:
```
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
```

Get these from [WorkOS Dashboard](https://dashboard.workos.com/).

## Running

```bash
npm start
```

Server will start on http://localhost:3001

## API Endpoints

### POST /auth/url
Generate WorkOS authorization URL.

**Request:**
```json
{
  "redirectUri": "http://localhost:3000/callback",
  "state": "optional-state",
  "organizationId": "org_123" // optional
}
```

**Response:**
```json
{
  "authorizationUrl": "https://api.workos.com/user_management/authorize?..."
}
```

### POST /auth/callback
Exchange authorization code for tokens.

**Request:**
```json
{
  "code": "01ABCDEF..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "ey_refresh...",
  "user": {
    "id": "user_01...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "emailVerified": true,
    "profilePictureUrl": "https://..."
  },
  "organizationId": "org_01...",
  "impersonator": null
}
```

### POST /auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "ey_refresh..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "ey_refresh..."
}
```

### POST /auth/roles
Get user's organization membership and roles (RBAC).

**Request:**
```json
{
  "userId": "user_01...",
  "organizationId": "org_01..."
}
```

**Response:**
```json
{
  "userId": "user_01...",
  "organizationId": "org_01...",
  "role": {
    "slug": "admin",
    "name": "Admin"
  },
  "status": "active"
}
```

### POST /auth/verify
Verify access token validity.

**Request:**
```json
{
  "accessToken": "eyJhbGc..."
}
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "user_01...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### GET /api/protected
Example protected endpoint requiring Bearer token.

**Headers:**
```
Authorization: Bearer eyJhbGc...
```

**Response:**
```json
{
  "message": "This is a protected endpoint",
  "user": {
    "id": "user_01...",
    "email": "user@example.com"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Testing with curl

### Generate authorization URL:
```bash
curl -X POST http://localhost:3001/auth/url \
  -H "Content-Type: application/json" \
  -d '{"redirectUri": "http://localhost:3000/callback"}'
```

### Exchange code for tokens:
```bash
curl -X POST http://localhost:3001/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "01ABCDEF..."}'
```

### Refresh token:
```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "ey_refresh..."}'
```

### Get user roles:
```bash
curl -X POST http://localhost:3001/auth/roles \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_01...",
    "organizationId": "org_01..."
  }'
```

### Access protected endpoint:
```bash
curl -X GET http://localhost:3001/api/protected \
  -H "Authorization: Bearer eyJhbGc..."
```

## Deploying

For mobile app testing, you need to expose this server to the internet. Options:

### 1. ngrok (easiest for local development)
```bash
npm install -g ngrok
ngrok http 3001
```

Use the ngrok URL in your mobile app.

### 2. Deploy to Vercel/Railway/Render
Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

Deploy:
```bash
vercel
```

## Notes

- The client secret is only used on the backend, never exposed to the client
- All token exchanges require the client secret for security
- Access tokens typically expire after 1 hour
- Refresh tokens should be stored securely and used to get new access tokens
- Always verify tokens on the backend for protected routes
